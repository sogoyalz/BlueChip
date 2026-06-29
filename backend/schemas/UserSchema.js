const { Schema } = require("mongoose");
const bcrypt = require("bcrypt");

const UserSchema = new Schema({
  email:     { type: String, required: true, unique: true },
  username:  { type: String, required: true },
  password:  { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Runs automatically RIGHT BEFORE a user is saved
UserSchema.pre("save", async function () {
  this.password = await bcrypt.hash(this.password, 12);
});

module.exports = { UserSchema };
