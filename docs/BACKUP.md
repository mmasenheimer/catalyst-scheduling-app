# Backups

Atlas M0 — the free tier this project runs on — has **no automated backups of
any kind**. Cloud snapshots start at M10 (~$57/month). These archives are the
only copy of the data that exists outside the cluster.

That matters more here than in most apps because **CATalyst has no soft
deletes**. When the staff cascade removes an employee, or a schedule is
overwritten, it is gone. A backup is the only recovery path there is.

The database is about **1 MB**, so a full dump is a couple of hundred KB. This is
cheap. There is no reason not to do it.

---

## One-time setup

### 1. Install the MongoDB Database Tools

`mongodump` and `mongorestore` are a **separate download**. They do not come with
Compass, the Node driver, or MongoDB itself.

Download the Windows `.msi` from
<https://www.mongodb.com/try/download/database-tools>, run it, and accept the
default location. It adds them to `PATH`.

Confirm it worked — open a **new** terminal (PATH changes need one) and run:

```powershell
mongodump --version
```

### 2. Take the first backup

```powershell
cd C:\Users\mmase\OneDrive\catalystApp\scheduling-app\src\backend
npm run backup
```

Archives go to `OneDrive\catalyst-backups\` by default — offsite, synced, and
versioned by OneDrive itself, with no infrastructure to maintain.

### 3. Prove it restores

```powershell
npm run backup:verify
```

**Do not skip this.** A dump you have never restored is a file, not a backup.
The script restores into a scratch database called `restore_check`, compares
counts against live, checks the id counters, and drops the scratch copy. Live
data is never written to.

Expect `PASSED — N documents restored and verified.`

### 4. Schedule it

Open **Task Scheduler** → *Create Basic Task*:

- **Name:** CATalyst backup
- **Trigger:** Daily, 3:00 AM
- **Action:** Start a program
  - **Program:** `node`
  - **Arguments:** `backup.js`
  - **Start in:** `C:\Users\mmase\OneDrive\catalystApp\scheduling-app\src\backend`

Then in the task's **Properties → Settings**, tick
**"Run task as soon as possible after a scheduled start is missed"** — otherwise
a closed laptop at 3 AM means no backup that day at all.

The task only runs when the machine is on. For a roster that changes slowly that
is fine: missing Tuesday still leaves you Monday.

---

## Routine checks

**Quarterly, run `npm run backup:verify`.** It is the only thing that catches a
scheduled job that quietly stopped running two months ago — the most common way
backup systems fail.

**Glance at `OneDrive\catalyst-backups\backup.log`.** One line per run. A gap in
the dates is the signal.

---

## Restoring for real

You will be reading this during a bad afternoon, so it is written to be followed
literally.

### First: do not restore over live data yet

Restore into a scratch database and look at it before touching anything real.

```powershell
mongorestore --uri "<MONGODB_URI from .env>" `
  --archive="C:\Users\mmase\OneDrive\catalyst-backups\catalyst-<STAMP>.archive.gz" `
  --gzip --noIndexRestore --nsFrom="test.*" --nsTo="restore_check.*"
```

Open `restore_check` in Compass and confirm it holds what you expect — the right
staff, the right dates. Only then continue.

### Then: replace the live data

```powershell
mongorestore --uri "<MONGODB_URI from .env>" `
  --archive="C:\Users\mmase\OneDrive\catalyst-backups\catalyst-<STAMP>.archive.gz" `
  --gzip --drop
```

`--drop` replaces each collection as it restores. Anything written since the
backup is lost — that is the intent, but be sure it is what you want.

Afterwards, restart the API so it reconnects cleanly:

```bash
ssh exouser@YOUR_HOST 'sudo systemctl restart catalyst-api'
```

### Two things that will confuse you if nobody warned you

**1. `--noIndexRestore` and the notification TTL.**

`notifications` has a 90-day TTL index on `createdAt`. `mongorestore` normally
recreates indexes — so restoring an archive older than 90 days means every
notification in it is already expired, and MongoDB deletes them within about a
minute. The restore reports success and the notification history silently
evaporates.

That is why the verify path uses `--noIndexRestore`. For a **real** restore,
decide deliberately: keeping the TTL is usually correct (notifications are
transient, and the requests and schedules they refer to are restored intact), but
know that it is happening rather than discovering it.

Mongoose recreates its own indexes on startup, so a restore without indexes
repairs itself when the API restarts. Nothing is permanently lost by omitting
them.

**2. The id counters.**

`mongodump` reads collections one at a time, not atomically. If `counters` was
dumped just before someone was added and `staffs` just after, the restored
counter sits behind the highest existing `_id`, and the next hire fails with a
duplicate key error.

`npm run backup:verify` checks this. If it ever reports `BROKEN`, fix it by
setting the counter above the highest id:

```js
db.counters.updateOne({ _id: "Staff" }, { $set: { seq: <highest staff _id> } })
```

---

## What is and is not covered

**Covered:** every collection in the `test` database — staff, users,
availability, schedules, events, templates, requests, notifications, counters.

**Not covered, and does not need to be:** the `admin` and `local` system
databases, which belong to MongoDB and are rebuilt by Atlas.

**Not covered, and worth knowing:** Atlas account-level disasters. These archives
live in OneDrive, so a lost Atlas account is survivable — but if you ever move
backups onto the Jetstream instance, keep a copy elsewhere too. Backups stored
on the machine they protect are not backups.

**Contains personal data.** Staff names and bcrypt password hashes. OneDrive is
fine. **Never commit an archive to git.**
