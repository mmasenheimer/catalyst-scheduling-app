# Backups

Atlas M0 — the free tier this project runs on — has **no automated backups of
any kind**. Cloud snapshots start at M10 (~$57/month). These archives are the
only copy of the data that exists outside the cluster.

That matters more here than in most apps because **CATalyst has no soft
deletes**. When the staff cascade removes an employee, or a schedule is
overwritten, it is gone. A backup is the only recovery path there is.

The database is about **1 MB**, so a full dump is ~21 KB gzipped. This is cheap.

> **In a hurry and something is wrong?** Jump to
> [Restoring for real](#restoring-for-real). The first step is to stop the API.

---

## Where this runs, and why

Two machines, two jobs:

| | |
|---|---|
| **Jetstream instance** | Takes the backup, nightly on cron. Runs 24/7, so it actually happens. |
| **Your laptop** | Pulls copies into OneDrive. Gets them *off* the instance. |

The split matters. A backup stored only on the machine it protects is not a
backup — if the instance is deleted or lost, the backups go with it. And a backup
that only runs when a personal laptop happens to be awake is not a schedule.

The instance guarantees the backup exists; the laptop copy guarantees it survives
the instance. Missing a day at the laptop only delays the offsite copy, it does
not lose the backup.

Both scripts are plain Node and run unchanged on either machine.

---

## How you find out something is wrong

**Read this part before you need it.** It is the honest state of things, not a
description of a system that is watching for you.

**Nothing monitors your data.** No alert fires if the schedules collection
empties out. You will find out because a manager says *"all of September is
gone."* That is the detection mechanism.

The logs tell you the backup job is **alive**, not that your data is **healthy** —
two different questions, and only the first is covered:

```bash
cat /srv/backups/backup.log     # one line per successful run
cat /srv/backups/cron.log       # what cron saw, including failures
ls -lh /srv/backups/            # the archives themselves
```

A gap in the dates means the job stopped running. That is the failure worth
checking for periodically, because it is silent.

**What is deliberately not covered:** there is no Restore button in the app, and
there should not be. It would be the most dangerous control in the product — one
click that overwrites everything — and when you actually need a restore, the app
is usually the thing that is broken. Restoring is a manual, deliberate,
command-line act.

**If you want to close this gap**, in increasing order of effort:

- **UptimeRobot free tier** hitting `https://YOUR_HOST/api/staff` every 5
  minutes, emailing you when the API goes down. The 401 that endpoint returns is
  a perfect health check: it proves the API is up and talking to Mongo. Catches
  the common case; will not catch silent data loss.
- **A nightly count-comparison script** — today's document counts against
  yesterday's, emailing on a large drop. Roughly an hour of work, and the only
  thing here that would actually catch data loss.

---

## Setup on the Jetstream instance (the scheduled backup)

Already done, recorded here for a rebuild.

Install the tools — check the Ubuntu release first, since the package differs:

```bash
lsb_release -cs        # jammy -> ubuntu2204, noble -> ubuntu2404
wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2204-x86_64-100.17.0.deb
sudo dpkg -i mongodb-database-tools-*.deb
mongodump --version
```

The `ubuntu2204` build runs fine on `noble`.

```bash
sudo mkdir -p /srv/backups && sudo chown exouser:exouser /srv/backups
cd /srv/catalyst/scheduling-app/src/backend
BACKUP_DIR=/srv/backups node backup.js
BACKUP_DIR=/srv/backups node verifyBackup.js
```

Schedule it without opening an editor:

```bash
(crontab -l 2>/dev/null; echo "0 9 * * * cd /srv/catalyst/scheduling-app/src/backend && BACKUP_DIR=/srv/backups /usr/bin/node backup.js >> /srv/backups/cron.log 2>&1") | crontab -
crontab -l
```

**09:00 UTC is 2 AM Arizona.** A quiet hour matters slightly beyond politeness:
`mongodump` reads collections one at a time rather than atomically, so backing up
while nobody is writing avoids the id-counter hazard described at the bottom of
this file.

The `cd` and the absolute `/usr/bin/node` are load-bearing — cron runs with a far
sparser environment than a login shell, and a bare `node` will not resolve.

Sixty days at ~21 KB each is about 1.3 MB of disk.

---

## Copying them off the instance

From the laptop, whenever it is on:

```bash
mkdir -p ~/OneDrive/catalyst-backups
scp exouser@YOUR_HOST:/srv/backups/catalyst-*.archive.gz ~/OneDrive/catalyst-backups/
```

OneDrive syncs them offsite and keeps its own version history. This is the copy
that survives losing the instance entirely — **do it before ever deleting or
rebuilding the instance.**

---

## Running a backup from the laptop instead

Also works on Windows, for a manual backup before doing something risky.

Install the **MongoDB Database Tools** — a separate download, not included with
Compass, the Node driver, or MongoDB itself:
<https://www.mongodb.com/try/download/database-tools> (Windows x86_64, `msi`).

If `mongodump --version` is not found after installing, the installer skipped the
PATH entry. Add `C:\Program Files\MongoDB\Tools\100\bin` to your user PATH — via
System Properties, or PowerShell:

```powershell
$t='C:\Program Files\MongoDB\Tools\100\bin'
$p=[Environment]::GetEnvironmentVariable('Path','User')
[Environment]::SetEnvironmentVariable('Path',$p.TrimEnd(';')+';'+$t,'User')
```

Do **not** use `setx` for this — it silently truncates PATH at 1024 characters.
Open a new terminal afterwards; PATH changes do not reach a running shell.

```powershell
cd C:\Users\mmase\OneDrive\catalystApp\scheduling-app\src\backend
npm run backup
npm run backup:verify
```

Archives default to `OneDrive\catalyst-backups\`.

---

## Routine checks

**Quarterly, run the verify.** It is the only thing that catches a scheduled job
that quietly stopped two months ago — the most common way backup systems fail.

```bash
cd /srv/catalyst/scheduling-app/src/backend
BACKUP_DIR=/srv/backups node verifyBackup.js
```

Expect `PASSED — N documents restored and verified.`

---

## Restoring for real

You will be reading this during a bad afternoon, so it is written to be followed
literally.

### 1. Stop the API first

```bash
sudo systemctl stop catalyst-api
```

Every minute it keeps running, new writes pile on top of the damage and mix good
data with bad. This is the step people skip because it feels drastic. Do it.

### 2. Pick an archive from *before* the problem

```bash
ls -lh /srv/backups/
```

Filenames are UTC timestamps. If a bug ran for three days before anyone noticed,
you want a file from four days ago — which is exactly why sixty are kept rather
than one.

### 3. Inspect it before overwriting anything

```bash
cd /srv/catalyst/scheduling-app/src/backend
BACKUP_DIR=/srv/backups node verifyBackup.js /srv/backups/catalyst-<STAMP>.archive.gz
```

This restores into a scratch database called `restore_check` and prints its
counts. Live data is never written to. Confirm the archive holds what you expect
before betting on it.

### 4. Restore over the live data

```bash
mongorestore --uri "<MONGODB_URI from .env>" \
  --archive=/srv/backups/catalyst-<STAMP>.archive.gz \
  --gzip --drop
```

`--drop` replaces each collection as it restores. **Anything written since that
backup is lost** — that is the intent, but be sure it is what you want.

### 5. Start the API

```bash
sudo systemctl start catalyst-api
sudo systemctl status catalyst-api
```

Mongoose recreates its own indexes on startup, so anything omitted during the
restore repairs itself here.

---

## Two things that will confuse you if nobody warned you

**1. The notification TTL.**

`notifications` has a 90-day TTL index on `createdAt`. `mongorestore` normally
recreates indexes — so restoring an archive older than 90 days means every
notification in it is already expired, and MongoDB deletes them within about a
minute. The restore reports success and the notification history silently
evaporates.

That is why `verifyBackup.js` uses `--noIndexRestore`. For a real restore, decide
deliberately: keeping the TTL is usually correct, since notifications are
transient and the requests and schedules they refer to restore intact. Just know
it is happening rather than discovering it.

**2. The id counters.**

`mongodump` reads collections sequentially, not atomically. If `counters` was
dumped just before someone was added and `staffs` just after, the restored
counter sits behind the highest existing `_id`, and the next hire fails with a
duplicate key error.

`verifyBackup.js` checks this on every run. If it ever reports `BROKEN`, fix it
by setting the counter above the highest id:

```js
db.counters.updateOne({ _id: "Staff" }, { $set: { seq: <highest staff _id> } })
```

---

## What is and is not covered

**Covered:** every collection in the `test` database — staff, users,
availability, schedules, events, templates, requests, notifications, counters.

**Not covered, and does not need to be:** the `admin` and `local` system
databases, which belong to MongoDB and are rebuilt by Atlas. `local` holds the
oplog; never touch it.

**Not covered, and worth knowing:** Atlas account-level disasters. The OneDrive
copies survive those — which is the whole reason for step "copying them off the
instance". Do not let the only copies live on the instance.

**Contains personal data.** Staff names and bcrypt password hashes. OneDrive is
fine. **Never commit an archive to git.** The default backup directories sit
outside the repository so this cannot happen by accident.
