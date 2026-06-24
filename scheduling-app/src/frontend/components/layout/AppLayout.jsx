import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ScheduleProvider } from "../../context/ScheduleContext";
import { NotificationsProvider, useNotifications } from "../../context/NotificationsContext";
import { TemplatesProvider, useTemplates } from "../../context/TemplatesContext";

function useTheme() {
  const [light, setLight] = useState(() => localStorage.getItem("theme") === "light");

  useEffect(() => {
    if (light) {
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.remove("light");
      localStorage.setItem("theme", "dark");
    }
  }, [light]);

  return [light, () => setLight(v => !v)];
}

const managerNav = [
  { to: "/",               label: "Daily Schedule" },
  { to: "/calendar",       label: "Calendar" },
  { to: "/templates",      label: "Weekly Templates" },
  { to: "/my-schedule",    label: "My Schedule" },
  { to: "/add-event",      label: "Add Event" },
  { to: "/staff-availability", label: "Staff Availability" },
  { to: "/notifications",      label: "Notifications" },
];

const employeeNav = [
  { to: "/my-schedule",       label: "My Schedule" },
  { to: "/calendar",          label: "Calendar" },
  { to: "/shift-requests",    label: "Shift Requests" },
  { to: "/request-time-off",  label: "Drop Shift" },
  { to: "/availability",      label: "Availability" },
  { to: "/notifications",     label: "Notifications" },
];

function IconMenu() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
      <rect x="0" y="0"  width="18" height="2" rx="1" fill="currentColor"/>
      <rect x="0" y="6"  width="18" height="2" rx="1" fill="currentColor"/>
      <rect x="0" y="12" width="18" height="2" rx="1" fill="currentColor"/>
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M11.89 4.11l1.06-1.06M3.05 12.95l1.06-1.06" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M12.5 9.5A6 6 0 015.5 2.5a6 6 0 100 10 6 6 0 007-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

function IconBell() {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
      <path d="M8.5 1.5A4.5 4.5 0 004 6v3.5L2.5 12h12L13 9.5V6A4.5 4.5 0 008.5 1.5z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M7 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function AppLayoutInner() {
  const { user, logout } = useAuth();
  const navigate          = useNavigate();
  const location          = useLocation();
  const navItems          = user?.role === "manager" ? managerNav : employeeNav;
  const [now, setNow]     = useState(new Date());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { unreadCount }   = useNotifications();
  const [isLight, toggleTheme] = useTheme();
  const { templates, selectedId, setSelectedId, setTriggerNew } = useTemplates();
  const isTemplates = location.pathname === '/templates';

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Close drawer when viewport widens to desktop
  useEffect(() => {
    function onResize() { if (window.innerWidth >= 1024) setDrawerOpen(false); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Close drawer on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") setDrawerOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const navLinks = navItems.map(({ to, label }) => (
    <NavLink
      key={to}
      to={to}
      end={to === "/"}
      className="relative py-2 px-3 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
      style={({ isActive }) => ({
        background:  isActive ? "rgba(176, 80, 48, 0.1)" : "transparent",
        color:       isActive ? "var(--color-text)" : "var(--color-text-dim)",
        borderLeft: `2px solid ${isActive ? "var(--color-accent)" : "transparent"}`,
      })}
    >
      {label}
      {to === "/notifications" && unreadCount > 0 && (
        <span
          className="absolute top-1/2 -translate-y-1/2 right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-bold px-1"
          style={{ background: "#c84040", color: "white", lineHeight: 1 }}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </NavLink>
  ));

  const userCard = (
    <div className="mt-4 p-3 rounded-lg border" style={{ borderColor: "var(--color-border)" }}>
      <div className="text-xs font-medium text-center" style={{ color: "var(--color-text)" }}>
        {user?.name}
      </div>
      <div className="flex gap-2 mt-2">
        <button
          onClick={handleLogout}
          className="flex-1 text-xs py-1.5 rounded cursor-pointer hover:opacity-80 transition-opacity"
          style={{ background: "var(--color-accent)", color: "white", border: "none" }}
        >
          Log out
        </button>
        <button
          onClick={toggleTheme}
          title={isLight ? "Switch to dark mode" : "Switch to light mode"}
          className="flex items-center justify-center rounded cursor-pointer hover:opacity-80 transition-opacity"
          style={{
            width: 30, height: 26,
            background: "var(--color-muted)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-dim)",
            flexShrink: 0,
          }}
        >
          {isLight ? <IconMoon /> : <IconSun />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>

      {/* Mobile backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Sidebar (desktop static) / Drawer (mobile fixed) */}
      <aside
        className={[
          "fixed lg:static inset-y-0 left-0",
          "w-64 lg:w-52 shrink-0",
          "flex flex-col gap-1 p-4 border-r",
          "z-50 lg:z-auto",
          "overflow-y-auto",
          "transition-transform duration-200 ease-in-out",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
        ].join(" ")}
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        {/* Mobile drawer header */}
        <div className="flex items-center justify-between mb-2 lg:hidden">
          <span className="text-xs uppercase tracking-widest font-medium" style={{ color: "var(--color-text-dim)" }}>
            Menu
          </span>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded cursor-pointer hover:opacity-80"
            style={{ background: "var(--color-muted)", color: "var(--color-text)", border: "none" }}
          >
            <IconClose />
          </button>
        </div>

        {/* Brand */}
        <button
          onClick={() => navigate(user?.role === "manager" ? "/" : "/my-schedule")}
          className="mb-3 px-2 text-left w-full cursor-pointer hover:opacity-80 transition-opacity"
          style={{ background: "none", border: "none" }}
        >
          <h1 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>CATalyst studios</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-dim)" }}>Team Management</p>
          <p className="text-xs mt-1.5 font-mono tabular-nums" style={{ color: "var(--color-accent-bright)" }}>
            {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-dim)" }}>
            {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </p>
        </button>

        <div className="mb-3" style={{ borderBottom: "1px solid var(--color-border)" }} />

        {navLinks}

        <div className="flex-1" />
        {userCard}
      </aside>

      {/* Templates secondary panel — desktop only, shown when on /templates */}
      {isTemplates && (
        <div
          className="hidden lg:flex flex-col shrink-0 overflow-y-auto"
          style={{
            width: 200,
            borderRight: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            padding: '12px 10px',
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-dim)', marginBottom: 4, paddingLeft: 4 }}>
            Templates
          </div>

          <button
            onClick={() => setTriggerNew(n => n + 1)}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 8, border: 'none',
              background: 'var(--color-accent)', color: 'white', fontWeight: 600,
              fontSize: 13, cursor: 'pointer', marginBottom: 4, textAlign: 'center',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            ＋ New Template
          </button>

          <button
            onClick={() => {}}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 8,
              border: '1px solid var(--color-accent)',
              background: 'transparent', color: 'var(--color-accent)', fontWeight: 600,
              fontSize: 12, cursor: 'pointer', marginBottom: 4, textAlign: 'center',
              lineHeight: 1.3,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(176,80,48,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            ＋ Auto-Generate from Availability
          </button>

          {templates.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', padding: '12px 4px' }}>
              No templates yet.
            </div>
          ) : (
            templates.map(tpl => {
              const isSelected = tpl.id === selectedId;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedId(tpl.id)}
                  style={{
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    borderLeft: `3px solid ${isSelected ? 'var(--color-accent)' : 'transparent'}`,
                    background: isSelected ? 'rgba(176,80,48,0.08)' : 'transparent',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tpl.name || <em style={{ color: 'var(--color-text-dim)', fontWeight: 400 }}>Untitled</em>}
                  </div>
                  {tpl.description && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {tpl.description}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Right side: top bar + content */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Mobile top bar */}
        <header
          className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b"
          style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-lg cursor-pointer hover:opacity-80 flex items-center justify-center"
            style={{ background: "var(--color-muted)", color: "var(--color-text)", border: "none", width: 36, height: 36 }}
            aria-label="Open menu"
          >
            <IconMenu />
          </button>

          <span className="text-sm font-bold tracking-tight" style={{ color: "var(--color-text)" }}>
            CATalyst studios
          </span>

          <button
            onClick={() => navigate("/notifications")}
            className="relative p-2 rounded-lg cursor-pointer hover:opacity-80 flex items-center justify-center"
            style={{ background: "var(--color-muted)", color: "var(--color-text)", border: "none", width: 36, height: 36 }}
            aria-label="Notifications"
          >
            <IconBell />
            {unreadCount > 0 && (
              <span
                className="absolute flex items-center justify-center rounded-full font-bold"
                style={{
                  top: 4, right: 4,
                  minWidth: 14, height: 14,
                  fontSize: 9,
                  background: "#c84040",
                  color: "white",
                  padding: "0 3px",
                  lineHeight: 1,
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function AppLayout() {
  return (
    <ScheduleProvider>
      <NotificationsProvider>
        <TemplatesProvider>
          <AppLayoutInner />
        </TemplatesProvider>
      </NotificationsProvider>
    </ScheduleProvider>
  );
}
