"use strict";
const { Schema, model } = require("mongoose");

// An account that can log in. Kept separate from Staff so auth concerns don't
// pollute the scheduling roster (a manager has no shifts, and Staff drives the
// schedule UI/staffing targets). An employee account links to its Staff row via
// staffId; the manager account has staffId: null.
//
// status: 'invited' — created by a manager, password not set yet (cannot log in)
//         'active'  — password set, can log in
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, default: null },
    role: { type: String, enum: ["manager", "employee"], default: "employee" },
    staffId: { type: Number, default: null },
    status: { type: String, enum: ["invited", "active"], default: "invited" },
    // One-time invite/reset token (stored hashed) — powers both first-time
    // account setup and password reset.
    inviteTokenHash: { type: String, default: null },
    inviteExpires: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        // Never expose credentials or tokens to a client.
        delete ret.passwordHash;
        delete ret.inviteTokenHash;
        return ret;
      },
    },
  },
);

module.exports = model("User", userSchema);
