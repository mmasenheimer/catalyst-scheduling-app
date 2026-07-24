'use strict';
require('dotenv').config();

const { connect } = require('./db');
const Staff       = require('./models/Staff');
const User        = require('./models/User');
const { hashPassword } = require('./utils/auth');
const {
  MANAGER_EMAIL, MANAGER_PASSWORD, STAFF_PASSWORD, emailForStaff,
} = require('./utils/devAccounts');

// NOTE: this script is a full RESET — it deletes all staff and all accounts,
// then rebuilds them from mockData. To add accounts for existing staff without
// destroying anything, use `npm run seed:users` (seedUsers.js) instead.

async function seed() {
  const { initialStaff } = await import('../data/mockData.js');
  const staff = initialStaff.map(({ id, ...rest }) => ({ _id: id, ...rest }));

  await connect();

  await Staff.deleteMany({});
  await Staff.insertMany(staff);
  console.log(`Seeded ${staff.length} staff members`);

  // One bcrypt hash reused across the seeded staff accounts — fine for dev
  // fixtures, and avoids 15 slow hash rounds on every reseed.
  const staffHash = await hashPassword(STAFF_PASSWORD);

  await User.deleteMany({});
  const users = [
    {
      email: MANAGER_EMAIL,
      name: 'Manager',
      role: 'manager',
      staffId: null,
      status: 'active',
      passwordHash: await hashPassword(MANAGER_PASSWORD),
    },
    ...initialStaff.map(s => ({
      email: emailForStaff(s.name),
      name: s.name,
      role: 'employee',
      staffId: s.id,
      status: 'active',
      passwordHash: staffHash,
    })),
  ];
  await User.insertMany(users);

  console.log(`\nSeeded ${users.length} accounts:`);
  console.log(`  MANAGER  ${MANAGER_EMAIL}  /  ${MANAGER_PASSWORD}`);
  console.log(`  STAFF    (password for all: ${STAFF_PASSWORD})`);
  initialStaff.forEach(s => console.log(`           ${emailForStaff(s.name)}`));

  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
