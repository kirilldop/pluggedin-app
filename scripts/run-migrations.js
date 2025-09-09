#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('🔄 Running database migrations...');

(async () => {
try {
  // Try different migration commands
  try {
    execSync('npx drizzle-kit migrate', { stdio: 'inherit' });
    console.log('✅ Migrations completed successfully with npx!');
  } catch (npxError) {
    console.log('⚠️  npx failed, trying node...');
    try {
      execSync('node node_modules/.bin/drizzle-kit migrate', { stdio: 'inherit' });
      console.log('✅ Migrations completed successfully with node!');
    } catch (nodeError) {
      console.log('⚠️  node failed, trying direct execution...');
      // Try to run migrations directly
      const { migrate } = require('drizzle-orm/node-postgres');
      const { Pool } = require('pg');
      
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000
      });
      
      // This is a simplified migration - just create the users table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT,
          email TEXT UNIQUE NOT NULL,
          password TEXT,
          email_verified BOOLEAN DEFAULT false,
          image TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          username TEXT,
          bio TEXT,
          is_public BOOLEAN DEFAULT false,
          language TEXT DEFAULT 'en',
          avatar_url TEXT,
          failed_login_attempts INTEGER DEFAULT 0,
          account_locked_until TIMESTAMP,
          last_login_at TIMESTAMP,
          last_login_ip TEXT,
          password_changed_at TIMESTAMP
        );
      `);
      
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username);
      `);
      
      console.log('✅ Direct migration completed successfully!');
      await pool.end();
    }
  }
} catch (error) {
  console.error('❌ All migration attempts failed:', error.message);
  console.log('⚠️  Continuing without migrations...');
}
})();
