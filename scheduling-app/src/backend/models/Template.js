"use strict";
const { Schema, model } = require("mongoose");

// Templates come in two shapes:
//   week: { days: { Monday: { staff: [...] }, Tuesday: { staff: [...] }, ... } }
//   day:  { staff: [...] }
// Both staff snapshots are free-form (same shape as a Schedule's staff snapshot),
// so this uses Mixed rather than a rigid sub-schema.
const templateSchema = new Schema(
  {
    type: { type: String, enum: ["week", "day"], default: "week" },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    day: { type: String }, // day templates only — which weekday this was captured from
    days: { type: Schema.Types.Mixed }, // week templates only
    staff: { type: Schema.Types.Mixed }, // day templates only
    createdAt: { type: Date, default: Date.now },
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

module.exports = model("Template", templateSchema);
