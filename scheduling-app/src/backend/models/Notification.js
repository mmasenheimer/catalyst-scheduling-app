"use strict";
const { Schema, model } = require("mongoose");

// recipients: 'all' | 'manager' | [staffId, ...]
// requestId: links back to a Request doc — present for coverage/shift_change
// notifications spawned by the request pipeline, null for standalone ones
// (availability submissions, system alerts, etc).
const notificationSchema = new Schema(
  {
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    from: { type: String, default: "" },
    recipients: { type: Schema.Types.Mixed, required: true },
    requestId: { type: Schema.Types.Mixed, default: null },
    read: { type: Boolean, default: false },
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

module.exports = model("Notification", notificationSchema);
