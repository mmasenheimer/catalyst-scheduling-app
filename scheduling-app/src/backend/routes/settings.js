"use strict";
const router = require("express").Router();
const Settings = require("../models/Settings");
const { requireManager } = require("../middleware/auth");
const { sendWriteError } = require("../utils/respond");

const STUDIO_KEY = "studio";

// The defaults a missing document stands for. Returned rather than written on
// read, so a fresh install needs no seeding step and a GET stays a GET.
const DEFAULTS = { vrEnabled: true };

function shape(doc) {
  return { vrEnabled: doc?.vrEnabled ?? DEFAULTS.vrEnabled };
}

// GET /api/settings → { vrEnabled }
//
// Readable by any signed-in user, not just managers: employees' own views have to
// know whether VR exists to render themselves correctly.
router.get("/", async (req, res) => {
  try {
    res.json(shape(await Settings.findOne({ key: STUDIO_KEY })));
  } catch (err) {
    sendWriteError(res, err);
  }
});

// PATCH /api/settings  { vrEnabled? } → { vrEnabled }
//
// Manager-only: this changes what the whole studio sees. A partial, so adding a
// second setting later can't have this one overwrite it.
router.patch("/", requireManager, async (req, res) => {
  try {
    const body = req.body ?? {};
    const update = {};
    if ("vrEnabled" in body) {
      if (typeof body.vrEnabled !== "boolean") {
        return res.status(400).json({ error: "vrEnabled must be true or false" });
      }
      update.vrEnabled = body.vrEnabled;
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No settings given to update" });
    }
    update.updatedAt = new Date();
    // Upsert: the document doesn't exist until something is actually changed.
    const doc = await Settings.findOneAndUpdate(
      { key: STUDIO_KEY },
      { $set: update, $setOnInsert: { key: STUDIO_KEY } },
      { new: true, upsert: true },
    );
    res.json(shape(doc));
  } catch (err) {
    sendWriteError(res, err);
  }
});

module.exports = router;
