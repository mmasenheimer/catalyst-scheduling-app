"use strict";
//
// Take a backup of the database.
//
//   npm run backup
//
// Atlas M0 (the free tier) has no automated backups of any kind — cloud
// snapshots start at M10. So these archives are the only copy of the data that
// exists outside the cluster, and the only recovery path from a bad delete. The
// app has no soft deletes: when the staff cascade removes someone, they are gone.
//
// Writes one gzipped archive per run, named by UTC timestamp, and prunes
// anything older than KEEP_DAYS. Never overwrites: the point of a backup is
// having *many* days to choose from, because the realistic disaster is a bug
// noticed three weeks late, not a cluster failure. A single mirrored copy would
// have faithfully mirrored the damage.
//
// Overridable by environment variable:
//   BACKUP_DIR   where archives go        (default: OneDrive/catalyst-backups)
//   KEEP_DAYS    how many days to retain  (default: 60)
//   DB_NAME      database to dump         (default: test)
//
// See docs/BACKUP.md for scheduling this and for the restore procedure.

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, ".env") });

// Default into OneDrive when it exists: it syncs offsite automatically and keeps
// its own file version history, which is a better backup destination than
// anything worth building. Derived from the environment rather than hardcoded so
// this works on any machine, including the Linux instance.
const BACKUP_DIR =
  process.env.BACKUP_DIR ||
  (process.env.OneDrive
    ? path.join(process.env.OneDrive, "catalyst-backups")
    : path.join(os.homedir(), "catalyst-backups"));
const KEEP_DAYS = Number(process.env.KEEP_DAYS || 60);
const DB_NAME = process.env.DB_NAME || "test";

// A real dump of this database is a couple of hundred KB. mongodump can exit 0
// having written an almost-empty archive — a wrong database name, or credentials
// that resolve to no collections — and that failure is invisible: the log says
// success and a file appears. You would find out on the day you needed it. So
// anything implausibly small is treated as a failed run.
const MIN_BYTES = 10_000;

function fail(message) {
  console.error(`backup FAILED: ${message}`);
  process.exit(1);
}

const uri = process.env.MONGODB_URI;
if (!uri) fail(`MONGODB_URI not found in ${path.join(__dirname, ".env")}`);

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
const outFile = path.join(BACKUP_DIR, `catalyst-${stamp}.archive.gz`);

// Arguments go through as an array, so the connection string is never parsed by
// a shell — it contains characters (?, &, @) that would otherwise need escaping.
const result = spawnSync(
  "mongodump",
  ["--uri", uri, "--db", DB_NAME, `--archive=${outFile}`, "--gzip", "--quiet"],
  { stdio: ["ignore", "inherit", "inherit"] },
);

if (result.error && result.error.code === "ENOENT") {
  fail(
    "mongodump is not installed or not on PATH.\n" +
      "  Install the MongoDB Database Tools — see docs/BACKUP.md.\n" +
      "  (They are a separate download; Compass and the Node driver do not include them.)",
  );
}
if (result.error) fail(result.error.message);
if (result.status !== 0) fail(`mongodump exited with code ${result.status}`);
if (!fs.existsSync(outFile)) fail("mongodump reported success but wrote no file");

const size = fs.statSync(outFile).size;
if (size < MIN_BYTES) {
  fs.unlinkSync(outFile);
  fail(
    `archive was only ${size} bytes — far smaller than a real dump. ` +
      `Deleted it rather than leave a backup that looks valid and is not.`,
  );
}

// Prune old archives. Only files matching the name this script writes, so
// nothing else in the directory is ever at risk.
const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
let pruned = 0;
for (const name of fs.readdirSync(BACKUP_DIR)) {
  if (!/^catalyst-.*\.archive\.gz$/.test(name)) continue;
  const full = path.join(BACKUP_DIR, name);
  if (full === outFile) continue;
  if (fs.statSync(full).mtimeMs < cutoff) {
    fs.unlinkSync(full);
    pruned += 1;
  }
}

const kept = fs
  .readdirSync(BACKUP_DIR)
  .filter((n) => /^catalyst-.*\.archive\.gz$/.test(n)).length;

// Appended to a log as well as printed, because a scheduled task prints to
// nobody. The realistic failure is not a bad backup — it is a job that quietly
// stopped running two months ago, and this file is where you notice.
const line =
  `${new Date().toISOString()}  ok  ${path.basename(outFile)}  ` +
  `${(size / 1024).toFixed(1)} KB  (${kept} kept, ${pruned} pruned)`;
fs.appendFileSync(path.join(BACKUP_DIR, "backup.log"), line + "\n");
console.log(line);
console.log(`\nBackups live in: ${BACKUP_DIR}`);
console.log("Verify one actually restores:  npm run backup:verify");
