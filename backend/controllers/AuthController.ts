import { Request, Response, CookieOptions } from "express";
import bcrypt from "bcrypt";
import { UserModel } from "../model/UserModel";
import { createSecretToken } from "../util/SecretToken";

// Shared cookie options for the auth token. httpOnly so an XSS can't read it,
// secure in production (HTTPS only). Logout clears the cookie with the SAME
// options — the browser only removes it when the attributes match.
//
// In production the dashboard is a DIFFERENT origin from this API, so the
// cookie must be sameSite:"none" (with secure:true) to be sent on those
// cross-origin credentialed requests — that's what lets us drop the old
// leak-prone "?token=" URL handoff entirely. Locally everything is http on
// localhost, where sameSite:"none" without HTTPS is rejected, so we fall back
// to "lax".
// In production all three services run under one registrable domain
// (www / app / api subdomains), so the auth cookie is first-party on every
// request and sameSite:"lax" is both sufficient and the safer default —
// it blocks the cross-site CSRF vectors that sameSite:"none" would allow.
// secure:true (HTTPS-only) is kept in production. Locally everything is http
// on localhost, where "lax" also works.
const isProd = process.env.NODE_ENV === "production";
const TOKEN_COOKIE: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax",
};
const TOKEN_MAX_AGE_MS = 12 * 60 * 60 * 1000; // match the JWT's 12-hour lifetime

// Lowercased/trimmed so the lookup matches the schema-normalized stored email.
const normalizeEmail = (email: string): string => email.trim().toLowerCase();
// Deliberately permissive: reject only obviously non-address input; the
// authoritative check is that the address can actually receive mail, which
// is out of scope for this app.
const looksLikeEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// REGISTER
export const Signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      res.status(400).json({ success: false, message: "All fields are required" });
      return;
    }
    if (
      typeof email !== "string" ||
      typeof username !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      username.length > 32 ||
      password.length > 128
    ) {
      res.status(400).json({ success: false, message: "Field too long" });
      return;
    }
    // Minimum only enforced at signup — existing accounts predating the rule
    // must still be able to log in.
    if (password.length < 8) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    if (!looksLikeEmail(normalizedEmail)) {
      res.status(400).json({ success: false, message: "Enter a valid email address" });
      return;
    }

    // 1. Is this email already taken?
    const existingUser = await UserModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(409).json({ success: false, message: "User already exists" });
      return;
    }

    // 2. Create the user (the pre-save hook hashes the password). Two concurrent
    //    signups for one email can both pass the findOne above; the unique index
    //    then rejects the loser with E11000 — turn that into a clean 409 rather
    //    than a generic 500.
    let user;
    try {
      user = await UserModel.create({ email: normalizedEmail, password, username });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        res.status(409).json({ success: false, message: "User already exists" });
        return;
      }
      throw err;
    }

    // 3. Sign a token and put it in a cookie
    const token = createSecretToken(user._id, user.tokenVersion);
    res.cookie("token", token, { ...TOKEN_COOKIE, maxAge: TOKEN_MAX_AGE_MS });

    // 4. Tell the frontend it worked. The token lives only in the httpOnly
    //    cookie above — never in the body (and never the password hash).
    res.status(201).json({
      message: "User signed up successfully",
      success: true,
      user: { id: user._id, email: user.email, username: user.username },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// LOGIN
export const Login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: "All fields are required" });
      return;
    }
    // Same shape checks as Signup. Without them a JSON body like
    // {"email": {"$gt": ""}} reaches the Mongo query below as an operator
    // (NoSQL injection) instead of a value.
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.length > 254 ||
      password.length > 128
    ) {
      res.status(400).json({ success: false, message: "Invalid credentials format" });
      return;
    }

    // 1. Find the user by email (normalized to match the stored form)
    const user = await UserModel.findOne({ email: normalizeEmail(email) });
    if (!user) {
      res.status(401).json({ success: false, message: "Incorrect password or email" });
      return;
    }

    // 2. Compare the typed password with the stored hash
    const auth = await bcrypt.compare(password, user.password);
    if (!auth) {
      res.status(401).json({ success: false, message: "Incorrect password or email" });
      return;
    }

    // 3. Correct! Sign a token and set the cookie
    const token = createSecretToken(user._id, user.tokenVersion);
    res.cookie("token", token, { ...TOKEN_COOKIE, maxAge: TOKEN_MAX_AGE_MS });

    // Token lives only in the httpOnly cookie set above, not the body.
    res.status(200).json({ message: "User logged in successfully", success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// LOGOUT — clears the auth cookie. JWTs are stateless, so any token already
// in a client's hands stays valid until it expires; clearing the cookie is
// the meaningful server-side step for the cookie-based (same-origin) flow.
// Header-based (cross-origin) clients simply drop their stored token.
export const Logout = async (_req: Request, res: Response): Promise<void> => {
  res.clearCookie("token", TOKEN_COOKIE);
  res.status(200).json({ success: true, message: "Logged out" });
};
