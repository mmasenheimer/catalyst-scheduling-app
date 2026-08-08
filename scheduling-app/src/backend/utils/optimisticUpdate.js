"use strict";

/**
 * A findOneAndUpdate that refuses to apply on top of somebody else's write.
 *
 * `Schedule`, `Event` and `Template` are all replaced wholesale rather than
 * merged — a save sends the entire record — so a lost update is total, not
 * partial: the losing write does not lose one field, it discards everything the
 * other side did. That is why these need a precondition and most collections do
 * not.
 *
 * The precondition is expressed inside the query rather than as a read followed
 * by a write, so two clients acting at the same instant cannot both pass it.
 *
 * **Opt-in by design.** When `expectedVersion` is absent the update applies
 * unconditionally, exactly as before. That keeps clients that do not yet send a
 * version working, and matters more than it looks: a fire-and-forget client that
 * sends a *stale* version is worse off than one that sends none, because it
 * would 409 against its own in-flight write and — if it swallows errors — lose
 * the change silently. A client should only start sending a version once it
 * reconciles its local copy from the response.
 *
 * Returns `{ doc }` on success, or `{ conflict: true, currentVersion }` when the
 * record moved. Returns `{ doc: null }` when there is no such record at all, so
 * callers can tell 404 from 409.
 */
async function updateWithVersion(Model, filter, changes, expectedVersion) {
  const checkVersion = Number.isInteger(expectedVersion);

  const query = { ...filter };
  if (checkVersion) {
    // Records written before `version` existed have no such field, and Mongo
    // will not match a missing field against 0 — so spell both out, or every
    // update against older data would report a phantom conflict.
    query.$and = [
      expectedVersion === 0
        ? { $or: [{ version: 0 }, { version: { $exists: false } }] }
        : { version: expectedVersion },
    ];
  }

  const doc = await Model.findOneAndUpdate(
    query,
    { $set: changes, $inc: { version: 1 } },
    { new: true, runValidators: true },
  );
  if (doc) return { doc };

  // Nothing matched. Either the record is gone, or it is there at a version we
  // did not expect — the caller needs to tell those apart.
  const existing = await Model.findOne(filter).lean();
  if (!existing) return { doc: null };
  if (!checkVersion) return { doc: null };
  return { conflict: true, currentVersion: existing.version ?? 0 };
}

module.exports = { updateWithVersion };
