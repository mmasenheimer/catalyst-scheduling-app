'use strict';
const { Schema, model } = require('mongoose');

// One document per calendar date. Upserted when the manager hits Finalize.
const scheduleSchema = new Schema({
  date:        { type: String, required: true, unique: true }, // YYYY-MM-DD
  staff:       [Schema.Types.Mixed], // snapshot of orderedStaff array
  events:      [Schema.Types.Mixed], // snapshot of todayEvents array
  finalizedAt: { type: Date, default: Date.now },
});

module.exports = model('Schedule', scheduleSchema);
