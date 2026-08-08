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
    // Bumped on every write. An update may carry the version it was based on,
    // and then only applies if that is still current — so two managers (or two
    // tabs) cannot silently overwrite each other. Enforced only when the client
    // sends `expectedVersion`, matching Schedule: a client that does not send
    // one keeps the previous last-write-wins behaviour rather than breaking.
    //
    // Documents written before this field existed have no `version`, which the
    // routes treat as 0 so they keep working without a migration.
    version: { type: Number, default: 0 },
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
