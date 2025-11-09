#!/usr/bin/env node

/**
 * Scheduler Script
 * Run this with cron or a scheduler like node-cron
 *
 * Usage:
 * node scripts/scheduler.js
 *
 * Or add to crontab:
 * 0 * * * * cd /path/to/expirytrackr && node scripts/scheduler.js
 */

require('dotenv').config();
const { runScheduler } = require('../src/lib/scheduler.ts');

async function main() {
  console.log('Starting ExpiryTrackr Scheduler...');

  try {
    await runScheduler();
    console.log('Scheduler completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Scheduler failed:', error);
    process.exit(1);
  }
}

main();
