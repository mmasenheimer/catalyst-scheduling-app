"use strict";

// Create a document with a client-compatible numeric _id (max existing + 1).
//
// The read-then-write is inherently racy — two concurrent creates can compute
// the same next id — so we rely on the unique _id index as the arbiter: the
// loser of the race gets a duplicate-key error (E11000), recomputes the next
// id, and retries. This keeps the numeric ids the frontend expects without a
// separate counters collection or a migration of already-seeded data.
async function createWithNextId(Model, data, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const last = await Model.findOne().sort({ _id: -1 }).select("_id").lean();
    const nextId = (last?._id ?? 0) + 1;
    try {
      return await Model.create({ _id: nextId, ...data });
    } catch (err) {
      // Duplicate _id from a concurrent insert — retry with a fresh max.
      if (err && err.code === 11000 && attempt < attempts - 1) continue;
      throw err;
    }
  }
  // Unreachable: the loop either returns a doc or throws on the last attempt.
  throw new Error("createWithNextId: exhausted retries");
}

module.exports = { createWithNextId };
