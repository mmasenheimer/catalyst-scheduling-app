"use strict";
const { Schema, model } = require("mongoose");

// How long a notification survives. Exported so the migration script and any
// future retention change read the same number.
const NOTIFICATION_TTL_SECONDS = 90 * 24 * 60 * 60;

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
    // Individual change lines for notifications that accumulate (a schedule
    // change touching several days collapses into one notification whose
    // message is rebuilt from these).
    details: { type: [String], default: undefined },
    read: { type: Boolean, default: false },
    // Sorted by on every list fetch, and the basis for expiry.
    //
    // Nothing in the application deletes a notification, and the list endpoint
    // is polled every 45 seconds — so without a ceiling the payload grows
    // forever while the fetch frequency stays constant. At this database's own
    // observed rate (~30/day) that reaches roughly 1 MB per poll after three
    // months and 4 MB after a year, per logged-in browser.
    //
    // 90 days is well beyond anything actionable: requests are filed at most
    // three weeks out, so nothing that old still has a decision attached. Unread
    // rows expire too — an unread notification from three months ago is history,
    // not a task.
    //
    // Mongo does the deleting, on its own schedule, with no application code.
    // Adding this to an existing database needs the old plain index dropped
    // first; see `npm run migrate:notif-ttl`.
    createdAt: { type: Date, default: Date.now, expires: NOTIFICATION_TTL_SECONDS },
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

const Notification = model("Notification", notificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TTL_SECONDS = NOTIFICATION_TTL_SECONDS;
