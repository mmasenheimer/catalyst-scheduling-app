# Developer Guide

Technical orientation for anyone maintaining this codebase. Read
[README.md](README.md) first for *what* the app does — this document covers *how it works*.

Styling is deliberately out of scope. Everything here is architecture, data flow, and the
non-obvious rules you need to know before changing anything.

---

## Contents

1. [The 60-second mental model](#the-60-second-mental-model)
2. [Repository layout](#repository-layout)
3. [Running it](#running-it)
4. [Core domain concepts](#core-domain-concepts) ← **read this before touching scheduling code**
5. [Backend](#backend)
6. [Frontend](#frontend)
7. [The schedule editor](#the-schedule-editor) ← the most complex code in the project
8. [Notifications](#notifications)
9. [Requests and approvals](#requests-and-approvals)
10. [Common tasks](#common-tasks)
11. [Footguns](#footguns)
12. [Known technical debt](#known-technical-debt)

---

## The 60-second mental model

```
React SPA (Vite)                     Express API                MongoDB
──────────────────                   ───────────                ───────
AuthProvider                                                    users
  └─ router                          /api/auth      ──────────► schedules
       └─ ProtectedRoute             /api/staff     ──────────► staff
            └─ AppLayout             /api/schedules ──────────► events
                 ├─ ScheduleProvider /api/events    ──────────► templates
                 ├─ NotificationsProvider           ──────────► availability
                 ├─ RequestsProvider                ──────────► requests
                 └─ TemplatesProvider               ──────────► notifications
                      └─ <Outlet/>  ← the current page
```

Three ideas explain most of the code:

1. **A "schedule" is one document per calendar date.** It holds a snapshot of who works when.
   There is no shift table — shifts live inside a day's snapshot.
2. **Days have a draft/published lifecycle.** Editing auto-saves a draft; "Finalize" publishes.
   Publishing is what notifies employees.
3. **The live staff roster is always authoritative for identity.** A schedule snapshot only
   contributes *shift times*. This is what keeps old schedules from resurrecting departed staff.

---

## Repository layout

```
catalystApp/
├── README.md                  Product documentation
├── DEV.md                     This file
└── scheduling-app/
    ├── package.json           Frontend deps + scripts
    └── src/
        ├── data/              Seed/fallback data (see warning below)
        │   ├── mockData.js        initialStaff, initialEvents, weeklyTemplates,
        │   │                      staffingTargetsByDay, HOURS_START/END, studioHours
        │   └── mockAvailability.js
        ├── backend/
        │   ├── api.js             Express app: middleware, route mounting, startup
        │   ├── server.js          Entry point — starts api.js, then Slack (optional)
        │   ├── db.js              Mongoose connection
        │   ├── seed.js            DESTRUCTIVE full reset
        │   ├── seedUsers.js       Non-destructive account provisioning
        │   ├── models/            8 Mongoose schemas
        │   ├── routes/            One router per resource
        │   ├── middleware/auth.js requireAuth / requireManager
        │   └── utils/             auth, scheduleDiff, sequentialId, respond, devAccounts
        └── frontend/
            ├── main.jsx / App.jsx Entry
            ├── router.jsx         All routes + role guards
            ├── context/           Auth, Schedule, Notifications, Requests, Templates
            ├── hooks/             useSchedule (the big one), useLiveRefetch
            ├── utils/             api.js (HTTP client), scheduleUtils.js (domain logic)
            ├── components/        Layout, guards, icons, calendars, modals
            └── pages/             One file per route
```

> ⚠️ **`src/data/` is not dead code.** `mockData.js` is still imported in **11 places**. It supplies
> `weeklyTemplates` (the fallback schedule pattern), `staffingTargetsByDay` (coverage minimums),
> and the studio's operating hours. `initialStaff`/`initialEvents` are the offline fallback in
> `useSchedule`. Deleting this file breaks the app — see [Known technical debt](#known-technical-debt).

---

## Running it

```bash
# Backend — needs .env with MONGODB_URI and JWT_SECRET
cd scheduling-app/src/backend && npm install && npm run dev    # :3001

# Frontend
cd scheduling-app && npm install && npm run dev                # :5173
```

| Script | Effect |
|---|---|
| `npm run dev` (backend) | `node --watch server.js` — API + Slack attempt |
| `node api.js` | API only, skips Slack entirely — useful when Slack tokens are bad |
| `npm run seed` | **Destroys** all staff and users, rebuilds from `mockData` |
| `npm run seed:users` | Creates accounts for staff that lack them. Safe to re-run. |

**`.env` (backend):**
```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<long random string>     # falls back to an insecure dev value; throws in production
SLACK_ENABLED=false                 # skip Slack entirely
```

**Verifying changes.** There is no test suite. The working practice has been:
`npx eslint <files>` → `npx vite build` → exercise the API with `curl` against a second instance
(`PORT=3002 node api.js`) so live data isn't disturbed. **Lint matters more than usual here** —
Vite does *not* catch undefined variables, so `no-undef` errors are runtime crashes that build
cleanly.

---

## Core domain concepts

### Time is a decimal hour

`9.5` means 9:30 AM. Everything — shifts, desk blocks, events, the grid — uses this. `formatTime()`
in `scheduleUtils.js` renders it. The grid spans `HOURS_START` (7) to `HOURS_END` (20), and the UI
snaps to 0.5 increments.

### Dates are local `YYYY-MM-DD` strings — never UTC

Always use `toDateStr(date)` from `scheduleUtils.js`:

```js
export function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
```

**Never `toISOString().split('T')[0]`.** That converts to UTC first. In Arizona (UTC-7) an evening
edit rolls to the next calendar day, so the schedule saves under one key and every other view reads
another. This was a real bug that took a while to find. The keys sort chronologically as plain
strings, which is why date-range queries can compare them directly.

### Three-layer schedule resolution ⭐

This is the single most important concept. What a given day looks like is resolved in priority
order:

| Priority | Source | Provides |
|---|---|---|
| 1 | The saved `Schedule` document for that exact date | Shifts and desk blocks |
| 2 | `weeklyTemplates[weekday]` from `mockData.js` | Fallback shifts when nothing is saved |
| 3 | The **live** staff roster | Identity, name, hour caps — *always* |

Implemented by `mergeStaffOverrides(liveStaff, overrides)`:

```js
// Iterates the LIVE roster. The override only ever contributes shifts/deskShifts.
liveStaff.map(person => {
  const override = overrideMap.get(person.id);
  if (!override) return { ...person, shifts: [], deskShifts: [] };  // on roster, not scheduled
  return { ...person, shifts: override.shifts, deskShifts: override.deskShifts };
});
```

**Consequences you must preserve:**
- Staff added after a schedule was saved appear in it, unscheduled — not missing.
- Staff removed from the roster vanish from old schedules — they can't be resurrected.
- Renaming someone updates every historical view, because names never come from snapshots.

Helpers layered on top (all in `scheduleUtils.js`):

| Function | Use |
|---|---|
| `getStaffForDate(date, getDaySchedule, allStaff)` | Resolve using the in-memory cache |
| `staffForDateFromSaved(date, savedByDate, allStaff)` | Resolve from a preloaded API map |
| `personForDate(...)` / `hasShiftOn(...)` | One person's entry / do they work that day |
| `buildSavedScheduleMap(schedules)` | Turn `GET /schedules?from&to` into `{date: staff[]}` |

### Draft vs published

```
   edit ──► auto-save (finalized: false, 600ms debounce)
                │
                ▼
        click Finalize ──► finalized: true
                             + lastPublishedStaff = staff   ← notification baseline
                             + diff vs old baseline → notify affected employees
                │
           edit again ──► auto-unfinalize back to draft
```

**Why `lastPublishedStaff` exists.** The obvious way to detect changes — compare the incoming payload
to the stored document — *does not work*, because the debounced auto-save has already written
`staff` while the manager was still dragging. By the time Finalize fires, stored == incoming and the
diff is always empty. So publishing snapshots `lastPublishedStaff`, and diffs run against that.

Auto-unfinalize lives in a watcher effect that compares a JSON signature of staff+events against a
baseline, skipping the pass right after a load (`justLoadedRef`) so restoring saved data isn't
mistaken for an edit.

### Two shift representations (legacy debt)

| Shape | Where |
|---|---|
| `shifts: [{id, start, end}]`, `deskShifts: [...]` | The editors, schedule snapshots, all new code |
| `shiftStart / shiftEnd / deskStart / deskEnd` scalars | The `Staff` model, `mockData`, some older helpers |

`normalizeStaffShifts()` converts scalars → arrays. **Prefer the array form.** Code still reading
scalars (`getEligibleStaff`, `autoAssignDesks`, parts of MySchedulePage) misrepresents anyone with
more than one shift in a day.

### Event recurrence

`eventOccursOn(evt, date)` in `scheduleUtils.js` is the **only** implementation — it used to be
copy-pasted across five pages and had already drifted.

```
no days at all            → occurs every day
date listed in evt.days   → occurs
repeating                 → same weekday as an anchor date in evt.days, AND
                            on/after that anchor, AND
                            within repeatFrom..repeatUntil when those are set
```

---

## Backend

### Request lifecycle

```
request
  → helmet                       security headers
  → cors                         (origin hardcoded to :5173 — change before deploying)
  → express.json()
  → [login only] rate limiters   per-account, then per-IP
  → requireAuth                  everything except /api/auth/login
  → [some routes] requireManager
  → handler
  → sendWriteError on throw
```

### `requireAuth` does a database lookup on every request

This surprises people, so it's worth stating plainly. `middleware/auth.js`:

1. Verifies the JWT signature
2. **Loads the user from the database**
3. Rejects if the account no longer exists → *removing a staff member kills their live session immediately*
4. Rejects if `payload.tv !== user.tokenVersion` → *password changes retire old tokens*
5. Rejects everything except `/auth/me` and `/auth/change-password` when `mustChangePassword` is set
6. Populates `req.user` **from the database row, not the token claims** — so a stale token can't carry outdated privileges

The cost is one indexed `_id` lookup per request. That's the deliberate price for immediate
revocation, which stateless JWTs otherwise can't do.

```js
req.user = { id, role, staffId, username, name, mustChangePassword }
```

**Always read identity from `req.user`.** Never trust `req.body.staffId` or a query param.

### Two id conventions

| Models | `_id` type | Why |
|---|---|---|
| `Staff`, `Event` | **Number** | The frontend and schedule snapshots reference staff/events by numeric id |
| everything else | ObjectId | Default |

Numeric ids need manual assignment — `utils/sequentialId.js` computes `max(_id)+1` and **retries on
duplicate-key errors**, since the read-then-write isn't atomic.

### Route conventions

```js
router.patch("/:id", requireManager, async (req, res) => {
  try {
    const doc = await Model.findByIdAndUpdate(id, changes,
      { new: true, runValidators: true });   // ← runValidators is REQUIRED
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) { sendWriteError(res, err); }
});
```

- **`runValidators: true` is mandatory on updates.** Mongoose skips enum/required/min validation on
  `findByIdAndUpdate` by default. Without it, `status: "banana"` writes straight to the database.
- **`sendWriteError`** (`utils/respond.js`) maps `ValidationError`/`CastError` → **400** with the
  reason, everything else → 500 logged server-side. Never hand-roll the catch.

### The schedule PUT is the most complex route

`PUT /api/schedules/:date` does four things in order:

1. Reads the existing document (to capture `lastPublishedStaff` before overwriting)
2. Upserts; if publishing, sets `lastPublishedStaff = staff`
3. If publishing **and** there was a prior baseline **and** `suppressNotify` isn't set → diffs and notifies
4. Responds

`suppressNotify` is sent by the approval flow, which already notifies the people involved — without
it they'd be told twice about the same change.

### Models

| Model | Notes |
|---|---|
| `Staff` | Numeric `_id`. Legacy scalar shift fields. |
| `User` | Login. `staffId` links to Staff (null for managers). `tokenVersion`, `mustChangePassword`. Partial unique index on `staffId` scoped to numbers so multiple null-staffId managers don't collide. |
| `Schedule` | One per date. `staff`/`events` are `Mixed` snapshots. `lastPublishedStaff` is the notification baseline. |
| `Event` | Numeric `_id`. `days[]`, `repeating`, `repeatFrom`, `repeatUntil`, `assignedStaff[]`. |
| `Template` | `week` or `day` type. Mixed staff snapshots. |
| `Availability` | One per staff member. `days` maps weekday → time blocks. |
| `Request` | `time_off` / `cover` / `swap`, moving through `pending_peer` → `pending` → `approved`/`denied`/`declined`. |
| `Notification` | `recipients` is `'all'` \| `'manager'` \| `[staffId]`. `details[]` accumulates change lines. |

All models rename `_id` → `id` and strip `__v` in a `toJSON` transform. `User` also strips
`passwordHash`.

---

## Frontend

### Provider tree — order matters

```jsx
<AuthProvider>              // App.jsx — outside the router, so /login can use it
  <RouterProvider>
    <ProtectedRoute>        // redirects: no user → /login, mustChangePassword → /change-password
      <AppLayout>
        <ScheduleProvider>          // staff, events, day cache
          <NotificationsProvider>   // needs auth
            <RequestsProvider>      // needs Schedule AND Notifications
              <TemplatesProvider>
                <Outlet/>           // the page
```

`RequestsProvider` must sit inside both Schedule and Notifications because approving a request
mutates the schedule *and* creates notifications. Reordering breaks it.

Everything below `AppLayout` unmounts on logout, which is why contexts don't need to clear
themselves.

### `utils/api.js` — the HTTP client

Every call goes through one `request()` wrapper that:
- attaches `Authorization: Bearer <token>` from `localStorage`
- on **401 with a token** → clears it and dispatches `UNAUTHORIZED_EVENT`, which `AuthContext`
  listens for and logs out
- on **401 without a token** → a rejected credential, not an expired session. Surfaces the server's
  message. *(Conflating these once produced "session expired" on a simple bad-password login.)*
- otherwise throws with the server's `error` field when present

### `hooks/useSchedule.js` — the schedule context

Owns `staff`, `events`, `currentDate`, and `daySchedules` (an in-memory date → staff cache used by
the editors before/without a network read).

Two patterns worth understanding:

**Debounced writes.** `updateEvent` fires on every mousemove during a resize, so the network call is
debounced 400ms per event id. Without this a single drag would fire dozens of PATCHes.

**Stable callbacks via refs.** `assignStaffToEvent`/`unassignStaffFromEvent` read `events` from
`eventsRef` rather than closing over state, so they can be `useCallback([])`. This matters:
they're passed to memoized `DayEditor`s, and if their identity changed on every event edit, all
seven days would re-render on every mousemove of a drag.

### `utils/scheduleUtils.js` — the domain brain

The one file to read before changing scheduling behavior. Contains date helpers, the merge/resolution
functions, `eventOccursOn`, `orphanedByShiftRemoval`, and the alert engine (`buildAlerts`).

`buildAlerts(staff, events, dow)` produces understaffing (vs `staffingTargetsByDay`), desk-coverage
gaps, concurrent-desk conflicts, desk/event overlaps, and unfilled events.

### `hooks/useLiveRefetch.js`

Keeps notifications and requests fresh: refetch on mount, on window focus, on `visibilitychange`,
and on a 45s poll — but only while the tab is visible, and never overlapping (an in-flight guard).
Data updates in place; no reload, no lost scroll position or form state.

---

## The schedule editor

`DailySchedulePage.jsx` (~2000 lines) and `WeeklyViewPage.jsx` (~1500 lines) are the hardest code
here. `WeeklyTemplatesPage.jsx` (~1470) is a third variant for templates. **They are separate
implementations of the same interactions** — a fix in one usually needs porting to the others.

### Two drag systems, deliberately

| System | Used for | Why |
|---|---|---|
| **HTML5 drag events** (`draggable`, `onDragOver`, `onDrop`) | Dragging toolbar chips onto rows; dragging bars to the trash | Needs cross-element drop targets |
| **Pointer/mouse events** (`onMouseDown` + window listeners) | Resizing a bar's edges | Needs pixel-level control HTML5 drag can't give |

### Bar types

Three things render on a row: **shift** (green), **desk** (yellow, must sit inside a shift), and
**event** (purple, from the global event list, shown when the person is in `assignedStaff`).

### Drag state

```js
activeDragType    // 'shift' | 'desk' | 'event' — a toolbar chip is being dragged
draggingBarInfo   // an EXISTING bar is being dragged; identifies it:
                  //   { type, staffIndex, shiftIndex|deskIndex|eventId,
                  //     personId, duration, originalStart, originalEnd }
activeBar         // a resize is in progress (mouse path)
hoverRow          // row under the cursor
previewInfo       // the ghost bar: { staffIndex, start, end, valid }
```

### Performance machinery (don't remove it casually)

The weekly view renders 7 days × ~15 staff rows. Several deliberate optimizations exist:

- **`React.memo` on `DayEditor` with a custom comparator.** Only re-render a day when *its* data
  changed. `dayEvents` is compared by **content signature** (`eventsSig`), not reference, because
  `getEventsForDate` returns a fresh array every render.
- **`handlersRef`.** A ref reassigned every render holds all the drag handlers. Memoized child rows
  read `handlersRef.current`, so they always call fresh closures without the handler identities
  breaking memoization.
- **rAF-throttled preview.** During a drag, preview updates coalesce to ≤1 per frame:
  - `commitPreview(v)` — throttled, for the drag-over path
  - `setPreviewNow(v)` — immediate, cancels any pending frame (used for clears/drops)
  - `latestPreviewRef` — the synchronous truth. **Drop handlers read this, not `previewInfo` state**, so a drop is never a frame stale.
- **Cached `getBoundingClientRect`.** Row rects are cached in a Map and invalidated only on element
  change or window resize — measuring on every dragover forces a synchronous reflow.
- **Frozen alerts during drags.** `buildAlerts` is expensive; results are held in a ref while any
  drag is active.
- **CSS `contain: content`** on each day to limit reflow scope.

### The DayEditor imperative handle

Each day exposes methods to the weekly parent via `useImperativeHandle` — `isFinalized()`,
`getIssues()`, `commit()`, `unfinalize()`, `reload()`. This lets "Finalize All" inspect and commit
each day **without lifting per-day editing state into the parent**, which would reintroduce the
cross-day re-renders the memoization exists to prevent. `reload()` also lets an external change
(applying a template to another date) force one day to re-sync.

### Cascading deletes

Deleting a shift must also remove the desk time and event assignments sitting on it —
`orphanedByShiftRemoval()` computes what goes, keeping anything still covered by another shift the
person has. Used in all three editors.

---

## Notifications

### Addressing

`recipients` is `'all'` | `'manager'` | `[staffId, ...]`. Visibility follows **who it's addressed
to**, enforced in `routes/notifications.js` and mirrored client-side in `isVisibleTo`.

> There is no "manager sees everything" rule, and adding one back would be a mistake — it previously
> caused managers to receive a copy of every employee's notification, including ones generated by
> their own edits.

### Schedule-change diffing

`utils/scheduleDiff.js` compares two staff snapshots and classifies each person's change as
added / removed / changed, producing a line like:

> `Thu, Aug 13: moved to 9:00 AM – 2:00 PM (was 7:30 AM – 12:30 PM).`

Three behaviors to preserve:
- **Only affected people are notified** — not the whole roster.
- **Bursts collapse.** "Finalize All" publishes 7 days in quick succession; changes within a 5-minute
  window merge into one notification per person via the `details[]` array. The merge query is scoped
  by title, because the cover/swap flow also uses type `shift_change` and must not absorb these.
- **First publish is silent.** No prior baseline means the schedule is being established, not changed.

---

## Requests and approvals

`time_off` (drop), `cover`, and `swap`, all in `RequestsContext`.

### Two-stage approval

A request that names a coworker has to clear that coworker before it reaches the manager. A
drop-shift request has nobody to ask, so it starts on the manager's desk:

```
time_off       → pending ─────────────────► approved | denied     (manager)
cover | swap   → pending_peer ──accept───► pending ──► approved | denied
                      └────────decline───► declined  (terminal, manager never sees it)
```

`pending` deliberately keeps its original meaning — *waiting on the manager* — so requests written
before the peer stage existed are still valid without a migration, and the manager-side code below
was unchanged by it.

The starting status is derived server-side from `targetStaffId`, never taken from the client
(`routes/requests.js` POST). Which buttons a notification card shows comes from `actionModeFor()`
in `NotificationsPage.jsx`: `peer` (Accept/Decline) when you *are* the target of a `pending_peer`
request, `manager` (Approve/Deny) when you're the manager and it's `pending`.

### Authorization and atomicity

Both transitions put their precondition *inside* the update query rather than doing a
read-then-write, so concurrent clients can't both win. The peer leg matches on `targetStaffId`,
which authorizes and guards state in the same round trip — only the named coworker can act, and
only while the request still waits on them:

```js
// manager leg
findOneAndUpdate({ _id: id, status: "pending" }, { status })
// peer leg — authorization is part of the filter
findOneAndUpdate({ _id: id, status: "pending_peer", targetStaffId: req.user.staffId }, { status })
```

A null result is disambiguated with a follow-up `findById`: 404 (no such request), 403 (it exists
and still waits on a peer, but not you), or 409 (already decided).

Approval order is deliberate: **status first, then schedule, then notifications.** Recording the
decision first makes it idempotent — important because approving a `cover` *appends* the requester's
shifts to the target, so applying it twice double-books them. A `processingRef` guards against
double-clicks. The peer stage sits entirely *before* this, so accepting never touches the schedule.

**Honest limitation:** this is not a database transaction. A failure between steps can leave the
request approved with the schedule un-updated. It's surfaced to the manager rather than swallowed.
A true fix means moving day-reconstruction to the server so the whole approval can run in one
Mongo transaction.

---

## Common tasks

### Add a field to an existing model
1. Add it to the Mongoose schema
2. Add it to the route's destructure **and** the update object (they're separate — easy to miss one)
3. Thread it through `utils/api.js`
4. Add the UI control
5. Restart the backend

### Add an API route
Mount in `api.js` behind `requireAuth`; add `requireManager` per-route for manager actions. Use
`sendWriteError` in the catch and `runValidators: true` on updates.

### Add a page
1. Create in `pages/`
2. Add to `router.jsx` with the right guard (`managerOnly` / `employeeOnly`)
3. Add to `managerNav` or `employeeNav` in `AppLayout.jsx`

### Change how a day's staff is resolved
Change `mergeStaffOverrides` / `staffForDateFromSaved` in `scheduleUtils.js` — **not** the pages.
Multiple pages depend on identical behavior.

### Reset a dev environment
`npm run seed` (destructive) or `npm run seed:users` (safe). Manager is `manager` / `catalyst123`;
staff are `firstname.l` / `staff123`.

---

## Footguns

| Trap | Reality |
|---|---|
| `toISOString()` for a date key | Converts to UTC — silently off by one in the evening. Use `toDateStr`. |
| Editors are duplicated | Daily / Weekly / Templates are three implementations. A bug fix usually needs porting. |
| `findByIdAndUpdate` without `runValidators` | Enum and required checks are silently skipped. |
| Trusting `req.body.staffId` | Always use `req.user`. |
| Build passing means it works | Vite doesn't catch undefined variables. Run ESLint — `no-undef` is a runtime crash. |
| Removing "unused" perf refs | `handlersRef`, `latestPreviewRef`, the rect cache all exist for measured reasons. |
| Diffing the stored schedule for changes | Auto-save already wrote it. Diff `lastPublishedStaff`. |
| Adding a "manager sees all" notification rule | Causes managers to receive their own changes back. |
| Deleting `src/data/mockData.js` | Still supplies templates, staffing targets, and hours. |
| Testing against the live database | Use throwaway records on a second instance (`PORT=3002`). Upserts like `PUT /availability/:id` silently overwrite real data. |

---

## Known technical debt

Roughly ordered by how likely each is to cause a real bug.

| Item | Detail |
|---|---|
| **Three editor implementations** | Daily / Weekly / Templates duplicate drag, resize, delete, and preview logic. The largest source of divergence risk. |
| **Two sources of truth for defaults** | The database `Template` collection *and* hardcoded `weeklyTemplates` in `mockData.js`. Employee-facing pages fall back to the latter, so a staff member added later has no default schedule until a manager saves one for them. |
| **Dual shift model** | Legacy scalars vs `shifts[]`. `getEligibleStaff` and `autoAssignDesks` read scalars and misrepresent multi-shift staff. |
| **`toDateStr` duplicated** | Four copies (`scheduleUtils`, `WeeklyViewPage`, `ShiftCalendar`, `ApplyTemplateCalendarModal`). This duplication caused the original timezone bug. |
| **Add-employee partial failure** | If account provisioning fails after the staff row is created, you get a roster entry with no login, a misleading error, and no recovery path in the UI. |
| **Approvals aren't transactional** | See [Requests and approvals](#requests-and-approvals). |
| **MySchedulePage uses templates, not saved schedules** | It renders a single bar from scalar fields rather than iterating `shifts[]`, so it can disagree with what the manager actually published. |
| **Deployment config is hardcoded** | API base URL (`localhost:3001`) in `utils/api.js`; CORS origin (`localhost:5173`) in `api.js`. |
| **Token in `localStorage`** | Readable by any script on the page. httpOnly cookies are the hardening step. |
| **Global `unhandledRejection` handler** | In `server.js`, to stop Slack's background reconnects from killing the API. It also swallows genuine bugs — anything logged as `[unhandled rejection]` is worth chasing. |
| **Demo credentials on the login page** | Must be removed before real use. |
| **No test suite** | Verification is lint + build + manual `curl`. |
