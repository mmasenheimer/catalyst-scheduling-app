# CATalyst Studios — Team Management System

A web application for scheduling and managing a service-team workforce. Managers build and publish
staff schedules on an interactive time grid; employees view their shifts, submit availability, and
request coverage — all in one place, with an audit trail and automatic notifications.

---

## Purpose

Scheduling a studio or service desk usually happens across a spreadsheet, a group chat, and a lot of
in-person follow-up. That makes three problems routine:

| Problem | How this system addresses it |
|---|---|
| **Nobody's sure what the current schedule is.** Spreadsheets get copied, edited, and forgotten. | One published schedule per day, stored centrally. Employees always see the live version. |
| **Coverage gaps are found too late** — usually the morning of. | The editor flags understaffed windows, desk-coverage gaps, and unfilled events *as the manager builds the schedule*. |
| **Shift changes get lost in messages.** Someone doesn't hear their shift moved. | Every published change is diffed automatically, and only affected employees are notified — with specific before/after times. |

Secondary goals the system is built around:

- **A single roster of record.** Adding or removing an employee updates scheduling, login access, event assignments, and permissions in one action.
- **Self-service for employees.** Availability, drop requests, and coverage/swap requests flow through the app instead of the manager's inbox.
- **Reusable structure.** Recurring weekly patterns are saved as templates, so building next week starts from a known-good baseline rather than a blank grid.

---

## Technology

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 19 |
| Build tool | Vite 8 |
| Routing | React Router DOM 7 |
| Styling | Tailwind CSS 3 + CSS custom properties (theming) |
| State | React Context API (no external state library) |
| Drag & drop | Native HTML5 drag events + pointer events (no dependency) |
| Icons | Custom inline SVG components (no icon library) |

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js |
| API framework | Express 5 |
| Database | MongoDB (Atlas) via Mongoose 9 |
| Authentication | JSON Web Tokens (`jsonwebtoken`) |
| Password hashing | bcrypt (`bcryptjs`) |
| Security headers | Helmet |
| Abuse protection | `express-rate-limit` |
| Chat integration | Slack Bolt *(scaffolded, not yet active)* |

### Design notes
- **Zero UI dependencies.** All icons, calendars, drag interactions, and animations are hand-built, keeping the bundle small and the visual language consistent.
- **Dark and light themes** driven by CSS custom properties, toggleable per user.
- **Performance-tuned editor.** The weekly view uses memoization, cached layout measurements, and animation-frame-throttled drag previews so a seven-day grid stays responsive while dragging.

---

## Architecture

```
Browser (React single-page app)
    │  session token on every request
    ▼
Express REST API  ──►  MongoDB Atlas
    │
    └─►  Slack (optional, scaffolded)
```

- All data comes from the REST API; the frontend holds no source of truth.
- Every API route except login requires a valid session.
- Authorization is enforced **server-side** on every request — the interface hides controls a user can't use, but the server is the actual gate.

---

## Roles and access

Two roles determine the sidebar, the available pages, and API permissions.

| | Manager | Employee |
|---|---|---|
| Build and publish schedules | ✅ | — |
| View the full team schedule | ✅ | ✅ (read-only) |
| Create and assign events | ✅ | — |
| Manage the roster and accounts | ✅ | — |
| Approve/deny requests | ✅ | — |
| View own schedule and hours | — | ✅ |
| Submit availability | — | ✅ |
| Request coverage, swaps, drop shifts | — | ✅ |

---

# Pages

## Authentication

### Login
Username and password — the single entry point. Unauthenticated visitors to any page land here.

- Sessions persist across browser refreshes
- Expired or revoked sessions return the user here automatically
- Failed attempts are rate-limited per account
- Link to password help

### Set / Change Password
Serves two purposes:

- **First-time setup (forced).** New accounts are created with a temporary password and cannot use any part of the application until the employee sets their own. Enforced on the server, not just in the interface.
- **Voluntary change.** Requires the current password, so an unattended logged-in browser can't be used to lock the owner out. Changing your password signs out your *other* sessions but keeps the current one.

### Password Help
The system doesn't collect email addresses, so resets are handled by the manager from **Manage
Staff**. This page explains that flow.

---

## Manager pages

### Daily Schedule *(home)*
The core scheduling workspace — one day on an hour-by-hour grid, one row per employee.

**Building the schedule**
- Drag **Shift**, **Desk**, or **Event** chips from the toolbar onto any employee's row
- Drag existing bars sideways to move them, or grab either edge to resize
- All times snap to 30-minute increments
- Drag a bar to the trash zone to remove it
- Right-click any bar for edit/delete options
- A live preview shows exactly where a bar will land before you release

**Live coverage warnings** — recalculated as you edit:
- **Understaffed windows** — any half-hour below the configured minimum for that day type
- **Desk coverage gaps** — periods where staff are working but nobody is on the desk
- **Concurrent desk assignments** — more than one person on desk simultaneously
- **Desk/event conflicts** — someone on desk while assigned to an event
- **Unfilled events** — events with fewer staff than required

**Day management**
- Previous/next day navigation
- Live counts: *On Shift Today*, *On Shift Now*, *Events*
- **Finalize** to publish the day
- **Auto-unfinalize** — editing a published day returns it to draft, so "published" always reflects exactly what was approved
- **Save as Template** / **Apply Template**

### Weekly View
All seven days stacked, each fully editable with the same tools as the daily view.

- Week-at-a-time navigation
- Per-day finalize, plus **Finalize All** for the whole week
- Pre-flight check: finalizing a week with coverage issues warns first and lists them
- Today's column shows live *on shift now / today* counts
- Apply a template across the week, or save the week as a new template

### Event Calendar
A month grid of every scheduled event.

- Events per day at a glance
- Staffing progress per event (assigned vs. required)
- Month navigation, today highlighted
- Shared with employees (read-only for them)

### Templates
Reusable weekly staffing patterns — the starting point for building a new week.

- Create, rename, edit, and delete templates
- Per-weekday tabs, each with its own staff layout
- The same drag-and-drop editing as the schedule grid
- Conflict warnings for overlapping desk assignments
- Templates reconcile with the live roster automatically: employees added since the template was saved appear unscheduled, and removed employees drop out

### Add Event
Create a program, service, meeting, or workshop.

- Name, type, start/end time, staff required, notes
- One or more dates via a picker that blocks past dates
- Optional weekly recurrence
- Assign staff per date, offering only genuinely available people

### Staff Availability
Every employee's submitted availability in one view, so scheduling works against real constraints
rather than guesswork.

### Manage Staff
The roster and account control panel.

- **Add an employee** — name, username, weekly hour cap. Creates the roster entry *and* their login account, then displays a **one-time temporary password** to hand over.
- **Edit weekly hour caps** inline
- **Reset Password** — issues a new temporary password and immediately ends that person's active sessions
- **Remove** — in one action: deletes the roster entry, revokes the login, terminates any active session, and unassigns them from all events

---

## Employee pages

### My Schedule
The employee's own week — shifts, desk assignments, and assigned events on the same time grid the
manager uses, with weekly totals.

### Weekly View
Read-only view of the whole team's week, so employees can see who they're working with.

- Their own row is highlighted
- Their total scheduled hours for the displayed week are shown
- Week-at-a-time navigation

### Shift Requests
Ask a coworker to cover a shift, or propose a swap.

- **Cover** — pick one of your scheduled days; coworkers are separated into those free that day and those already working
- **Swap** — coworkers grouped by whether their hours overlap yours
- Optional note
- **Two-stage approval** — the request goes to the coworker you named first, who can **Accept** or
  **Decline**. Only once they accept does it reach the manager for final **Approve / Deny**. A
  decline ends the request and the manager never sees it, so nobody is scheduled onto a shift they
  didn't agree to.

### Drop Shift
Request to drop a scheduled shift, with a **two-week minimum notice** rule.

- A custom calendar where **only days you're actually scheduled** can be selected — every other day is visibly disabled
- Selecting a day shows that shift's exact times
- Optional note for context

### Availability
A weekly grid where employees mark when they can work. Submitting notifies the manager and feeds the
Staff Availability view.

---

## Shared

### Notifications
One feed for both roles, with an unread badge in the sidebar.

**Employees receive**
- **Schedule changes** — when a published schedule affecting them changes, with specific before/after times
- **Cover and swap requests aimed at them** — with **Accept / Decline** buttons on the notification
- Progress on requests they sent: accepted by the coworker, declined by the coworker, or approved
  or denied by the manager
- Confirmation when they're covering a shift or a swap is approved

**Managers receive**
- New **drop-shift** requests — with **Approve / Deny** buttons directly on the notification
- **Cover and swap requests that the named coworker has already accepted** — these don't reach the
  manager until then
- Availability submissions

Notifications can be marked read individually or dismissed in bulk. Employees only receive
notifications addressed to them; managers only receive ones addressed to them.

---

# Cross-cutting features

## Scheduling model
Three layers determine what a given day looks like, in priority order:

1. **A saved schedule** for that specific date, if one has been built
2. **The weekly template** for that weekday, as a starting point
3. **The live roster**, which always supplies employee identity and metadata

A published schedule is authoritative, but the roster stays current — an employee added last week
appears everywhere immediately, and a departed employee disappears from views without corrupting
historical records.

**Publishing (Finalize)** marks a day approved and locks in a baseline. Editing a published day
automatically returns it to draft.

## Automatic change notifications
When a manager publishes a schedule, the system compares it against the previously published version
and notifies **only** the employees whose own shifts changed, describing the actual difference
(*"Thu, Aug 13: moved to 9:00 AM – 2:00 PM (was 7:30 AM – 12:30 PM)"*).

- Publishing a full week collapses into **one notification per person**, not seven
- A first-time publish establishes the schedule rather than reporting a change, so it doesn't notify the whole roster
- Approving a request doesn't double-notify — the approval message covers it

## Live updates
Notifications and pending requests refresh automatically — when the browser tab regains focus, and
on a background interval while the tab is visible. Updates arrive without a page reload, preserving
scroll position, open dialogs, and in-progress work.

## Security
- **Passwords** hashed with bcrypt; plaintext is never stored or logged
- **Sessions** use signed tokens with a fixed expiry
- **Immediate revocation** — removing an employee or resetting a password ends their active sessions right away, rather than leaving a valid session until it expires
- **Server-side authorization** on every request; role and identity are read from the database, never trusted from the client
- **Scoped data access** — employees can only read their own availability and requests, and only receive notifications addressed to them
- **Forced password change** on new accounts, enforced server-side
- **Rate-limited logins**, per account, so one person's failed attempts can't lock out the team
- **Security headers** via Helmet
- **Input validation** on every write, with clear errors for invalid data

---

# Data model

| Collection | Purpose |
|---|---|
| **Staff** | The roster — name, default hours, desk assignment, weekly hour cap |
| **User** | Login accounts — username, password hash, role, link to a staff record |
| **Schedule** | One day — staff shifts, events, publish state, and the last published baseline |
| **Event** | Programs, services, meetings, workshops — timing, staffing needs, assignments, recurrence |
| **Template** | Reusable weekly or single-day staffing patterns |
| **Availability** | Each employee's submitted weekly availability |
| **Request** | Drop, cover, and swap requests with approval status |
| **Notification** | Messages with addressing, read state, and change details |

---

# API reference

All routes are prefixed `/api`. Every route except `POST /auth/login` requires a valid session.
Manager-only routes are marked **M**.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/login` | Sign in, receive a session token |
| GET | `/auth/me` | Restore the current session |
| POST | `/auth/change-password` | Set a new password |
| POST | `/auth/provision` **M** | Create an account, return a one-time temporary password |
| POST | `/auth/reset` **M** | Reset an employee's password |
| GET | `/staff` · `/staff/:id` | Read the roster |
| POST · PATCH · DELETE | `/staff` · `/staff/:id` **M** | Add, update, remove staff |
| GET | `/schedules?from=&to=` | Bulk-read schedules across a date range |
| GET | `/schedules/:date` | Read one day |
| PUT | `/schedules/:date` **M** | Save or publish a day |
| GET | `/events` | List events |
| POST · PATCH · DELETE | `/events` · `/events/:id` **M** | Manage events |
| GET | `/availability` **M** | All submitted availability |
| GET · PUT | `/availability/:staffId` | Read/submit one person's availability (own, or any as manager) |
| GET | `/templates` | List templates |
| POST · PATCH · DELETE | `/templates` · `/templates/:id` **M** | Manage templates |
| GET · POST | `/notifications` | Read (scoped to the caller) / create |
| PATCH · DELETE | `/notifications/:id` | Mark read / dismiss |
| GET · POST | `/requests` | Read (scoped to the caller) / submit |
| PATCH | `/requests/:id` | Coworker accepts/declines a request aimed at them, or **M** approves/denies |

---

# Running locally

**Requirements:** Node.js 18+ and a MongoDB connection string.

### Backend
```bash
cd scheduling-app/src/backend
npm install
# create .env with:
#   MONGODB_URI=<your connection string>
#   JWT_SECRET=<a long random string>
#   SLACK_ENABLED=false
npm run seed -- --yes   # first run only — creates sample staff and accounts
npm run dev         # http://localhost:3001
```

### Frontend
```bash
cd scheduling-app
npm install
npm run dev         # http://localhost:5173
```

### Scripts
| Command | Effect |
|---|---|
| `npm run seed` | Reports what a reset would destroy, then exits without changing anything |
| `npm run seed -- --yes` | **Destructive.** Deletes every staff member and every account, then rebuilds both from sample data — replacing all passwords with shared, publicly-known ones. Refuses to run when `NODE_ENV=production` |
| `npm run seed:users` | Creates login accounts for existing staff — safe to re-run, deletes nothing |
| `npm run seed:availability` | Loads sample availability — upserts, deletes nothing |

---

# Current status

The application is **feature-complete for evaluation and running in development.** It has not yet
been deployed to a hosted environment.

**Working today:** authentication and account management, the full scheduling editor (daily and
weekly), templates, events, availability, the complete request and approval workflow, and automatic
schedule-change notifications.

**Before production use:**

| Item | Notes |
|---|---|
| Hosting and HTTPS | Needs a hosted environment and a domain with TLS |
| Configuration | The API address and allowed origins are currently hardcoded for local development |
| Sample accounts | Demo credentials are displayed on the login page and shared across sample accounts — replace with real provisioned accounts |
| Data policy review | If any staff are student employees, scheduling records may fall under FERPA and warrant institutional review before hosting |
| Slack integration | Scaffolded but inactive — no message handlers are registered yet |

**Possible next steps:** real-time push updates over WebSockets, Slack notification delivery,
institutional single sign-on (Microsoft/Entra), and reporting on hours worked.

### Next steps: Slack

The Slack groundwork is already in place — Bolt is installed and the backend connects over Socket
Mode as soon as a bot token, signing secret, and app token are supplied, with the connection kept
deliberately optional so a bad token can never stop the API from serving. What's missing is the
bridge between the app and the workspace. The first step is storing a Slack user ID alongside each
staff record, which is what lets a notification find a person; from there, the existing notification
pipeline can mirror anything addressed to an employee straight into a DM, so schedule changes and
cover requests reach people where they already are instead of waiting to be discovered on the
notifications page. The natural follow-on is making those messages interactive — Accept and Decline
buttons on a cover request, Approve and Deny for the manager — so a shift can be settled without
anyone opening the app. Worth noting for whoever picks this up: Socket Mode needs no public URL,
which is ideal for internal use, but a hosted deployment may be simpler to run in HTTP mode, and
`slackClient.js` documents the switch.
