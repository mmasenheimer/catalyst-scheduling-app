"use strict";
const { Schema, model } = require("mongoose");

// An account that can log in. Kept separate from Staff so auth concerns don't
// pollute the scheduling roster (a manager has no shifts, and Staff drives the
// schedule UI/staffing targets). An employee account links to its Staff row via
// staffId; the manager account has staffId: null.
//
// Accounts are provisioned entirely by the manager: they're created with a
// temporary password and mustChangePassword: true. The employee logs in with
// that temp password once and is forced to set their own — after which the
// manager no longer knows it. There's no email; the username is the identity.
const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["manager", "employee"], default: "employee" },
    staffId: { type: Number, default: null },
    // Set on manager-provisioned accounts; cleared once the user sets their own
    // password on first login. Gates the app until they do.
    mustChangePassword: { type: Boolean, default: false },
    // Incremented whenever the password changes. The value is baked into each
    // JWT, so bumping it invalidates every token issued before the change —
    // that's what makes a password reset actually cut off active sessions
    // (JWTs are stateless and can't be revoked individually).
    tokenVersion: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  {
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        // Never expose the credential hash to a client.
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

// One account per staff member. A plain unique index won't do: the manager's
// staffId is null, and Mongo treats null as a value — so a second null-staffId
// account (another manager) would collide. Restricting the index to numeric
// values enforces uniqueness for employees while leaving managers unconstrained.
userSchema.index(
  { staffId: 1 },
  { unique: true, partialFilterExpression: { staffId: { $type: "number" } } },
);

module.exports = model("User", userSchema);
