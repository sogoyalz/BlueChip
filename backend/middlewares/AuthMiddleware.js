const { UserModel } = require("../model/UserModel");
require("dotenv").config();
const jwt = require("jsonwebtoken");

// Used by the frontend's "am I still logged in?" check (POST /).
// Responds with a status flag rather than calling next().
module.exports.userVerification = (req, res) => {
  const token = req.cookies.token;   // read the cookie

  if (!token) {
    return res.json({ status: false });   // no token = not logged in
  }

  jwt.verify(token, process.env.TOKEN_KEY, async (err, data) => {
    if (err) {
      return res.json({ status: false });   // token is fake/expired
    } else {
      const user = await UserModel.findById(data.id);   // data.id came from the token payload
      if (user) return res.json({ status: true, user: user.username });
      else return res.json({ status: false });
    }
  });
};

// Route GUARD for protected data endpoints. On success calls next();
// otherwise responds 401. Accepts the token from the cookie, an
// Authorization: Bearer header, or a ?token= query param (the dashboard
// lives on a different origin, so the header/query fallbacks matter).
module.exports.verifyToken = (req, res, next) => {
  const bearer = req.headers.authorization;
  const token =
    req.cookies.token ||
    (bearer && bearer.startsWith("Bearer ") ? bearer.slice(7) : null) ||
    req.query.token;

  if (!token) {
    return res.status(401).json({ status: false, message: "No token provided" });
  }

  jwt.verify(token, process.env.TOKEN_KEY, async (err, data) => {
    if (err) {
      return res.status(401).json({ status: false, message: "Invalid or expired token" });
    }
    const user = await UserModel.findById(data.id);
    if (!user) {
      return res.status(401).json({ status: false, message: "User not found" });
    }
    req.user = user;   // make the authenticated user available downstream
    next();
  });
};
