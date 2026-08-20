"use strict";
const { Schema, model } = require("mongoose");

// _id is set to Number so MongoDB uses the same numeric IDs as the frontend.
const staffSchema = new Schema(
  {
    _id: { type: Number },
    name: { type: String, required: true },
    shiftStart: { type: Number, required: true },
    shiftEnd: { type: Number, required: true },
    deskStart: { type: Number, default: null },
    deskEnd: { type: Number, default: null },
    // VR studio duty, the same shape as the desk scalars above and equally
    // legacy — the live model is the vrShifts array on each day's snapshot.
    vrStart: { type: Number, default: null },
    vrEnd: { type: Number, default: null },
    maxHoursPerWeek: { type: Number, default: null },
  },
  {
    // Rename _id → id and strip __v in every JSON response.
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

module.exports = model("Staff", staffSchema);
