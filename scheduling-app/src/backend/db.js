'use strict';
const mongoose = require('mongoose');

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGODB_URI in .env');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
}

module.exports = { connect };
