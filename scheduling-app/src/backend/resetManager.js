'use strict';
require('dotenv').config();

// Break-glass password reset for a manager account.
//
// Managers are the one account class with no `staffId`, and the in-app reset is
// keyed on that — so a manager who has completed setup and then forgotten their
// password cannot be recovered through the application. With a second manager
// present, POST /api/auth/reset can now do it by username. This script is for
// the case that has no in-app answer at all: the *only* manager is locked out,
// so there is nobody left to press the button.
//
// Deliberately a script rather than an endpoint. It requires shell access to the
// server and the database credentials, which is the right bar for something that
// hands out a working credential for the highest-privilege account you have.
//
//   npm run reset:manager -- --username manager
//   npm run reset:manager -- --list
//
// Unlike `seed`, this is safe to run in production — that is the whole point —
// but it changes a real password, so it names the account and asks for --yes.

const { connect } = require('./db');
const User = require('./models/User');
const { hashPassword, generateTempPassword } = require('./utils/auth');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : null;
}
const has = name => process.argv.includes(`--${name}`);

function describeTarget(uri) {
  if (!uri) return '(no MONGODB_URI set)';
  // Never print credentials, only which cluster and database.
  return uri.replace(/\/\/[^@]*@/, '//<credentials>@');
}

async function main() {
  await connect();

  const managers = await User.find({ role: 'manager' })
    .select('username name mustChangePassword tokenVersion')
    .sort({ username: 1 })
    .lean();

  if (has('list') || !arg('username')) {
    console.log(`\nDatabase: ${describeTarget(process.env.MONGODB_URI)}`);
    console.log(`\n${managers.length} manager account(s):\n`);
    managers.forEach(m => {
      const state = m.mustChangePassword ? 'awaiting first-login password change' : 'active';
      console.log(`   ${m.username.padEnd(20)} ${String(m.name).padEnd(24)} ${state}`);
    });
    console.log(`\nTo reset one:\n   npm run reset:manager -- --username <name> --yes\n`);
    process.exit(0);
  }

  const username = String(arg('username')).toLowerCase().trim();
  const user = await User.findOne({ username });

  if (!user) {
    console.error(`\nNo account with username "${username}".`);
    console.error(`Run with --list to see the manager accounts that exist.\n`);
    process.exit(1);
  }
  if (user.role !== 'manager') {
    // Employees have a staffId, so the manager can reset them from Manage Staff.
    // Sending people here for that would train them to reach for the blunt tool.
    console.error(`\n"${username}" is an employee account, not a manager.`);
    console.error(`Reset it from Manage Staff in the app instead.\n`);
    process.exit(1);
  }

  if (!has('yes')) {
    console.log(`\nThis will reset the password for a MANAGER account.`);
    console.log(`\n   database  ${describeTarget(process.env.MONGODB_URI)}`);
    console.log(`   account   ${user.username}  (${user.name})`);
    console.log(`\nTheir current password stops working immediately and every active`);
    console.log(`session for that account is signed out.`);
    console.log(`\nRe-run with --yes to go ahead:`);
    console.log(`   npm run reset:manager -- --username ${user.username} --yes\n`);
    process.exit(0);
  }

  const tempPassword = generateTempPassword();
  user.passwordHash = await hashPassword(tempPassword);
  // Same three effects the in-app reset has, so the account lands in exactly the
  // state a normal reset produces rather than a special one.
  user.mustChangePassword = true;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  console.log(`\nPassword reset for ${user.username}.\n`);
  console.log(`   temporary password:  ${tempPassword}\n`);
  console.log(`Shown once. Sign in with it and you will be required to choose a new`);
  console.log(`password before the app will do anything else.\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('Reset failed:', err.message);
  process.exit(1);
});
