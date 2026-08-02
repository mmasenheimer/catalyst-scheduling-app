# CATalyst Studios — Scheduling App

**University of Arizona Libraries**
Michael Masenheimer · Revised August 2026

---

## How to use this document

Figures are numbered and referenced in the text (*Figure 3*). Each one sits directly
below the paragraph that introduces it, with a caption underneath. Where a figure is a
composite of several screenshots, the caption says so and labels the parts.

If you are rebuilding this in Google Docs: keep every screenshot at a single consistent
width, left-aligned rather than centered, with the caption in a smaller italic style
directly beneath. The original draft mixed widths and centering, which is most of why it
read as cluttered. Crop each shot to the panel being discussed instead of pasting the
whole browser window — a reader looking at *Figure 8* should not have to hunt for the
alerts box inside a full-page screenshot.

---

## Contents

1. [Purpose](#1-purpose)
2. [Where the project stands](#2-where-the-project-stands)
3. [Technology](#3-technology)
4. [Accounts and passwords](#4-accounts-and-passwords)
5. [Manager's side](#5-managers-side)
6. [Employee's side](#6-employees-side)
7. [How a shift request moves](#7-how-a-shift-request-moves)
8. [What the app notifies about](#8-what-the-app-notifies-about)
9. [Rules the app enforces](#9-rules-the-app-enforces)
10. [Security](#10-security)
11. [Running it locally](#11-running-it-locally)
12. [What's next](#12-whats-next)

---

## 1. Purpose

Scheduling at CATalyst Studios currently runs on WhenToWork — a hosted product that builds
work calendars, tracks availability, and handles trades and time-off requests through its
own website. It works, but it costs money, it has no connection to Slack (where the studio
actually communicates), and its interface carries a great deal of weight the studio has
never needed.

The CATalyst Scheduling app is a replacement built specifically for this studio. Managers
build a schedule by dragging blocks onto a grid, and the app checks the result as they go
— weekly hour caps, desk coverage, event staffing, understaffed windows. Employees submit
availability, request coverage, propose swaps, and drop shifts in the same app rather than
through the manager's inbox.

**Cost.** WhenToWork is a recurring subscription. This app is planned to run on Jetstream2
under University of Arizona research funding, so the studio's ongoing hosting cost is
**$0**.

**Slack.** The studio's actual hub is Slack, and WhenToWork cannot reach it. This app is
built with that integration as the intended endpoint — the groundwork is in place and the
plan is described in [§12](#12-whats-next).

Three ideas the system is built around:

**One roster, one action.** Adding or removing an employee updates the schedule, their
login, their event assignments, and their permissions together. There is no second place
to remember to update.

**Employees serve themselves.** Availability, drop requests, and coverage or swap requests
all flow through the app with a clear approval trail, instead of arriving as Slack DMs the
manager has to track by hand.

**Weeks start from something known-good.** Recurring patterns are saved as templates —
including one the app can generate from submitted availability — so building a week starts
from a working baseline rather than an empty grid.

---

## 2. Where the project stands

Everything described in sections 4 through 11 is **built and working**. The app runs
end-to-end: managers schedule, employees request, notifications fire, changes apply.

Two things are not done. **Slack integration** is scaffolded but not connected — the
library is installed and the backend will connect when given credentials, but no messages
flow yet ([§12](#12-whats-next)). And the app has **not been deployed**; it currently runs
locally against a hosted MongoDB Atlas database.

---

## 3. Technology

Recorded here so that whoever picks this up next knows what they are looking at.

### Frontend

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Build tool | Vite 8 |
| Routing | React Router DOM 7 |
| Styling | Tailwind CSS 3 with custom theming |
| State | React Context API |
| Drag and drop | Native HTML5 drag plus pointer events |
| Icons | Inline SVG components |

### Backend

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| API framework | Express 5 |
| Database | MongoDB Atlas via Mongoose 9 |
| Authentication | JSON Web Tokens |
| Password hashing | bcryptjs |
| Security headers | Helmet |
| Abuse protection | express-rate-limit |
| Chat integration | Slack Bolt *(scaffolded, not yet active)* |

> **Figure 1** — Architecture diagram: browser → Express API → MongoDB Atlas, with the
> Slack path drawn as a dashed line to mark it as planned.
>
> *This replaces the "Mural of the Project" placeholder page in the previous draft. A
> simple three-box diagram is worth more here than a decorative image, and it gives a
> reader the shape of the system before section 5 drops them into screenshots.*

---

## 4. Accounts and passwords

### Logging in

One entry point for everybody. Anyone who visits any page without a valid session lands
here.

> **Figure 2** — The login screen.

- Sessions survive a browser refresh
- An expired or revoked session returns you here automatically
- Failed attempts are rate-limited **per account**, so one person locking themselves out
  cannot lock out the studio

> **Note for the live deployment:** the current login screen displays development
> credentials as a testing convenience. That panel is removed before this goes in front
> of real staff, and the seeded `manager / catalyst123` account is replaced with real
> accounts.

### Setting a password

There is no email in this system, by design — everything is internal to CATalyst, so the
manager holds the reset. The set-password screen serves two purposes.

**First-time setup, and it is forced.** New accounts are created with a temporary password
and cannot use any part of the app until the employee chooses their own. The manager
generates and hands over that temporary password but never learns what the employee sets
afterward.

> **Figure 3** — The first-run flow, three panels:
> **(a)** Manage Staff, with *Reset Password* beside each employee;
> **(b)** the one-time temporary password shown to the manager after adding someone;
> **(c)** the *Set your password* screen the employee sees on first sign-in.
>
> *Presenting these as one labelled three-panel figure — rather than the loose cluster in
> the previous draft — makes the sequence readable in one pass.*

The temporary password is shown **once**. If it is lost, the manager issues a new one from
*Reset Password*.

**Voluntary change.** Changing your own password requires your current password, so an
unattended logged-in browser cannot be used to lock the owner out. A successful change
signs out your other sessions but keeps the one you are using.

### Manager accounts

Manager accounts are provisioned separately from employees and are not part of the
schedulable roster — a manager does not appear as a row on the schedule grid. Multiple
managers can hold their own accounts and be signed in simultaneously.

One thing worth knowing if more than one manager uses the app: notifications addressed to
"the manager" are a **single shared item**. If one manager dismisses a pending request,
it disappears for all of them. The pending request itself is untouched and still waiting
in the app — but the reminder is gone. The practical guidance for secondary managers is
to read and not dismiss.

---

## 5. Manager's side

### 5.1 Daily Schedule — the home page

The core workspace: one day, an hour-by-hour grid, one row per employee, snapping to
thirty minutes.

> **Figure 4** — The Daily Schedule view.

There are two editing views — this one and the Weekly View ([§5.2](#52-weekly-view)) —
with **identical** editing capability. The daily view is simply quicker because it loads
one day instead of seven. Which one to schedule in is entirely the manager's preference.

The blue bars sitting behind the shifts are each employee's submitted availability.
Scheduling outside them raises a warning but is permitted — the manager can always
override.

#### Building a schedule

- **Drag** a *Shift*, *Desk*, or *Event* chip from the toolbar onto any employee's row
- **Move** an existing bar by dragging it sideways; **resize** it by grabbing either edge
- **Remove** a bar by dragging it to the trash zone
- **Right-click** any bar for edit and delete options
- A **live preview** shows exactly where a bar will land before you release
- Dragging near the bottom of the window **scrolls the page automatically**, so a bar can
  be dropped on a row below the fold without letting go

> **Figure 5** — Editing, as a five-part composite:
> **(a)** the toolbar chips; **(b)** bars being moved and resized; **(c)** the trash zone;
> **(d)** the right-click menu with the Edit Event dialog beside it; **(e)** the drop
> preview.
>
> *The previous draft ran these as five separate screenshots at five different widths.
> Grouping them into one figure with lettered parts is a large part of the decluttering.*

#### Live coverage warnings

These appear above the grid and update as you edit.

| Warning | Meaning |
|---|---|
| **Understaffed window** | A half-hour below the configured minimum for that day type |
| **Desk coverage gap** | Staff are working, but nobody is on the desk during desk hours |
| **Concurrent desk assignment** | More than one person on the desk at the same time |
| **Desk/event conflict** | Somebody is on the desk while assigned to an event |
| **Unfilled event** | An event with fewer staff assigned than it requires |

> **Figure 6** — The alerts panel showing each warning type. One cropped screenshot of the
> panel is enough; the previous draft used four, one per warning.

#### Day management

Previous and next day navigation, live counts for *On Shift Today*, *On Shift Now*, and
*Events*, plus:

- **Finalize** publishes the day
- **Auto-unfinalize** — editing a published day returns it to draft, so "published" always
  reflects exactly what was approved, never a half-edited state
- **Save as Template** and **Apply Template** — covered in [§5.4](#54-templates)

### 5.2 Weekly View

All seven days stacked, each fully editable with the same tools as the daily view.

> **Figure 7** — The Weekly View. One representative day expanded is clearer than the
> four stitched partial screenshots in the previous draft; a caption can note that all
> seven days are present.

- Weekly hour-limit warnings at the top, listing anyone scheduled over their cap
- Week-at-a-time navigation
- Per-day finalize, plus **Finalize All** for the whole week
- A pre-flight check: finalizing a week that still has coverage issues lists them and asks
  for confirmation first
- Today's column shows live *on shift now* and *on shift today* counts
- Apply a template across the week, or save the week as a new template

> **Figure 8** — Two panels: **(a)** the over-hours warning list; **(b)** the "Some Days
> Have Issues" confirmation dialog.

### 5.3 Event Calendar

Every event for the month, for an overview of how busy things are. Clicking a day opens
that day's events; clicking an event opens it for editing. *Open Daily Schedule* jumps
straight to that day's grid.

> **Figure 9** — The month calendar, with the day popover and Edit Event dialog as a
> second panel.

### 5.4 Templates

Templates are a **sandbox**. They are a place to work out how a week fits together without
touching anything live. Changes made inside a template never reach the real schedule —
they only apply when the manager explicitly applies the template to a date.

Templates come in two kinds:

- **Weekly templates** — a set of daily layouts covering the studio's six open days:
  Monday through Friday, plus Sunday. Saturday is closed, so it has no template day.
- **Day templates** — a single day's layout, applicable to any date

> **Figure 10** — The templates list, showing the weekly and day sections.

> *Correction from the previous draft, which described a weekly template as "blocks of 7
> daily templates" in one place and a "Mon-Friday block" in another. It is six days:
> Mon–Fri and Sun.*

Duplicated names are automatically numbered — `(1)`, `(2)`, `(3)`.

#### Creating a template

**+ New Template** starts a weekly or day template from scratch.

**+ Auto-Generate from Availability** builds an entire week from what staff have actually
submitted. This is the feature most worth understanding, so it gets its own explanation
below.

> **Figure 11** — The New Template dialog and the auto-generate result screen side by side.

#### How auto-generation works

The generator breaks each open day into thirty-minute slots and walks through them,
filling any slot below its required headcount with the best available person.

"Best" comes from a short priority list. It strongly prefers whoever is already working
the previous slot — this is what makes continuous shifts emerge rather than scattered
fragments. Then it prefers whoever can cover a worthwhile stretch, then whoever has used
the smallest share of their weekly hour cap, so work spreads in proportion to what each
person offered.

**Nobody is ever scheduled outside their submitted availability**, or past their daily,
weekly, or shift-length limits. If nobody is available for a slot, it is left short and
reported as a gap rather than quietly filled.

Several rules exist because student availability is rarely one clean block per day:

- **Fragmented availability is handled directly.** Someone available 8–11 and again 2–6:30
  because of a class in between can be given both blocks as two shifts, and the generator
  will do so when the day needs it.
- **It will not ask someone back for an unreasonably short second shift.** If a person has
  already worked that day and is not continuing straight on, a second block is only
  offered if it meets the full minimum shift length. Nobody gets asked to return to campus
  for half an hour.
- **Two passes across the whole week** — every day's true minimum first, then a
  one-person cushion on top — so padding Monday cannot starve Thursday's minimum.

Desk coverage is assigned in the same run:

- Desk turns are only placed during the hours the desk is actually staffed —
  **9:00–6:00 Monday through Thursday, 9:00–5:45 Friday, and 1:00–6:00 Sunday**
- A single desk turn is capped at **one hour**
- The generator tries to avoid giving anyone **two desk turns in one shift**

Finally, consecutive slots are merged into shifts, anything under two hours is stretched
into adjacent availability where the limits allow, and the whole proposal comes back with
per-person hours, warnings, and any coverage gaps for the manager to review before saving.

#### Editing a template

Select a day with the buttons across the top, then edit exactly as in the daily or weekly
view — minus events, which templates do not carry.

> **Figure 12** — Two panels: **(a)** the day selector; **(b)** a template being edited,
> with the staff pool visible.

- Alerts behave as normal, without the event-related ones
- To add somebody to the day, drag their name from the **staff pool** onto the grid; an
  empty row appears showing their availability, and you can schedule inside it
- Remove somebody from the day with the **×** beside their name

#### Applying a template

Hover a date and click *Apply* to overwrite that day or week with the template.

> **Figure 13** — The Apply Template dialog, in both its day and week modes.

### 5.5 Creating events

Event name is required; event type is optional but recommended.

> **Figure 14** — The Add Special Event form.

**Dates.** Click the calendar icon beside the date field, pick a date, then click **Add** —
the date is not attached until you do.

**Assigning staff.** Once a date is added, the form lists everyone working that day and
highlights who is working during the proposed event hours. Selecting people assigns the
event to their schedules, and **each person selected is notified that they have been put
on it**. If somebody is later removed from an event, or the event is cancelled outright,
they are told that too.

> **Figure 15** — Two panels: **(a)** picking a date and clicking Add; **(b)** the staff
> assignment list with working hours shown per person.

**If an assigned shift does not cover the event**, the app stretches it so that it does.
Somebody assigned to a 3:00–5:00 event who is scheduled 1:00–4:00 has their shift extended
to 5:00 rather than being left half-covering it.

**Repeating events.** Tick *Repeats weekly* and choose a start and end date. Repeats are
only available when exactly one date has been added.

> **Figure 16** — The repeat controls with the date-range picker.

### 5.6 Staff Availability

Everyone's submitted availability in one view, with the date each person last submitted,
so scheduling works against real constraints rather than requiring the manager to check
with people individually.

> **Figure 17** — The Staff Availability page.

### 5.7 Manage Staff

The roster hub — people join and leave CATalyst, and this is where that is handled.

> **Figure 18** — The Manage Staff page.

**Adding someone** takes three fields: name, username (which becomes their login), and
weekly hour cap. This creates the roster entry and the login account together, then shows
a one-time temporary password to hand over.

> **Figure 19** — The Add Employee dialog.

**Removing someone** is one action that: deletes the roster entry, revokes the login, ends
any active session immediately, unassigns them from all events, cancels their outstanding
requests, and removes them from stored schedules. Nothing is left pointing at a person who
no longer works here.

### 5.8 Manager notifications

> **Figure 20** — The manager's notifications page.

Managers receive:

- **Drop requests**, with Approve and Deny directly on the notification
- **Cover and swap requests that a coworker has already accepted** — likewise with Approve
  and Deny. A request the coworker has not accepted yet does not reach the manager at all
  ([§7](#7-how-a-shift-request-moves))
- **Availability submissions**

Approving makes the schedule change automatically — the manager does not then have to go
and edit the grid by hand.

Notifications can be marked read individually or dismissed in bulk.

---

## 6. Employee's side

### 6.1 My Schedule

A read-only week showing that employee's shifts, desk turns, and events, with totals for
shifts, hours, and events across the top.

> **Figure 21** — My Schedule.

### 6.2 Weekly View

The same seven-day layout the manager sees, read-only, so employees have context on what
their coworkers are doing.

> **Figure 22** — The employee Weekly View.

### 6.3 Event Calendar

The same month layout as the manager's calendar, but showing that employee's shifts, desk
turns, and events rather than events alone. Clicking a day shows what they are working.

> **Figure 23** — The employee calendar, with the day popover.

### 6.4 Shift Requests

Employees have two ways to move a shift: ask somebody to cover it, or propose a swap.

**Request Cover** looks **three weeks ahead**, lists the days you are scheduled, and — for
whichever day you pick — shows who is free to take it. One click sends the request.

**Propose Swap** works the same way, with the same day picker, and sorts candidates by
whether their shift overlaps yours.

Both are **shift-level**. If you work two shifts on one day, you choose which one you are
asking about, and the request carries that specific shift rather than your whole day.

Days are grouped into week containers rather than listed as one long row, which keeps three
weeks of dates readable.

> **Figure 24** — Two panels: **(a)** Request Cover with the week-grouped day picker;
> **(b)** Propose Swap showing overlapping and non-overlapping candidates.

The point of this page is to replace scrolling the schedule and DMing people one at a time
on Slack to find somebody free.

A submitted request can be **withdrawn** by the person who sent it, at any point before it
is decided.

### 6.5 Drop Shift

Employees can request to drop a shift, with a calendar that only permits dates **at least
two weeks out**. It goes straight to the manager to approve or deny — there is no coworker
stage, since nobody is being asked to take it on.

> **Figure 25** — The Drop Shift page.

### 6.6 Availability

Where employees paint their weekly availability — available or unavailable, with no
"preferred" tier.

> **Figure 26** — The availability grid.

**Send** does two things: notifies the manager that this person's availability changed, and
updates the blue availability bars in the manager's scheduling views. Employees can update
their availability at any time.

### 6.7 Employee notifications

Same interface as the manager's, with different contents.

> **Figure 27** — The employee notifications page.

Employees are notified when:

- **Their schedule changes** — including shifts that were removed, which are tagged
  *Dropped Shift* rather than the generic *Shift Change*
- **Somebody asks them to cover or swap** — with Accept and Decline on the notification
- **A request they sent** is accepted, declined, approved, or denied
- **They are assigned to an event**, removed from one, or an event they were on is
  cancelled

Changes made close together are combined into a single notification rather than arriving as
a stream of separate ones.

> *Correction from the previous draft, which said changes condense "if there were more than
> 3 changes." The rule is time-based, not count-based: changes to the same person within a
> five-minute window merge into one notification.*

---

## 7. How a shift request moves

This is the part of the app with the most moving pieces, so it is worth setting out on its
own.

### Cover and swap: two stages

```
  Employee A                Employee B                 Manager
      │                          │                        │
      │  asks B to cover ───────►│                        │
      │                          │                        │
      │                    Accept or Decline              │
      │                          │                        │
      │◄──── declined ───────────┤  (ends here)           │
      │                          │                        │
      │                          └── accepted ───────────►│
      │                                                   │
      │                                        Approve or Deny
      │                                                   │
      │◄────────── schedule updated on approval ──────────┘
```

**The coworker is asked first.** They get a notification with Accept and Decline. Only if
they accept does the request reach the manager, who then approves or denies it. If they
decline, the request ends there and the manager never sees it — the requester is told.

This ordering matters: it means nobody is put on a shift they never agreed to, and the
manager's queue only ever contains requests where both employees are already on board.

**The schedule only changes when the manager approves.** Both employee stages are
agreements; the manager makes it real.

**What was agreed is what gets applied.** The specific shift each person agreed to is
recorded when the request is made. If the schedule shifts underneath a pending request —
because the manager rescheduled one of them in the meantime — approval will not silently
exchange hours nobody agreed to. The manager is told the request no longer matches.

### Drop requests: one stage

A drop request has no coworker to ask, so it goes straight to the manager. Requests must
be at least two weeks out.

### At any point before a decision

The person who sent a request can **withdraw** it. It disappears from whoever's queue it
was sitting in.

---

## 8. What the app notifies about

| Event | Who hears about it |
|---|---|
| Schedule published with changes | Each affected employee |
| Shift removed | That employee, tagged *Dropped Shift* |
| Assigned to an event | That employee |
| Removed from an event, or event cancelled | That employee |
| Cover or swap request sent | The coworker being asked |
| Coworker accepts | The requester, and the manager |
| Coworker declines | The requester |
| Request withdrawn | Whoever was waiting on it |
| Manager approves or denies | Both employees involved |
| Drop request submitted | The manager |
| Availability submitted | The manager |

### Schedule change notifications in detail

When a manager publishes, the app compares the new version against the **previously
published** version and notifies only the people whose own shifts actually changed,
describing the difference in plain terms:

> *Thu, Aug 13: moved to 9:00 AM – 2:00 PM (was 7:30 AM – 12:30 PM)*

- Publishing a full week produces **one notification per person**, not seven
- A first-time publish establishes the schedule rather than reporting a change, so it does
  not notify the entire roster about a week they are seeing for the first time
- Approving a request does not double-notify — the approval message covers it

### Live updates

Notifications and pending requests refresh on their own: when the browser tab regains
focus, and on a background interval while the tab is visible. Updates arrive without a page
reload, so scroll position, open dialogs, and in-progress work are preserved.

---

## 9. Rules the app enforces

Collected in one place, since they are otherwise scattered across the sections above.

| Rule | Behaviour |
|---|---|
| Availability | Scheduling outside it warns, but the manager may override |
| Weekly hour cap | Per employee; going over raises a warning |
| Minimum staffing | Per day type; shortfalls listed by half-hour window |
| Desk hours | Mon–Thu 9:00–6:00, Fri 9:00–5:45, Sun 1:00–6:00, Sat closed |
| Desk turn length | Capped at one hour when auto-generated |
| Desk overlap | Two people on the desk at once is flagged |
| Desk vs. events | Being on the desk during an assigned event is flagged |
| Event staffing | Events below their required headcount are flagged |
| Event coverage | A shift is stretched to cover an event the person is assigned to |
| Adjacent shifts | Shifts that touch are merged into one |
| Drop notice | At least two weeks ahead |
| Cover/swap window | Three weeks ahead |
| Publishing | Editing a published day returns it to draft automatically |

**Concurrent editing.** If two managers have the same day open and both save, the second
save is rejected rather than silently overwriting the first. The app reports the conflict
instead of losing work.

---

## 10. Security

- **Passwords** are hashed with bcrypt; plaintext is never stored or logged
- **Sessions** use signed tokens with a fixed expiry
- **Revocation is immediate** — removing an employee or resetting a password ends their
  active sessions right away, rather than leaving a valid session until it expires
- **Authorization is server-side on every request.** Role and identity are read from the
  database on each call, never trusted from the browser
- **Data access is scoped** — employees can read only their own availability, only the
  requests they are part of, and only notifications addressed to them
- **Notifications cannot be forged.** Anything carrying an Approve or Deny button is
  written by the server, so a notification cannot be sent under somebody else's name or
  attached to a request the sender is not part of
- **Password change is forced** on new accounts, enforced by the server rather than the
  interface
- **Logins are rate-limited per account**, so one person's failed attempts cannot lock out
  the team
- **Security headers** via Helmet
- **Every write is validated**, with clear errors for invalid data
- **Destructive scripts refuse to run in production** and require explicit confirmation

---

## 11. Running it locally

**Requirements:** Node.js 18+ and a MongoDB connection string.

### Backend

```bash
cd scheduling-app/src/backend
npm install

# create .env with:
#   MONGODB_URI=
#   JWT_SECRET=
#   SLACK_ENABLED=false

npm run seed -- --yes    # first run only — creates sample staff and accounts
npm run dev              # http://localhost:3001
```

### Frontend

From the project root, in a second terminal:

```bash
cd scheduling-app
npm install
npm run dev              # http://localhost:5173
```

### Scripts

| Command | Effect |
|---|---|
| `npm run seed` | Reports what it *would* destroy, then exits without writing |
| `npm run seed -- --yes` | **Resets** all staff and accounts from sample data |
| `npm run seed:users` | Creates login accounts for existing staff — safe to re-run, deletes nothing |
| `npm run seed:availability` | Populates sample availability |

> `npm run seed` deliberately does nothing without `--yes`. It names the database it is
> pointed at and counts what it would delete, so it cannot wipe real data because somebody
> ran the wrong command in the wrong terminal. It refuses outright in production.

---

## 12. What's next

### Slack integration

The groundwork is in place. Bolt is installed, and the backend connects over Socket Mode as
soon as a bot token, signing secret, and app token are supplied. The connection is
deliberately optional, so a bad token can never stop the API from serving.

What is missing is the bridge between the app and the workspace.

**First step:** store a Slack user ID alongside each staff record. That is what lets a
notification find a person.

**Then:** mirror anything addressed to an employee straight into a DM. The notification
pipeline already exists and already knows who each message is for, so schedule changes and
cover requests would reach people where they already are, instead of waiting to be
discovered on a page they have to remember to open.

**Then:** make those messages interactive — Accept and Decline on a cover request, Approve
and Deny for the manager — so a shift can be settled without anyone opening the app at all.

Worth noting for whoever picks this up: Socket Mode needs no public URL, which suits
internal use, but a hosted deployment may be simpler to run in HTTP mode. `slackClient.js`
documents the switch.

### Deployment

The app has not yet been deployed. Jetstream2 hosting is the plan; the remaining work is
standard — a public hostname, HTTPS, and pointing the frontend at the deployed API rather
than localhost.
