const { UserModel } = require("../model/UserModel");
const { createSecretToken } = require("../util/SecretToken");
const bcrypt = require("bcrypt");

// REGISTER
module.exports.Signup = async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // 1. Is this email already taken?
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return res.json({ message: "User already exists" });
    }

    // 2. Create the user (the pre-save hook hashes the password)
    const user = await UserModel.create({ email, password, username });

    // 3. Sign a token and put it in a cookie
    const token = createSecretToken(user._id);
    res.cookie("token", token, {
      withCredentials: true,
      httpOnly: false,
    });

    // 4. Tell the frontend it worked
    res.status(201).json({ message: "User signed up successfully", success: true, user, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// LOGIN
module.exports.Login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({ message: "All fields are required" });
    }

    // 1. Find the user by email
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.json({ message: "Incorrect password or email" });
    }

    // 2. Compare the typed password with the stored hash
    const auth = await bcrypt.compare(password, user.password);
    if (!auth) {
      return res.json({ message: "Incorrect password or email" });
    }

    // 3. Correct! Sign a token and set the cookie
    const token = createSecretToken(user._id);
    res.cookie("token", token, {
      withCredentials: true,
      httpOnly: false,
    });

    res.status(201).json({ message: "User logged in successfully", success: true, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
