#!/usr/bin/env node

/**
 * Seed Script
 * Populates database with demo data
 *
 * Usage:
 * node scripts/seed.js
 */

const fs = require('fs');
const path = require('path');

console.log('Seeding database...');
console.log('');
console.log('To seed the database:');
console.log('1. Go to your Supabase SQL Editor');
console.log('2. Copy the contents of sql/seed.sql');
console.log('3. Run it in the SQL Editor');
console.log('');
console.log('Seed file location:', path.join(__dirname, '../sql/seed.sql'));
console.log('');
console.log('Note: Update the user IDs in seed.sql with actual auth.users IDs');
console.log('after creating test users via the signup page.');
