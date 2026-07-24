"use strict";

// Dev credentials for seeded/provisioned accounts. These are stored as real
// bcrypt hashes and checked by the real login endpoint — there is no bypass in
// the auth code. Shared here so seed.js and seedUsers.js can't drift apart.
const MANAGER_EMAIL = "manager@catalyst.dev";
const MANAGER_PASSWORD = "catalyst123";
const STAFF_PASSWORD = "staff123";

// 'Alex C.' → alex.c@catalyst.dev
function emailForStaff(name) {
  const slug = String(name).toLowerCase().replace(/\./g, "").trim().replace(/\s+/g, ".");
  return `${slug}@catalyst.dev`;
}

module.exports = { MANAGER_EMAIL, MANAGER_PASSWORD, STAFF_PASSWORD, emailForStaff };
