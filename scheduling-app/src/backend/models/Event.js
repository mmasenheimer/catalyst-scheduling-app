"use strict";

const { Schema, model } = require("mongoose");

const eventSchema = new Schema(
  {
    _id: { type: Number },
    name: { type: String, required: true },
    type: { type: String },
    start: { type: Number, required: true }, // This is for program, service, workshop, meeting, etc
    end: { type: Number, required: true },
    staffNeeded: { type: Number, default: 1 },
    assignedStaff: [{ type: Number }], // Going to be the array of staff ids
    notes: { type: String, default: "" },
    days: [{ type: String }], // YYYY-MM-DD strings
    repeating: { type: Boolean, default: false },
    // Optional bounds on a weekly recurrence (YYYY-MM-DD). Unset means
    // open-ended on that side, which is how repeating events behaved before
    // these existed.
    repeatFrom: { type: String, default: null },
    repeatUntil: { type: String, default: null },
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

module.exports = model("Event", eventSchema);
