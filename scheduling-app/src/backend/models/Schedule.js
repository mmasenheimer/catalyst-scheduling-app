'use strict';
const { Schema, model } = require('mongoose');

// One document per calendar date. Upserted on Finalize, and also whenever the
// day auto-unfinalizes itself after an edit (see routes/schedules.js).
const scheduleSchema = new Schema({
  date:        { type: String, required: true, unique: true }, // YYYY-MM-DD
  staff:       [Schema.Types.Mixed], // snapshot of orderedStaff array
  events:      [Schema.Types.Mixed], // snapshot of todayEvents array
  finalized:   { type: Boolean, default: true },
  finalizedAt: { type: Date, default: Date.now },
  // The staff snapshot as of the last time this day was *published* (finalized).
  // Schedule-change notifications diff against this rather than `staff`, because
  // the editor's debounced auto-save already writes `staff` while the manager is
  // still working — so by the time they hit Finalize, `staff` matches the
  // incoming payload and a diff against it would always look empty.
  lastPublishedStaff: { type: [Schema.Types.Mixed], default: undefined },
  // Bumped on every write. A save carries the version it was based on, and the
  // update only applies if that's still the current one — so two managers (or two
  // tabs) editing the same day can't silently overwrite each other. Whole-day
  // snapshots make that failure total rather than partial: the losing write
  // doesn't lose one field, it discards everything the other side did.
  //
  // Documents written before this field existed have no `version`, which the
  // route treats as 0 so they keep working without a migration.
  version: { type: Number, default: 0 },
});

module.exports = model('Schedule', scheduleSchema);
