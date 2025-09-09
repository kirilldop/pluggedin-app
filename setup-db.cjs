#!/usr/bin/env node

const { Pool } = require('pg');

console.log('🔄 Setting up database...');
console.log('📋 DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('📋 NODE_ENV:', process.env.NODE_ENV);

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.log('❌ DATABASE_URL not set, skipping database setup');
  process.exit(0);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' ? true : false,
    checkServerIdentity: () => undefined
  } : false
});

async function setupDatabase() {
  try {
    console.log('📡 Connecting to database...');
    console.log('🔍 DATABASE_URL length:', process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 'NOT SET');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to database successfully!');
    
    // Create all required enums
    console.log('🏗️  Creating enums...');
    
    // Language enum (only supported languages)
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE language AS ENUM ('en', 'tr', 'nl', 'zh', 'ja', 'hi');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    // MCP Server Status enum
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE mcp_server_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUGGESTED', 'DECLINED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    // MCP Server Type enum
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE mcp_server_type AS ENUM ('STDIO', 'SSE', 'STREAMABLE_HTTP');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    // MCP Server Source enum
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE mcp_server_source AS ENUM ('PLUGGEDIN', 'COMMUNITY', 'REGISTRY');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    // Toggle Status enum
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE toggle_status AS ENUM ('ACTIVE', 'INACTIVE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    // Profile Capability enum
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE profile_capability AS ENUM ('TOOLS_MANAGEMENT');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create users table
    console.log('🏗️  Creating users table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        email_verified TIMESTAMP,
        image TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        username TEXT,
        bio TEXT,
        is_public BOOLEAN DEFAULT false,
        language language DEFAULT 'en',
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
    
    // Create accounts table (for OAuth)
    console.log('🏗️  Creating accounts table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_account_id TEXT NOT NULL,
        refresh_token TEXT,
        access_token TEXT,
        expires_at INTEGER,
        token_type TEXT,
        scope TEXT,
        id_token TEXT,
        session_state TEXT,
        CONSTRAINT accounts_provider_provider_account_id_pk PRIMARY KEY(provider, provider_account_id)
      );
    `);
    
    // Create sessions table
    console.log('🏗️  Creating sessions table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_token TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        expires TIMESTAMP NOT NULL
      );
    `);
    
    // Create verification_tokens table
    console.log('🏗️  Creating verification_tokens table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS verification_tokens (
        identifier TEXT NOT NULL,
        token TEXT NOT NULL,
        expires TIMESTAMP NOT NULL,
        CONSTRAINT verification_tokens_identifier_token_pk PRIMARY KEY(identifier, token)
      );
    `);
    
    // Create projects table
    console.log('🏗️  Creating projects table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        active_profile_uuid UUID,
        user_id TEXT NOT NULL
      );
    `);
    
    // Create profiles table
    console.log('🏗️  Creating profiles table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        project_uuid UUID NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        language language DEFAULT 'en',
        enabled_capabilities profile_capability[] NOT NULL DEFAULT '{}'
      );
    `);
    
    // Create foreign key constraints
    console.log('🔗 Creating foreign key constraints...');
    await pool.query(`
      DO $$ BEGIN
        -- Accounts -> Users
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'accounts_user_id_users_id_fk'
        ) THEN
          ALTER TABLE accounts ADD CONSTRAINT accounts_user_id_users_id_fk 
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
        
        -- Sessions -> Users
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_users_id_fk'
        ) THEN
          ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_users_id_fk 
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
        
        -- Projects -> Users
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'projects_user_id_users_id_fk'
        ) THEN
          ALTER TABLE projects ADD CONSTRAINT projects_user_id_users_id_fk 
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
        
        -- Profiles -> Projects
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'profiles_project_uuid_projects_uuid_fk'
        ) THEN
          ALTER TABLE profiles ADD CONSTRAINT profiles_project_uuid_projects_uuid_fk 
          FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE;
        END IF;
        
        -- Projects -> Profiles (active_profile_uuid)
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'projects_active_profile_uuid_profiles_uuid_fk'
        ) THEN
          ALTER TABLE projects ADD CONSTRAINT projects_active_profile_uuid_profiles_uuid_fk 
          FOREIGN KEY (active_profile_uuid) REFERENCES profiles(uuid) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    
    // Create indexes
    console.log('🔑 Creating indexes...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);
      CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);
      CREATE INDEX IF NOT EXISTS profiles_project_uuid_idx ON profiles(project_uuid);
    `);
    
    console.log('✅ Database setup completed successfully!');
    
    // Check all tables were created
    const tables = ['users', 'accounts', 'sessions', 'verification_tokens', 'projects', 'profiles'];
    console.log('📋 Checking all tables were created:');
    
    for (const tableName of tables) {
      const result = await pool.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_name = $1 AND table_schema = 'public';
      `, [tableName]);
      
      const exists = result.rows[0].count > 0;
      console.log(`  - ${tableName}: ${exists ? '✅' : '❌'}`);
    }
    
    // Check enums were created
    const enums = ['language', 'mcp_server_status', 'mcp_server_type', 'mcp_server_source', 'toggle_status', 'profile_capability'];
    console.log('📋 Checking all enums were created:');
    
    for (const enumName of enums) {
      const result = await pool.query(`
        SELECT COUNT(*) as count 
        FROM pg_type 
        WHERE typname = $1;
      `, [enumName]);
      
      const exists = result.rows[0].count > 0;
      console.log(`  - ${enumName}: ${exists ? '✅' : '❌'}`);
    }
    
  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

setupDatabase();
