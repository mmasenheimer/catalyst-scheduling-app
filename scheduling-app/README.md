# CATalyst Studios — Team Management

A scheduling and team management web app built for library and service-team environments. Managers can build daily schedules interactively, track events, and manage weekly staffing templates. Employees can view their shifts, request coverage, and receive notifications.

---

## Features

**Manager**
- Interactive daily schedule with drag-and-drop shift, desk, and event bars
- Resize and reposition bars directly on a time grid (30-minute snapping)
- Drag bars to a trash zone to remove or unschedule them
- Drag new shift, desk, or event chips from a toolbar onto any employee row
- View all employees on a given day — scheduled and unscheduled
- Weekly template editor: define which staff work each day of the week
- Add and configure events with staff requirements and notes
- Notifications for coverage requests, shift changes, understaffed days, and approvals

**Employee**
- Personal schedule view
- Shift swap requests
- Drop shift / time-off requests
- Shared notification feed

**General**
- Role-based routing (manager vs. employee views)
- Live clock and date in the sidebar
- Notification badge showing unread count

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Build tool | Vite 8 |
| Routing | React Router DOM v7 |
| Styling | Tailwind CSS 3 |
| State | React Context API |
| Drag and drop | HTML5 Drag and Drop API + mouse events for resize |

---

## Project Structure

```
src/
  backend/          # Node/Express server (in progress)
  data/             # Mock data (staff, events, weekly templates)
  frontend/
    components/     # Shared layout and route protection
    context/        # AuthContext, ScheduleContext, NotificationsContext
    hooks/          # useSchedule
    pages/          # One file per route
    utils/          # Schedule helpers and formatting
```

---

## Getting Started

```bash
npm install
npm run dev
```

The app runs on `http://localhost:5173` by default. Backend is not yet connected — all data is currently served from mock files in `src/data/`.

---

## Planned Backend

The backend (Node/Express) will expose roughly 35 REST endpoints covering auth, staff management, daily schedule mutations, event CRUD, weekly templates, shift requests, and notifications. See `src/backend/` for the server entry point.
