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
  MANAGER_EMAIL, MANAGER_PASSWORD, STAFF_PASSWORD, emailForStaff,
} = require('./utils/devAccounts');

async function provision() {
  await connect();

  const created = [];
  const skipped = [];

  // Manager account
  if (await User.findOne({ email: MANAGER_EMAIL })) {
    skipped.push(MANAGER_EMAIL);
  } else {
    await User.create({
      email: MANAGER_EMAIL,
      name: 'Manager',
      role: 'manager',
      staffId: null,
      status: 'active',
      passwordHash: await hashPassword(MANAGER_PASSWORD),
    });
    created.push(`${MANAGER_EMAIL} (manager)`);
  }

  // One account per staff member currently on the roster.
  const staff = await Staff.find().sort({ _id: 1 });
  const staffHash = await hashPassword(STAFF_PASSWORD);

  for (const person of staff) {
    const email = emailForStaff(person.name);
    // Skip if this staff member already has an account (by staffId or email).
    if (await User.findOne({ $or: [{ staffId: person._id }, { email }] })) {
      skipped.push(email);
      continue;
    }
    await User.create({
      email,
      name: person.name,
      role: 'employee',
      staffId: person._id,
      status: 'active',
      passwordHash: staffHash,
    });
    created.push(email);
  }

  console.log(`\nCreated ${created.length} account(s):`);
  created.forEach(e => console.log(`  + ${e}`));
  if (skipped.length) console.log(`Skipped ${skipped.length} existing account(s).`);
  console.log(`\nSign in with:`);
  console.log(`  MANAGER  ${MANAGER_EMAIL}  /  ${MANAGER_PASSWORD}`);
  console.log(`  STAFF    <name>@catalyst.dev  /  ${STAFF_PASSWORD}`);

  process.exit(0);
}

provision().catch(err => {
  console.error('Provisioning failed:', err.message);
  process.exit(1);
});
