'use strict';
require('dotenv').config();

// Grant or revoke owner status — the account that can manage the other managers.
//
// Deliberately a script rather than an endpoint, for the same reason as
// reset:manager: owner is the top of the chain, so nothing inside the app can
// hand it out. Needing shell access to the server and its database credentials
// is what makes it the end of the line.
//
//   npm run make:owner -- --list
//   npm run make:owner -- --username michael --yes
//       promotes an existing manager account to owner
//   npm run make:owner -- --username michael --name "Michael M." --yes
//       creates the account if it doesn't exist yet (prints a temp password)
//   npm run make:owner -- --username michael --revoke --yes
//       turns the account back into a plain manager

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

async function list() {
  const managers = await User.find({ role: 'manager' })
    .select('username name owner mustChangePassword')
    .sort({ owner: -1, username: 1 })
    .lean();
  console.log(`\nDatabase: ${describeTarget(process.env.MONGODB_URI)}`);
  console.log(`\n${managers.length} manager account(s):\n`);
  managers.forEach(m => {
    const tag = m.owner ? 'OWNER' : 'manager';
    const state = m.mustChangePassword ? 'awaiting first-login password change' : 'active';
    console.log(`   ${m.username.padEnd(20)} ${String(m.name).padEnd(24)} ${tag.padEnd(8)} ${state}`);
  });
  console.log(`\nTo make one the owner:\n   npm run make:owner -- --username <name> --yes\n`);
}

async function main() {
  await connect();

  if (has('list') || !arg('username')) {
    await list();
    process.exit(0);
  }

  const username = String(arg('username')).toLowerCase().trim();
  const revoke = has('revoke');
  const user = await User.findOne({ username });

  if (user && user.role !== 'manager') {
    // An employee account is tied to a staff record and the employee pages;
    // turning it into the owner would strand both. Make a separate login.
    console.error(`\n"${username}" is an employee account. Pick a different username for the owner.\n`);
    process.exit(1);
  }
  if (!user && revoke) {
    console.error(`\nNo account with username "${username}".\n`);
    process.exit(1);
  }
  if (!user && !arg('name')) {
    console.error(`\nNo account with username "${username}". To create it, add --name "Full Name".\n`);
    process.exit(1);
  }

  const action = revoke
    ? `remove OWNER status from ${username} (they stay a manager)`
    : user ? `make ${username} (${user.name}) the OWNER`
    : `create ${username} (${arg('name')}) as a new OWNER account`;

  if (!has('yes')) {
    console.log(`\nThis will ${action}.`);
    console.log(`\n   database  ${describeTarget(process.env.MONGODB_URI)}`);
    console.log(`\nRe-run with --yes to go ahead.\n`);
    process.exit(0);
  }

  if (user) {
    user.owner = !revoke;
    await user.save();
    console.log(`\nDone: ${revoke ? `${username} is now a plain manager.` : `${username} is now the owner.`}`);
    console.log(`They'll see the change the next time the app loads their account.\n`);
    process.exit(0);
  }

  const tempPassword = generateTempPassword();
  await User.create({
    username,
    name: arg('name'),
    role: 'manager',
    owner: true,
    staffId: null,
    passwordHash: await hashPassword(tempPassword),
    mustChangePassword: true,
  });
  console.log(`\nCreated owner account ${username}.\n`);
  console.log(`   temporary password:  ${tempPassword}\n`);
  console.log(`Shown once. Sign in with it and you will be required to choose a new`);
  console.log(`password before the app will do anything else.\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('make:owner failed:', err.message);
  process.exit(1);
});
