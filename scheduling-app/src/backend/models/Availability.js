"use strict";
const { Schema, model } = require("mongoose");

// One document per staff member. `days` maps day-of-week (0=Sun … 6=Sat,
// as a string key since Mongoose Mixed doesn't allow numeric keys directly)
// to an array of { start, end } blocks in decimal hours.
const availabilitySchema = new Schema(
  {
    staffId: { type: Number, required: true, unique: true },
    days: { type: Schema.Types.Mixed, default: {} },
    note: { type: String, default: "" },
    submittedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

module.exports = model("Availability", availabilitySchema);
