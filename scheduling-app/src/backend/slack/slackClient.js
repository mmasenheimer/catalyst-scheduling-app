'use strict';
require('dotenv').config();
const { App } = require('@slack/bolt');

const REQUIRED = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN'];

// Slack is an optional add-on to the REST API. This module deliberately does
// NOT throw at import time (it used to) — a missing or bad Slack config must
// never stop the API from starting. Callers check isConfigured() first and
// handle a null app.

function isConfigured() {
  // Explicit opt-out, useful when your tokens are expired/invalid and you just
  // want the API: set SLACK_ENABLED=false in .env
  if (String(process.env.SLACK_ENABLED).toLowerCase() === 'false') return false;
  return REQUIRED.every(key => Boolean(process.env[key]));
}

function missingVars() {
  return REQUIRED.filter(key => !process.env[key]);
}

function createSlackApp() {
  if (!isConfigured()) return null;

  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,

    // Socket Mode lets the app connect to Slack over WebSocket without
    // needing a public-facing URL. Good for internal/workplace use.
    // To switch to HTTP mode: remove socketMode + appToken, and pass a port
    // to app.start() in server.js instead.
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
  });

  // Bolt-level errors (bad token, dropped socket, a handler that throws):
  // log them, never rethrow.
  app.error(async (error) => {
    console.error('[slack] error:', error?.message ?? error);
  });

  return app;
}

module.exports = { createSlackApp, isConfigured, missingVars };
