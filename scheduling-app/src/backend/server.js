'use strict';
require('dotenv').config();

const { app } = require('./slack/slackClient');

// Register your Slack event listeners and handlers here (or import them).
// Examples:
//   app.message('hello', async ({ message, say }) => { ... });
//   app.command('/schedule', async ({ command, ack, respond }) => { ... });
//   app.action('button_click', async ({ action, ack }) => { ... });

(async () => {
  await app.start();
  console.log('CATalyst backend connected to Slack (Socket Mode)');
})();
