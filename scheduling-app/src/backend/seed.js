'use strict';
require('dotenv').config();

const { connect } = require('./db');
const Staff       = require('./models/Staff');

const staff = [
  { _id: 1, name: 'Alex M.',   role: 'Senior',    shiftStart: 8,  shiftEnd: 16, deskStart: 10,  deskEnd: 11   },
  { _id: 2, name: 'Jordan K.', role: 'Regular',   shiftStart: 9,  shiftEnd: 17, deskStart: 13,  deskEnd: 14   },
  { _id: 3, name: 'Sam P.',    role: 'Regular',   shiftStart: 10, shiftEnd: 18, deskStart: null, deskEnd: null },
  { _id: 4, name: 'Taylor R.', role: 'Part-time', shiftStart: 12, shiftEnd: 18, deskStart: 14,  deskEnd: 15   },
  { _id: 5, name: 'Morgan L.', role: 'Senior',    shiftStart: 8,  shiftEnd: 14, deskStart: 9,   deskEnd: 10   },
  { _id: 6, name: 'Casey W.',  role: 'Regular',   shiftStart: 11, shiftEnd: 19, deskStart: null, deskEnd: null },
  { _id: 7, name: 'Riley B.',  role: 'Part-time', shiftStart: 14, shiftEnd: 20, deskStart: 16,  deskEnd: 17   },
  { _id: 8, name: 'Quinn A.',  role: 'Regular',   shiftStart: 7,  shiftEnd: 15, deskStart: 8,   deskEnd: 9    },
];

async function seed() {
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
