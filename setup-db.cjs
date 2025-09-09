#!/usr/bin/env node

const { Pool } = require('pg');

console.log('🔄 Setting up database...');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setupDatabase() {
  try {
    console.log('📡 Connecting to database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database successfully!');
    
    // Create users table
    console.log('🏗️  Creating users table...');
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
    
    // Create unique index for username
    console.log('🔑 Creating username index...');
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username);
    `);
    
    console.log('✅ Database setup completed successfully!');
    
    // Check table structure
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 Users table structure:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

setupDatabase();
