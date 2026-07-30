"use strict";
const Counter = require("../models/Counter");

// Create a document with a client-compatible numeric _id.
//
// Ids come from a per-model counter that only ever moves forward. The obvious
// alternative — max(_id) + 1 — reuses an id the moment the highest-numbered
// document is deleted, and that's dangerous here: availability, requests and
// notifications are all keyed by the numeric staffId, so a new hire handed a
// departed employee's id would inherit their availability and receive their
// notifications. A counter makes ids permanently unique instead.
//
// The counter is seeded from the collection's current maximum the first time it's
// used, so adopting it on a database that already has data doesn't hand out ids
// that are already taken.

async function currentMax(Model) {
  const last = await Model.findOne().sort({ _id: -1 }).select("_id").lean();
  return typeof last?._id === "number" ? last._id : 0;
}

async function nextId(Model) {
  const key = Model.modelName;

  // Seed on first use. $setOnInsert makes this a no-op once the row exists, and
  // two concurrent callers can't both insert — one wins, the other no-ops — so
  // this is safe without a transaction.
  await Counter.updateOne(
    { _id: key },
    { $setOnInsert: { seq: await currentMax(Model) } },
    { upsert: true },
  );

  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true },
  );
  return counter.seq;
}

// Raise the counter to at least the collection's real maximum. Used to recover
// if the two ever drift — e.g. documents inserted directly, outside this helper.
// $max only ever increases the value, so this can't move ids backwards.
async function resyncCounter(Model) {
  await Counter.updateOne(
    { _id: Model.modelName },
    { $max: { seq: await currentMax(Model) } },
    { upsert: true },
  );
}

async function createWithNextId(Model, data, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const _id = await nextId(Model);
    try {
      return await Model.create({ _id, ...data });
    } catch (err) {
      // A duplicate means the counter had fallen behind the collection (a
      // document created outside this helper). Catch it up and try again; the
      // unique _id index is the final arbiter either way.
      if (err && err.code === 11000 && attempt < attempts - 1) {
        await resyncCounter(Model);
        continue;
      }
      throw err;
    }
  }
  // Unreachable: the loop either returns a doc or throws on the last attempt.
  throw new Error("createWithNextId: exhausted retries");
}

module.exports = { createWithNextId, nextId, resyncCounter };
