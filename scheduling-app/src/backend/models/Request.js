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
//   withdrawn     the person who asked took it back, from either waiting state
//
// 'pending' deliberately keeps its original meaning of "on the manager's desk",
// so requests written before the peer stage existed are still valid as-is.
//
// Note which states are *waiting* rather than decided: pending_peer and pending.
// Nothing has been applied to the schedule in either, which is why a requester can
// withdraw from both — the change only happens on manager approval.
const requestSchema = new Schema(
  {
    type: { type: String, enum: ["time_off", "cover", "swap"], required: true },
    status: {
      type: String,
      enum: ["pending_peer", "pending", "approved", "denied", "declined", "withdrawn"],
      default: "pending",
    },
    staffId: { type: Number, required: true },
    staffName: { type: String, required: true },
    targetStaffId: { type: Number, default: null },
    targetName: { type: String, default: null },
    date: { type: String, required: true }, // YYYY-MM-DD
    dayLabel: { type: String, default: "" },
    // What the shifts looked like when this was agreed to, as [{ start, end }].
    //
    // A request is a record of an agreement about specific hours, but approval can
    // come days later — and until now nothing remembered which hours those were.
    // The manager reschedules somebody in the meantime and approving the request
    // silently exchanges whatever shifts happen to exist by then, which is not
    // what either party said yes to. Approval compares against these and refuses
    // if they've moved. Absent on requests written before this existed, in which
    // case the check is skipped rather than failing them all.
    requesterShifts: { type: [Schema.Types.Mixed], default: undefined },
    targetShifts: { type: [Schema.Types.Mixed], default: undefined },
    // Which single shift is actually changing hands, as { start, end }.
    //
    // A day can hold more than one shift, and a cover or swap concerns exactly
    // one of them — without this, approving moved the person's entire day.
    // Identified by its hours rather than its id because shift ids are minted
    // fresh on every drag, by the event-stretch pass, and by the cover approval
    // itself, so an id says nothing a day later. The hours are what was agreed.
    //
    // Only set on 'cover' and 'swap'. A drop request gives up the whole day, so
    // it keeps using requesterShifts alone. Requests written before this existed
    // have neither, and approval falls back to moving everything — which is what
    // they meant at the time.
    requesterShift: { type: Schema.Types.Mixed, default: undefined },
    targetShift: { type: Schema.Types.Mixed, default: undefined },
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
