"use strict";
const { Schema, model } = require("mongoose");

// type: 'time_off' | 'cover' | 'swap'
//
// status — a cover/swap request has to clear the coworker it names before it
// reaches the manager, so there are two waiting states:
//   pending_peer  waiting on the target coworker to accept (cover/swap only)
//   pending       waiting on the manager (where time_off starts, and where
//                 cover/swap land once the peer accepts)
//   approved      manager approved; the schedule change has been applied
//   denied        manager said no
//   declined      the target coworker said no — terminal, never reaches the manager
//
// 'pending' deliberately keeps its original meaning of "on the manager's desk",
// so requests written before the peer stage existed are still valid as-is.
const requestSchema = new Schema(
  {
    type: { type: String, enum: ["time_off", "cover", "swap"], required: true },
    status: {
      type: String,
      enum: ["pending_peer", "pending", "approved", "denied", "declined"],
      default: "pending",
    },
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
