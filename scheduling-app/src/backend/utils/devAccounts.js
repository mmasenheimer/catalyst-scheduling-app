"use strict";

// Dev credentials for seeded accounts. Stored as real bcrypt hashes and checked
// by the real login endpoint — no bypass in the auth code. Shared here so
// seed.js and seedUsers.js can't drift apart. Seeded accounts are ready to use
// (mustChangePassword: false); only manager-provisioned ones force a change.
const MANAGER_USERNAME = "manager";
const MANAGER_PASSWORD = "catalyst123";
const STAFF_PASSWORD = "staff123";

// 'Alex C.' → alex.c
function usernameForStaff(name) {
  return String(name).toLowerCase().replace(/\./g, "").trim().replace(/\s+/g, ".");
}

module.exports = { MANAGER_USERNAME, MANAGER_PASSWORD, STAFF_PASSWORD, usernameForStaff };
