'use strict';
require('dotenv').config();

// Non-destructive account provisioning: reads whatever Staff are currently in
// the database and creates a login account for any that don't have one yet,
// plus the manager account. Nothing is deleted, and existing accounts (and
// their passwords) are left untouched — safe to re-run any time, including
// after adding staff through Manage Staff.
//
//   node seedUsers.js     (or: npm run seed:users)

const { connect } = require('./db');
const Staff = require('./models/Staff');
const User  = require('./models/User');
const { hashPassword } = require('./utils/auth');
const {
  MANAGER_USERNAME, MANAGER_PASSWORD, STAFF_PASSWORD, usernameForStaff,
} = require('./utils/devAccounts');

async function provision() {
  await connect();

  const created = [];
  const skipped = [];

  // Manager account
  if (await User.findOne({ username: MANAGER_USERNAME })) {
    skipped.push(MANAGER_USERNAME);
  } else {
    await User.create({
      username: MANAGER_USERNAME,
      name: 'Manager',
      role: 'manager',
      staffId: null,
      passwordHash: await hashPassword(MANAGER_PASSWORD),
      mustChangePassword: false,
    });
    created.push(`${MANAGER_USERNAME} (manager)`);
  }

  // One account per staff member currently on the roster.
  const staff = await Staff.find().sort({ _id: 1 });
  const staffHash = await hashPassword(STAFF_PASSWORD);

  const renamed = [];

  for (const person of staff) {
    // Already provisioned — nothing to do.
    if (await User.findOne({ staffId: person._id })) {
      skipped.push(usernameForStaff(person.name));
      continue;
    }

    // Two staff whose names normalize the same way (two "Alex C.") would
    // collide. Previously the second one was silently reported as "skipped"
    // and simply never got an account; instead, give them a numbered username
    // and say so loudly.
    const base = usernameForStaff(person.name);
    let username = base;
    let n = 1;
    while (await User.findOne({ username })) {
      n += 1;
      username = `${base}${n}`;
    }
    if (username !== base) renamed.push(`${person.name}: ${base} taken → ${username}`);

    await User.create({
      username,
      name: person.name,
      role: 'employee',
      staffId: person._id,
      passwordHash: staffHash,
      mustChangePassword: false,
    });
    created.push(username);
  }

  console.log(`\nCreated ${created.length} account(s):`);
  created.forEach(u => console.log(`  + ${u}`));
  if (skipped.length) console.log(`Skipped ${skipped.length} existing account(s).`);
  if (renamed.length) {
    console.log(`\n⚠  ${renamed.length} username collision(s) — tell these people their actual username:`);
    renamed.forEach(r => console.log(`  ! ${r}`));
  }
  console.log(`\nSign in with:`);
  console.log(`  MANAGER  ${MANAGER_USERNAME}  /  ${MANAGER_PASSWORD}`);
  console.log(`  STAFF    <name>  /  ${STAFF_PASSWORD}   (e.g. alex.c, michael.m)`);

  process.exit(0);
}

provision().catch(err => {
  console.error('Provisioning failed:', err.message);
  process.exit(1);
});
