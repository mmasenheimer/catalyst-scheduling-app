'use strict';
require('dotenv').config();

// One-time: give `notifications.createdAt` a TTL so Mongo expires old rows.
//
// The collection already had a plain index on that field. Mongoose cannot change
// an existing index's options in place — it sees the key already indexed, leaves
// it alone, and the TTL silently never takes effect. So the old index has to be
// dropped before the new one can be built. That is the whole reason this is a
// script rather than something that happens on boot.
//
//   npm run migrate:notif-ttl            reports what it would do
//   npm run migrate:notif-ttl -- --yes   does it
//
// Safe to run more than once: if the TTL index is already correct it says so and
// changes nothing. Safe in production — it touches indexes, not documents.
//
// Note that creating the index causes Mongo to begin expiring rows older than
// the TTL within a minute or two. That deletion is real and not reversible, so
// the dry run reports how many rows are already past the cutoff.

const { connect } = require('./db');
const Notification = require('./models/Notification');
const { NOTIFICATION_TTL_SECONDS } = require('./models/Notification');

const FIELD = 'createdAt';
const days = NOTIFICATION_TTL_SECONDS / 86400;

async function main() {
  await connect();
  const col = Notification.collection;
  const confirmed = process.argv.includes('--yes');

  const indexes = await col.indexes();
  const existing = indexes.find(i => {
    const keys = Object.keys(i.key);
    return keys.length === 1 && keys[0] === FIELD;
  });

  const total = await Notification.countDocuments({});
  const cutoff = new Date(Date.now() - NOTIFICATION_TTL_SECONDS * 1000);
  const expiring = await Notification.countDocuments({ [FIELD]: { $lt: cutoff } });

  console.log(`\nnotifications: ${total} rows`);
  console.log(`retention:     ${days} days (older than ${cutoff.toISOString().slice(0, 10)})`);
  console.log(`already past:  ${expiring} row(s) — Mongo will remove these shortly after the index exists`);

  if (existing?.expireAfterSeconds === NOTIFICATION_TTL_SECONDS) {
    console.log(`\nIndex "${existing.name}" already has the right TTL. Nothing to do.\n`);
    process.exit(0);
  }

  console.log(existing
    ? `\ncurrent index: ${existing.name}` +
      (existing.expireAfterSeconds === undefined
        ? ' (no TTL — needs replacing)'
        : ` (TTL ${existing.expireAfterSeconds}s — needs changing)`)
    : `\nno index on ${FIELD} yet — one will be created`);

  if (!confirmed) {
    console.log(`\nRe-run with --yes to apply:\n   npm run migrate:notif-ttl -- --yes\n`);
    process.exit(0);
  }

  if (existing) {
    await col.dropIndex(existing.name);
    console.log(`dropped ${existing.name}`);
  }
  await col.createIndex({ [FIELD]: 1 }, { expireAfterSeconds: NOTIFICATION_TTL_SECONDS });
  console.log(`created ${FIELD}_1 with expireAfterSeconds=${NOTIFICATION_TTL_SECONDS}`);

  const after = (await col.indexes()).find(i => i.name === `${FIELD}_1`);
  console.log(`\nverified: ${after.name} TTL=${after.expireAfterSeconds}s (${days} days)\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
