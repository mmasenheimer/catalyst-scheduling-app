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

  for (const person of staff) {
    const username = usernameForStaff(person.name);
    if (await User.findOne({ $or: [{ staffId: person._id }, { username }] })) {
      skipped.push(username);
      continue;
    }
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
  console.log(`\nSign in with:`);
  console.log(`  MANAGER  ${MANAGER_USERNAME}  /  ${MANAGER_PASSWORD}`);
  console.log(`  STAFF    <name>  /  ${STAFF_PASSWORD}   (e.g. alex.c, michael.m)`);

  process.exit(0);
}

provision().catch(err => {
  console.error('Provisioning failed:', err.message);
  process.exit(1);
});
