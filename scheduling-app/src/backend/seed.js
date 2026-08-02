'use strict';
require('dotenv').config();

// Checked before anything else is imported. utils/auth throws at import time when
// NODE_ENV=production without a JWT_SECRET, so a guard placed further down would
// be pre-empted by an unrelated error — and would be skipped entirely once
// JWT_SECRET is set, which is exactly the configuration production has.
if (process.env.NODE_ENV === 'production') {
  console.error('\n  Refusing to run: NODE_ENV=production.');
  console.error('  This script deletes every staff member and every account.\n');
  process.exit(1);
}

const { connect } = require('./db');
const Staff       = require('./models/Staff');
const User        = require('./models/User');
const { hashPassword } = require('./utils/auth');
const {
  MANAGER_USERNAME, MANAGER_PASSWORD, STAFF_PASSWORD, usernameForStaff,
} = require('./utils/devAccounts');

// NOTE: this script is a full RESET — it deletes all staff and all accounts,
// then rebuilds them from mockData. To add accounts for existing staff without
// destroying anything, use `npm run seed:users` (seedUsers.js) instead.
//
// It is guarded, because the damage isn't recoverable and the command is one
// character from the harmless `seed:users`:
//
//   • it refuses outright when NODE_ENV=production
//   • without --yes it reports what it would destroy and exits without writing
//   • it names the cluster and database it's pointed at, so a wrong .env is
//     visible before anything happens rather than after
//
//   npm run seed            → dry run, changes nothing
//   npm run seed -- --yes   → actually does it

/** Host and database from MONGODB_URI, with the credentials left out. */
function describeTarget(uri) {
  try {
    const u = new URL(uri);
    return `${u.host}/${u.pathname.replace(/^\//, '') || '(default db)'}`;
  } catch {
    return '(could not parse MONGODB_URI)';
  }
}

async function seed() {
  const confirmed = process.argv.includes('--yes');

  const { initialStaff } = await import('../data/mockData.js');
  const staff = initialStaff.map(({ id, ...rest }) => ({ _id: id, ...rest }));

  await connect();

  // Counted before anything is touched, so the warning describes what's really
  // at stake on this database rather than what the sample data happens to hold.
  const [staffCount, userCount] = await Promise.all([
    Staff.countDocuments(),
    User.countDocuments(),
  ]);

  if (!confirmed) {
    console.log('\n  DESTRUCTIVE — this would permanently delete and replace:\n');
    console.log(`     target      ${describeTarget(process.env.MONGODB_URI)}`);
    console.log(`     staff       ${staffCount} deleted, ${staff.length} seeded from sample data`);
    console.log(`     accounts    ${userCount} deleted, ${initialStaff.length + 1} recreated`);
    console.log('\n  Every password anyone has set would be replaced with a shared,');
    console.log('  publicly-known one. Availability, requests and notifications are not');
    console.log('  deleted, but they key on staff ids, which get reassigned.');
    console.log('\n  Nothing has been changed. To go ahead:\n');
    console.log('     npm run seed -- --yes\n');
    console.log('  To only add accounts for staff who lack them, and delete nothing:\n');
    console.log('     npm run seed:users\n');
    process.exit(1);
  }

  console.log(`\nResetting ${describeTarget(process.env.MONGODB_URI)} — ${staffCount} staff, ${userCount} accounts\n`);

  await Staff.deleteMany({});
  await Staff.insertMany(staff);
  console.log(`Seeded ${staff.length} staff members`);

  // One bcrypt hash reused across the seeded staff accounts — fine for dev
  // fixtures, and avoids 15 slow hash rounds on every reseed.
  const staffHash = await hashPassword(STAFF_PASSWORD);

  await User.deleteMany({});
  const users = [
    {
      username: MANAGER_USERNAME,
      name: 'Manager',
      role: 'manager',
      staffId: null,
      passwordHash: await hashPassword(MANAGER_PASSWORD),
      mustChangePassword: false,
    },
    ...initialStaff.map(s => ({
      username: usernameForStaff(s.name),
      name: s.name,
      role: 'employee',
      staffId: s.id,
      passwordHash: staffHash,
      mustChangePassword: false,
    })),
  ];
  await User.insertMany(users);

  console.log(`\nSeeded ${users.length} accounts:`);
  console.log(`  MANAGER  ${MANAGER_USERNAME}  /  ${MANAGER_PASSWORD}`);
  console.log(`  STAFF    (password for all: ${STAFF_PASSWORD})`);
  initialStaff.forEach(s => console.log(`           ${usernameForStaff(s.name)}`));

  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
