'use strict';
require('dotenv').config();

// ── REST API (Express) ─────────────────────────────────────────────────────────
// Started first and independently — Slack is optional and must never prevent
// the API from serving.
require('./api');

// ── Slack bot (Socket Mode) — optional ────────────────────────────────────────
const { createSlackApp, isConfigured, missingVars } = require('./slack/slackClient');

// Bolt's Socket Mode client keeps retrying the connection in the background,
// so a bad token surfaces as an unhandled rejection *after* start() already
// settled — outside any try/catch below. Node's default is to crash on that,
// which would take the REST API down with it. Log loudly and keep serving.
// (Trade-off: this also swallows unrelated unhandled rejections, so treat
// anything logged here as a real bug to chase down.)
process.on('unhandledRejection', (err) => {
  console.error('[unhandled rejection]', err?.message ?? err);
});

(async () => {
  if (!isConfigured()) {
    const missing = missingVars();
    console.log(
      missing.length
        ? `[slack] disabled — missing ${missing.join(', ')}. REST API is running.`
        : '[slack] disabled via SLACK_ENABLED=false. REST API is running.',
    );
    return;
  }

  try {
    await createSlackApp().start();
    console.log('CATalyst backend connected to Slack (Socket Mode)');
  } catch (err) {
    console.error(`[slack] failed to start: ${err.message} — REST API is still running.`);
  }
})();

// Register Slack event listeners by importing them above once you have them.
// e.g.  app.message('hello', async ({ message, say }) => { ... });
