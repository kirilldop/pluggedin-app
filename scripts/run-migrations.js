#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('🔄 Running database migrations...');

try {
  // Run migrations
  execSync('pnpm drizzle-kit migrate', { stdio: 'inherit' });
  console.log('✅ Migrations completed successfully!');
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  // Don't exit, let the app continue
  console.log('⚠️  Continuing without migrations...');
}
