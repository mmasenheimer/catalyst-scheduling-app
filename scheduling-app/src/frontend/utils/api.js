const BASE = "http://localhost:3001/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok)
    throw new Error(
      `${options.method ?? "GET"} ${BASE}${path} → ${res.status}`,
    );
  return res.json();
}

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
  getAll: () => request("/notifications"),
  create: (body) =>
    request("/notifications", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) =>
    request(`/notifications/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id) => request(`/notifications/${id}`, { method: "DELETE" }),
};

// ── Requests ──────────────────────────────────────────────────────────────────

export const requestsApi = {
  getAll: () => request("/requests"),
  create: (body) =>
    request("/requests", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) =>
    request(`/requests/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
};

// ── Auth ──────────────────────────────────────────────────────────────────────
// Uncomment and build routes/auth.js when ready

// export const authApi = {
//   login:  (body) => request('/auth/login',  { method: 'POST', body: JSON.stringify(body) }),
//   logout: ()     => request('/auth/logout', { method: 'POST' }),
//   me:     ()     => request('/auth/me'),
// };
