import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ScheduleProvider } from "../../context/ScheduleContext";
import { NotificationsProvider, useNotifications } from "../../context/NotificationsContext";

const managerNav = [
  { to: "/",               label: "Daily Schedule" },
  { to: "/calendar",       label: "Calendar" },
  { to: "/templates",      label: "Weekly Templates" },
  { to: "/my-schedule",    label: "My Schedule" },
  { to: "/add-event",      label: "Add Event" },
  { to: "/notifications",  label: "Notifications" },
];

const employeeNav = [
  { to: "/my-schedule",       label: "My Schedule" },
  { to: "/calendar",          label: "Calendar" },
  { to: "/shift-requests",    label: "Shift Requests" },
  { to: "/request-time-off",  label: "Drop Shift" },
  { to: "/notifications",     label: "Notifications" },
];

function AppLayoutInner() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const navItems = user?.role === "manager" ? managerNav : employeeNav;
  const [now, setNow] = useState(new Date());
  const { unreadCount } = useNotifications();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div
      className="flex min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
      {/* Sidebar */}
      <aside
        className="w-52 shrink-0 flex flex-col gap-1 p-4 border-r"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)",
        }}
      >
        <button
          onClick={() => navigate(user?.role === "manager" ? "/" : "/my-schedule")}
          className="mb-3 px-2 text-left w-full cursor-pointer hover:opacity-80 transition-opacity"
          style={{ background: "none", border: "none" }}
        >
          <h1 className="text-lg font-bold" style={{ color: "#f8fafc" }}>
            CATalyst studios
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-dim)" }}>
            Team Management
          </p>
          <p className="text-xs mt-1.5 font-mono tabular-nums" style={{ color: "var(--color-accent-bright)" }}>
            {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-dim)" }}>
            {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </p>
        </button>

        <div className="mb-3" style={{ borderBottom: "1px solid var(--color-border)" }} />

        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className="relative py-2 px-3 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
            style={({ isActive }) => ({
              background: isActive ? "rgba(176, 80, 48, 0.1)" : "transparent",
              color: isActive ? "var(--color-text)" : "var(--color-text-dim)",
              borderLeft: `2px solid ${isActive ? "var(--color-accent)" : "transparent"}`,
            })}
          >
            {label}
            {to === "/notifications" && unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1"
                style={{ background: "#c84040", color: "white", lineHeight: 1 }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </NavLink>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User info + logout */}
        <div
          className="mt-4 p-3 rounded-lg border"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
            {user?.name}
          </div>
          <div className="text-xs capitalize mt-0.5" style={{ color: "var(--color-text-dim)" }}>
            {user?.role}
          </div>
          <button
            onClick={handleLogout}
            className="mt-2 w-full text-xs py-1.5 rounded border cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text-dim)",
              background: "transparent",
            }}
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}

export default function AppLayout() {
  return (
    <ScheduleProvider>
      <NotificationsProvider>
        <AppLayoutInner />
      </NotificationsProvider>
    </ScheduleProvider>
  );
}
