'use strict';
require('dotenv').config();
const { App } = require('@slack/bolt');

// Validates that required env vars are set before the app starts.
const required = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

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

// The underlying Web API client — use this to call Slack methods directly.
// e.g. app.client.chat.postMessage({ channel: '...', text: '...' })
const client = app.client;

module.exports = { app, client };
