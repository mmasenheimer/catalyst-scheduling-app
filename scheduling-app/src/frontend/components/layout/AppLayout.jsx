import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ScheduleProvider, useScheduleContext } from "../../context/ScheduleContext";
import { NotificationsProvider, useNotifications } from "../../context/NotificationsContext";
import { RequestsProvider } from "../../context/RequestsContext";
import { TemplatesProvider, useTemplates } from "../../context/TemplatesContext";
import { ApplyTemplateCalendarModal } from "../ApplyTemplateCalendarModal";
import { GenerateTemplateModal } from "../GenerateTemplateModal";
import { LoaderCircleIcon } from "../LoaderCircleIcon";
import { SunMediumIcon } from "../SunMediumIcon";
import { MoonIcon } from "../MoonIcon";

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
  { to: "/weekly",         label: "Weekly View" },
  { to: "/calendar",       label: "Event Calendar" },
  { to: "/templates",      label: "Templates" },
  { to: "/add-event",      label: "Add Event" },
  { to: "/staff-availability", label: "Staff Availability" },
  { to: "/manage-staff",       label: "Manage Staff" },
  { to: "/notifications",      label: "Notifications" },
];

const employeeNav = [
  { to: "/my-schedule",       label: "My Schedule" },
  { to: "/team-schedule",     label: "Weekly View" },
  { to: "/calendar",          label: "Event Calendar" },
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
  const { templates, selectedId, setSelectedId, setTriggerNew, addTemplate, removeAllTemplates } = useTemplates();
  const { staff, saveDaySchedule, weeklyViewLoading, setWeeklyViewLoading, teamScheduleLoading, setTeamScheduleLoading } = useScheduleContext();
  const isTemplates = location.pathname === '/templates';
  const [applyTplOpen, setApplyTplOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  // Build a weekly template from submitted availability, then open it in the
  // editor so the manager can adjust before it's used.
  async function handleGenerateTemplate({ name, days }) {
    const created = await addTemplate({
      type: 'week',
      name,
      description: 'Auto-generated from submitted availability',
      days,
    });
    setSelectedId(created.id);
    setGenerateOpen(false);
    navigate('/templates');
  }

  // New-template modal state
  const [newTplStep,    setNewTplStep]    = useState(null); // null | 'pick' | 'day-form'
  const [dayTplName,    setDayTplName]    = useState('');
  const [dayTplDesc,    setDayTplDesc]    = useState('');
  const [dayTplError,   setDayTplError]   = useState('');

  function openNewTpl() { setDayTplName(''); setDayTplDesc(''); setDayTplError(''); setNewTplStep('pick'); }
  function closeNewTpl() { setNewTplStep(null); }

  async function createDayTemplate() {
    const trimmed = dayTplName.trim();
    if (!trimmed) { setDayTplError('Name is required.'); return; }
    // A duplicate name isn't rejected — addTemplate numbers the copy.
    try {
      const created = await addTemplate({ type: 'day', name: trimmed, description: dayTplDesc.trim(), staff: [] });
      setSelectedId(created.id);
      closeNewTpl();
      navigate('/templates');
    } catch (err) {
      setDayTplError(err.message || 'Failed to create template.');
    }
  }

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
      onClick={() => {
        if (to === "/weekly" && location.pathname !== "/weekly") setWeeklyViewLoading(true);
        if (to === "/team-schedule" && location.pathname !== "/team-schedule") setTeamScheduleLoading(true);
      }}
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
      {to === "/weekly" && weeklyViewLoading && (
        <span className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center">
          <LoaderCircleIcon size={14} style={{ color: "var(--color-text-dim)" }} />
        </span>
      )}
      {to === "/team-schedule" && teamScheduleLoading && (
        <span className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center">
          <LoaderCircleIcon size={14} style={{ color: "var(--color-text-dim)" }} />
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
          {isLight ? <MoonIcon size={15} color="white" /> : <SunMediumIcon size={16} color="white" />}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingLeft: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-dim)' }}>
              Templates
            </span>
            <button
              onClick={() => setApplyTplOpen(true)}
              style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(176,80,48,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Apply
            </button>
          </div>

          <button
            onClick={openNewTpl}
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
            onClick={() => setGenerateOpen(true)}
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

          {(() => {
            const weeklyTpls = templates.filter(t => !t.type || t.type === 'week');
            const dayTpls    = templates.filter(t => t.type === 'day');
            const renderCard = (tpl) => {
              const isSelected = tpl.id === selectedId;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedId(tpl.id)}
                  style={{
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    borderLeft: `3px solid ${isSelected ? 'var(--color-accent)' : '#2a6b65'}`,
                    background: isSelected ? 'rgba(176,80,48,0.08)' : 'rgba(77,182,172,0.08)',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(77,182,172,0.16)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(77,182,172,0.08)'; }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tpl.name || <em style={{ color: 'var(--color-text-dim)', fontWeight: 400 }}>Untitled</em>}
                  </div>
                  {tpl.type === 'day' && (
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-accent)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Day
                    </div>
                  )}
                  {tpl.description && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {tpl.description}
                    </div>
                  )}
                </div>
              );
            };
            if (weeklyTpls.length === 0 && dayTpls.length === 0) return (
              <div style={{ fontSize: 12, color: 'var(--color-text-dim)', textAlign: 'center', padding: '12px 4px' }}>
                No templates yet.
              </div>
            );
            return (
              <>
                {weeklyTpls.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'white', textAlign: 'center', marginTop: 4, marginBottom: 2 }}>Weekly</div>
                    {weeklyTpls.map(renderCard)}
                  </>
                )}
                {dayTpls.length > 0 && (
                  <>
                    {weeklyTpls.length > 0 && <div style={{ height: 1, background: 'var(--color-accent)', opacity: 0.4, margin: '8px 4px' }} />}
                    <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'white', textAlign: 'center', marginBottom: 2 }}>Day</div>
                    {dayTpls.map(renderCard)}
                  </>
                )}
              </>
            );
          })()}

          <div style={{ flex: 1 }} />

          <button
            onClick={async () => {
              if (window.confirm('Delete all templates? This cannot be undone.')) {
                try {
                  await removeAllTemplates();
                } catch (err) {
                  window.alert(err.message || 'Failed to delete templates.');
                }
                setSelectedId(null);
              }
            }}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'transparent', color: 'var(--color-text-dim)', fontWeight: 600,
              fontSize: 12, cursor: 'pointer', marginTop: 8, textAlign: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-red)'; e.currentTarget.style.color = 'var(--color-red)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-dim)'; }}
          >
            Delete All Templates
          </button>
        </div>
      )}

      {applyTplOpen && (
        <ApplyTemplateCalendarModal
          templates={templates}
          allStaff={staff}
          saveDaySchedule={saveDaySchedule}
          onClose={() => setApplyTplOpen(false)}
        />
      )}

      {generateOpen && (
        <GenerateTemplateModal
          staff={staff}
          onCreate={handleGenerateTemplate}
          onClose={() => setGenerateOpen(false)}
        />
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

      {/* New template modal */}
      {newTplStep && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}
          onClick={e => { if (e.target === e.currentTarget) closeNewTpl(); }}
        >
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: 28, width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}>

            {newTplStep === 'pick' && (
              <>
                <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>New Template</h3>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--color-text-dim)' }}>What kind of template do you want to create?</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={() => { setTriggerNew(n => n + 1); closeNewTpl(); }}
                    style={{
                      padding: '14px 16px', borderRadius: 10, border: '1px solid var(--color-border)',
                      background: 'var(--color-muted)', cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-accent)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', marginBottom: 3 }}>Weekly Template</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>A full week of schedules — one staff layout per day (Mon–Sun)</div>
                  </button>
                  <button
                    onClick={() => setNewTplStep('day-form')}
                    style={{
                      padding: '14px 16px', borderRadius: 10, border: '1px solid var(--color-border)',
                      background: 'var(--color-muted)', cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-accent)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', marginBottom: 3 }}>Day Template</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-dim)' }}>A single-day schedule you can apply to any specific date</div>
                  </button>
                </div>
                <div style={{ marginTop: 16, textAlign: 'right' }}>
                  <button onClick={closeNewTpl} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-dim)', fontSize: 13, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </>
            )}

            {newTplStep === 'day-form' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <button onClick={() => setNewTplStep('pick')} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}>←</button>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>New Day Template</h3>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: 5 }}>Template Name *</label>
                  <input
                    autoFocus
                    value={dayTplName}
                    onChange={e => { setDayTplName(e.target.value); setDayTplError(''); }}
                    onKeyDown={e => e.key === 'Enter' && createDayTemplate()}
                    placeholder="e.g. Busy Day"
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 13, boxSizing: 'border-box',
                      background: 'var(--color-muted)', border: `1px solid ${dayTplError ? 'var(--color-red)' : 'var(--color-border)'}`,
                      color: 'var(--color-text)', outline: 'none',
                    }}
                  />
                  {dayTplError && <div style={{ fontSize: 11, color: 'var(--color-red)', marginTop: 4 }}>{dayTplError}</div>}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--color-text-dim)', marginBottom: 5 }}>Description (optional)</label>
                  <input
                    value={dayTplDesc}
                    onChange={e => setDayTplDesc(e.target.value)}
                    placeholder="Optional notes"
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 13, boxSizing: 'border-box',
                      background: 'var(--color-muted)', border: '1px solid var(--color-border)',
                      color: 'var(--color-text)', outline: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={closeNewTpl} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-dim)', fontSize: 13, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={createDayTemplate} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Create Day Template
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  return (
    <ScheduleProvider>
      <NotificationsProvider>
        <RequestsProvider>
          <TemplatesProvider>
            <AppLayoutInner />
          </TemplatesProvider>
        </RequestsProvider>
      </NotificationsProvider>
    </ScheduleProvider>
  );
}
