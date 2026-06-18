'use strict';
require('dotenv').config();

// ── REST API (Express) ─────────────────────────────────────────────────────────
require('./api');

// ── Slack bot (Socket Mode) ────────────────────────────────────────────────────
const { app } = require('./slack/slackClient');

// Register Slack event listeners here (or import them).
// Examples:
//   app.message('hello', async ({ message, say }) => { ... });
//   app.command('/schedule', async ({ command, ack, respond }) => { ... });

(async () => {
  await app.start();
  console.log('CATalyst backend connected to Slack (Socket Mode)');
})();
