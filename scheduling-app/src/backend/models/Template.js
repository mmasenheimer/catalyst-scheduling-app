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
    // Bumped on every write. An update may carry the version it was based on,
    // and then only applies if that is still current — so two managers (or two
    // tabs) cannot silently overwrite each other. Enforced only when the client
    // sends `expectedVersion`, matching Schedule: a client that does not send one
    // keeps the previous last-write-wins behaviour rather than breaking.
    //
    // Documents written before this field existed have no `version`, which the
    // routes treat as 0 so they keep working without a migration.
    version: { type: Number, default: 0 },
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
