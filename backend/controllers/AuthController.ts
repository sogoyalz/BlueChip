import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { UserModel } from "../model/UserModel";
import { createSecretToken } from "../util/SecretToken";

// REGISTER
export const Signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      res.status(400).json({ success: false, message: "All fields are required" });
      return;
    }

    // 1. Is this email already taken?
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      res.status(409).json({ success: false, message: "User already exists" });
      return;
    }

    // 2. Create the user (the pre-save hook hashes the password)
    const user = await UserModel.create({ email, password, username });

    // 3. Sign a token and put it in a cookie
    const token = createSecretToken(user._id);
    res.cookie("token", token, {
      httpOnly: false,
    });

    // 4. Tell the frontend it worked — never echo back the password hash
    res.status(201).json({
      message: "User signed up successfully",
      success: true,
      user: { id: user._id, email: user.email, username: user.username },
      token,
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

    // 1. Find the user by email
    const user = await UserModel.findOne({ email });
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
    const token = createSecretToken(user._id);
    res.cookie("token", token, {
      httpOnly: false,
    });

    res.status(200).json({ message: "User logged in successfully", success: true, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
