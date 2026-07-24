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

// Slack is optional to the REST API (started separately in ./api). If the
// Slack connection fails, log it but don't take the whole process — and the
// API with it — down via an unhandled rejection.
(async () => {
  try {
    await app.start();
    console.log('CATalyst backend connected to Slack (Socket Mode)');
  } catch (err) {
    console.error('Slack app failed to start (REST API still running):', err.message);
  }
})();
