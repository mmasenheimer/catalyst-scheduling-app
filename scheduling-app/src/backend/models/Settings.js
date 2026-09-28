"use strict";
const { Schema, model } = require("mongoose");

// Studio-wide settings — one document for the whole installation, not one per
// user. These describe how the studio itself runs, so everyone sees the same
// answer: an employee's Team Schedule and the manager's Weekly view must agree on
// whether there is a VR post at all.
//
// Pinned to a fixed `key` rather than relying on "the only document in the
// collection". A unique index on it means a race between two upserts can't leave
// two settings documents behind for readers to pick between.
const settingsSchema = new Schema({
  key: { type: String, required: true, unique: true, default: "studio" },
  // Whether the studio runs the VR studio post. Turned off, VR disappears from
  // every view and the template generator stops assigning it.
  //
  // Deliberately non-destructive: VR turns already saved on past and future days
  // stay in the database untouched and simply aren't shown or acted on, so this
  // is reversible. Turning VR back on brings every existing turn back rather than
  // leaving holes in schedules that were already published.
  vrEnabled: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = model("Settings", settingsSchema);
