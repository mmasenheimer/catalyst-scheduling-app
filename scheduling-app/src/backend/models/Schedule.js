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
});

module.exports = model('Schedule', scheduleSchema);
