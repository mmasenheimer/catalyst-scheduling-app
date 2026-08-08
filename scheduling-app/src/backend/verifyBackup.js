"use strict";
//
// Prove that a backup actually restores.
//
//   npm run backup:verify              # newest archive
//   npm run backup:verify -- <file>    # a specific one
//
// An untested backup is not a backup. This restores the archive into a *scratch
// database* on the same cluster, compares it against live, checks the invariants
// that a restore can silently break, and then drops the scratch copy. Live data
// is never written to, and every guard below exists to keep that true.
//
// Run it after setting backups up, then roughly quarterly. It is also the only
// thing that detects a scheduled job which stopped running months ago.
//
// Two restore hazards this checks for, both found by auditing the data model:
//
//  1. THE TTL. `notifications` has a 90-day TTL index on createdAt. mongorestore
//     recreates indexes, so restoring an archive older than 90 days means every
//     notification in it is already expired and MongoDB deletes them within
//     about a minute — a restore that reports success and silently discards the
//     notification history. `--noIndexRestore` avoids that here, and the real
//     restore procedure in docs/BACKUP.md says the same.
//
//  2. THE ID COUNTERS. mongodump reads collections sequentially, not atomically.
//     If `counters` is dumped before a staff member is created and `staffs`
//     after, the restored counter sits behind the highest existing _id and the
//     next hire collides on a duplicate key. Unlikely at this write volume,
//     invisible until it bites, and one line to check.

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");
const mongoose = require("mongoose");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const BACKUP_DIR =
  process.env.BACKUP_DIR ||
  (process.env.OneDrive
    ? path.join(process.env.OneDrive, "catalyst-backups")
    : path.join(os.homedir(), "catalyst-backups"));
const DB_NAME = process.env.DB_NAME || "test";
const SCRATCH = "restore_check";

// The whole safety of this script rests on never touching the live database.
// Assert it rather than assume it — a future edit that made these equal would
// otherwise turn a verification tool into a data-loss tool.
if (SCRATCH === DB_NAME) {
  console.error("refusing to run: scratch database name equals the live one");
  process.exit(1);
}

function fail(message) {
  console.error(`\nVERIFY FAILED: ${message}`);
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
if (!uri) fail("MONGODB_URI not found in .env");

// Pick the archive: an explicit path, or the newest in the backup directory.
let archive = process.argv[2];
if (!archive) {
  if (!fs.existsSync(BACKUP_DIR)) fail(`no backup directory at ${BACKUP_DIR} — run: npm run backup`);
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((n) => /^catalyst-.*\.archive\.gz$/.test(n))
    .map((n) => ({ n, t: fs.statSync(path.join(BACKUP_DIR, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (files.length === 0) fail(`no archives in ${BACKUP_DIR} — run: npm run backup`);
  archive = path.join(BACKUP_DIR, files[0].n);
}
if (!fs.existsSync(archive)) fail(`no such archive: ${archive}`);

const COLLECTIONS = [
  "staffs", "users", "availabilities", "schedules",
  "events", "templates", "requests", "notifications", "counters",
];

(async () => {
  console.log(`archive : ${path.basename(archive)}  (${(fs.statSync(archive).size / 1024).toFixed(1)} KB)`);
  console.log(`live db : ${DB_NAME}`);
  console.log(`scratch : ${SCRATCH}\n`);

  await mongoose.connect(uri);
  const client = mongoose.connection.getClient();
  const live = client.db(DB_NAME);
  const scratch = client.db(SCRATCH);

  // Start from nothing, so a stale scratch copy can't be mistaken for a
  // successful restore. Dropped explicitly by name rather than via
  // mongorestore --drop: when the failure mode is wiping real data, the target
  // should be spelled out in one obvious place.
  await scratch.dropDatabase();

  const liveCounts = {};
  for (const c of COLLECTIONS) liveCounts[c] = await live.collection(c).countDocuments();

  await mongoose.disconnect();

  console.log("restoring into the scratch database…");
  const result = spawnSync(
    "mongorestore",
    [
      "--uri", uri,
      `--archive=${archive}`,
      "--gzip",
      "--noIndexRestore",              // see hazard 1 above
      `--nsFrom=${DB_NAME}.*`,
      `--nsTo=${SCRATCH}.*`,
      "--quiet",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  if (result.error && result.error.code === "ENOENT") {
    fail("mongorestore is not installed or not on PATH — see docs/BACKUP.md");
  }
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`mongorestore exited with code ${result.status}`);

  await mongoose.connect(uri);
  const client2 = mongoose.connection.getClient();
  const live2 = client2.db(DB_NAME);
  const scratch2 = client2.db(SCRATCH);

  console.log("\ncollection        live   restored");
  let mismatches = 0;
  let restoredTotal = 0;
  for (const c of COLLECTIONS) {
    const l = liveCounts[c];
    const r = await scratch2.collection(c).countDocuments();
    restoredTotal += r;
    // Live may have moved on since the dump, so restored can legitimately be
    // lower. Restored being *higher* is impossible and means the wrong archive
    // or a stale scratch database.
    const bad = r > l || (l > 0 && r === 0);
    if (bad) mismatches += 1;
    console.log(`   ${c.padEnd(15)} ${String(l).padStart(5)}  ${String(r).padStart(9)}  ${bad ? "MISMATCH" : ""}`);
  }

  // Hazard 2: the restored counters must still be ahead of the restored ids.
  console.log("");
  let counterBroken = 0;
  for (const ctr of await scratch2.collection("counters").find().toArray()) {
    const coll = { Staff: "staffs", Event: "events" }[ctr._id];
    if (!coll) continue;
    const top = await scratch2.collection(coll).find().sort({ _id: -1 }).limit(1).toArray();
    const max = top[0] ? top[0]._id : 0;
    const ok = ctr.seq >= max;
    if (!ok) counterBroken += 1;
    console.log(
      `   counter ${String(ctr._id).padEnd(6)} seq=${String(ctr.seq).padStart(3)} vs max ${coll} _id=${String(max).padStart(3)}  ` +
        (ok ? "ok" : "BROKEN — next insert would collide"),
    );
  }

  await scratch2.dropDatabase();
  console.log(`\nscratch database dropped`);
  await mongoose.disconnect();

  if (restoredTotal === 0) fail("the archive restored zero documents — it is not a usable backup");
  if (mismatches > 0) fail(`${mismatches} collection(s) did not restore plausibly`);
  if (counterBroken > 0) fail("restored id counters are behind the restored data");

  console.log(`\nPASSED — ${restoredTotal} documents restored and verified.`);
  console.log("This archive is a real backup.");
})().catch((err) => fail(err.message));
