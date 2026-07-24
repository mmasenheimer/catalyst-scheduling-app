"use strict";
const { Schema, model } = require("mongoose");

// type: 'time_off' | 'cover' | 'swap'
const requestSchema = new Schema(
  {
    type: { type: String, enum: ["time_off", "cover", "swap"], required: true },
    status: { type: String, enum: ["pending", "approved", "denied"], default: "pending" },
    staffId: { type: Number, required: true },
    staffName: { type: String, required: true },
    targetStaffId: { type: Number, default: null },
    targetName: { type: String, default: null },
    date: { type: String, required: true }, // YYYY-MM-DD
    dayLabel: { type: String, default: "" },
    note: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now, index: true }, // sorted by on every list fetch
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

module.exports = model("Request", requestSchema);
