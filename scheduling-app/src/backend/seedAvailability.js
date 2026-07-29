'use strict';
require('dotenv').config();

// Loads the sample availability from src/data/mockAvailability.js into the
// database.
//
// Why this exists: the schedule editors read availability straight from that
// mock file, while the manager's Staff Availability page reads the database.
// With nothing stored, the two disagree — the editors show availability and the
// page shows everyone as unavailable. Running this makes them match.
//
//   node seedAvailability.js     (or: npm run seed:availability)
//
// Upserts one record per staff member, so it's safe to re-run. Only staff who
// are actually on the roster are seeded, to avoid orphan records.

const { connect } = require('./db');
const Staff = require('./models/Staff');
const Availability = require('./models/Availability');

async function seed() {
  const mod = await import('../data/mockAvailability.js');
  const mockAvailability = mod.default;
  const getSubmittedAt = mod.getSubmittedAt;

  await connect();

  const staff = await Staff.find().sort({ _id: 1 }).lean();
  if (staff.length === 0) {
    console.log('No staff on the roster — run `npm run seed` first.');
    process.exit(0);
  }

  const written = [];
  const missing = [];

  for (const person of staff) {
    const days = mockAvailability[person._id];
    if (!days) { missing.push(person.name); continue; }

    // Preserve the sample submission timestamps so the page shows realistic
    // "Submitted <date>" labels rather than everything landing at once.
    const submittedAt = getSubmittedAt(person._id);

    await Availability.findOneAndUpdate(
      { staffId: person._id },
      {
        staffId: person._id,
        days,
        note: '',
        submittedAt: submittedAt ? new Date(submittedAt) : new Date(),
      },
      { upsert: true, new: true, runValidators: true },
    );

    const dayCount = Object.values(days).filter(w => w?.length).length;
    written.push(`${person.name} (${dayCount} days)`);
  }

  console.log(`\nSeeded availability for ${written.length} staff:`);
  written.forEach(w => console.log(`  + ${w}`));
  if (missing.length) {
    console.log(`\n${missing.length} staff have no sample availability and were skipped:`);
    missing.forEach(m => console.log(`  - ${m}`));
  }

  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding availability failed:', err.message);
  process.exit(1);
});
