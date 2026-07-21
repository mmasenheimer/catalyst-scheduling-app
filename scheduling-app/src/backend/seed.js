'use strict';
require('dotenv').config();

const { connect } = require('./db');
const Staff       = require('./models/Staff');

async function seed() {
  const { initialStaff } = await import('../data/mockData.js');
  const staff = initialStaff.map(({ id, ...rest }) => ({ _id: id, ...rest }));

  await connect();
  await Staff.deleteMany({});
  await Staff.insertMany(staff);
  console.log(`Seeded ${staff.length} staff members`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
