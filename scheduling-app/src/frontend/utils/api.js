const BASE = "http://localhost:3001/api";
const TOKEN_KEY = "catalyst.token";

// Session token helpers. Stored in localStorage so a refresh keeps you logged
// in. (Trade-off: readable by any script on the page, so it's vulnerable to
// XSS — moving to an httpOnly cookie is the hardening step before production.)
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Fired when the server rejects our session, so AuthContext can log out and
// bounce to /login rather than leaving the UI in a half-authenticated state.
export const UNAUTHORIZED_EVENT = "catalyst:unauthorized";

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // A 401 on a request we sent a token with means that session is dead —
    // clear it and let AuthContext bounce to /login.
    if (token) {
      setToken(null);
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      throw new Error("Your session has expired. Please log in again.");
    }
    // A 401 with no token isn't an expired session — it's a rejected
    // credential (e.g. a failed login). Surface the server's actual message.
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? "Invalid email or password.");
  }

  if (!res.ok) {
    // Prefer the server's message when it sent one.
    const detail = await res.json().catch(() => null);
    throw new Error(
      detail?.error ?? `${options.method ?? "GET"} ${BASE}${path} → ${res.status}`,
    );
  }
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: () => request("/auth/me"),
  // Set a new password (forced first-login change, or voluntary). Authenticated.
  changePassword: (newPassword) =>
    request("/auth/change-password", { method: "POST", body: JSON.stringify({ newPassword }) }),
  // Manager-only: create/re-provision an account, returns a one-time { tempPassword }.
  provision: (body) =>
    request("/auth/provision", { method: "POST", body: JSON.stringify(body) }),
  // Manager-only: reset an existing employee's password, returns a new { tempPassword }.
  resetPassword: (staffId) =>
    request("/auth/reset", { method: "POST", body: JSON.stringify({ staffId }) }),
};

// ── Staff ─────────────────────────────────────────────────────────────────────
// Routes: GET /api/staff  GET /api/staff/:id  PATCH /api/staff/:id

export const staffApi = {
  getAll: () => request("/staff"),
  getOne: (id) => request(`/staff/${id}`),
  create: (body) =>
    request("/staff", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) =>
    request(`/staff/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id) => request(`/staff/${id}`, { method: "DELETE" }),
};

// ── Events ────────────────────────────────────────────────────────────────────

export const eventsApi = {
  getAll: () => request("/events"),
  create: (body) =>
    request("/events", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) =>
    request(`/events/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id) => request(`/events/${id}`, { method: "DELETE" }),
};

// ── Schedules ─────────────────────────────────────────────────────────────────

export const schedulesApi = {
  getDay: (date) => request(`/schedules/${date}`),
  // Saved schedules between two YYYY-MM-DD dates (inclusive), in one request.
  getRange: (from, to) => request(`/schedules?from=${from}&to=${to}`),
  saveDay: (date, body) =>
    request(`/schedules/${date}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};

// ── Availability ──────────────────────────────────────────────────────────────

export const availabilityApi = {
  getAll: () => request("/availability"),
  getOne: (staffId) => request(`/availability/${staffId}`),
  submit: (staffId, body) =>
    request(`/availability/${staffId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
};

// ── Templates ─────────────────────────────────────────────────────────────────

export const templatesApi = {
  getAll: () => request("/templates"),
  create: (body) =>
    request("/templates", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) =>
    request(`/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id) => request(`/templates/${id}`, { method: "DELETE" }),
  removeAll: () => request("/templates", { method: "DELETE" }),
};

// ── Notifications ─────────────────────────────────────────────────────────────

export const notificationsApi = {
  // Server filters by the session's verified identity — no params needed.
  getAll: () => request("/notifications"),
  create: (body) =>
    request("/notifications", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) =>
    request(`/notifications/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id) => request(`/notifications/${id}`, { method: "DELETE" }),
};

// ── Requests ──────────────────────────────────────────────────────────────────

export const requestsApi = {
  // Server filters by the session's verified identity — no params needed.
  getAll: () => request("/requests"),
  create: (body) =>
    request("/requests", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) =>
    request(`/requests/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
};
