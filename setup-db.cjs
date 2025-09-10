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
    
    // Create codes table
    console.log('🏗️  Creating codes table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS codes (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create api_keys table
    console.log('🏗️  Creating api_keys table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        last_used_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE
      );
    `);
    
    // Create mcp_servers table
    console.log('🏗️  Creating mcp_servers table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        repository_url TEXT,
        homepage_url TEXT,
        documentation_url TEXT,
        status mcp_server_status DEFAULT 'ACTIVE',
        type mcp_server_type DEFAULT 'STDIO',
        source mcp_server_source DEFAULT 'COMMUNITY',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create custom_mcp_servers table
    console.log('🏗️  Creating custom_mcp_servers table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_mcp_servers (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        command TEXT NOT NULL,
        args JSONB DEFAULT '[]',
        env JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create tools table
    console.log('🏗️  Creating tools table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tools (
        id SERIAL PRIMARY KEY,
        mcp_server_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        input_schema JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create resources table
    console.log('🏗️  Creating resources table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS resources (
        id SERIAL PRIMARY KEY,
        mcp_server_id INTEGER NOT NULL,
        uri TEXT NOT NULL,
        name TEXT,
        description TEXT,
        mime_type TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create prompts table
    console.log('🏗️  Creating prompts table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prompts (
        id SERIAL PRIMARY KEY,
        mcp_server_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        arguments JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create docs table
    console.log('🏗️  Creating docs table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS docs (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        file_name TEXT,
        file_size INTEGER,
        mime_type TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create playground_settings table
    console.log('🏗️  Creating playground_settings table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS playground_settings (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create audit_logs table
    console.log('🏗️  Creating audit_logs table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        details JSONB,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create notifications table
    console.log('🏗️  Creating notifications table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        metadata JSONB,
        read_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create system_logs table
    console.log('🏗️  Creating system_logs table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id SERIAL PRIMARY KEY,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
        
        -- Codes -> Users
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'codes_user_id_users_id_fk'
        ) THEN
          ALTER TABLE codes ADD CONSTRAINT codes_user_id_users_id_fk 
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
        
        -- API Keys -> Users
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_user_id_users_id_fk'
        ) THEN
          ALTER TABLE api_keys ADD CONSTRAINT api_keys_user_id_users_id_fk 
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
        
        -- Custom MCP Servers -> Users
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'custom_mcp_servers_user_id_users_id_fk'
        ) THEN
          ALTER TABLE custom_mcp_servers ADD CONSTRAINT custom_mcp_servers_user_id_users_id_fk 
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
        
        -- Tools -> MCP Servers
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'tools_mcp_server_id_mcp_servers_id_fk'
        ) THEN
          ALTER TABLE tools ADD CONSTRAINT tools_mcp_server_id_mcp_servers_id_fk 
          FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE;
        END IF;
        
        -- Resources -> MCP Servers
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'resources_mcp_server_id_mcp_servers_id_fk'
        ) THEN
          ALTER TABLE resources ADD CONSTRAINT resources_mcp_server_id_mcp_servers_id_fk 
          FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE;
        END IF;
        
        -- Prompts -> MCP Servers
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'prompts_mcp_server_id_mcp_servers_id_fk'
        ) THEN
          ALTER TABLE prompts ADD CONSTRAINT prompts_mcp_server_id_mcp_servers_id_fk 
          FOREIGN KEY (mcp_server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE;
        END IF;
        
        -- Docs -> Users
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'docs_user_id_users_id_fk'
        ) THEN
          ALTER TABLE docs ADD CONSTRAINT docs_user_id_users_id_fk 
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
        
        -- Playground Settings -> Users
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'playground_settings_user_id_users_id_fk'
        ) THEN
          ALTER TABLE playground_settings ADD CONSTRAINT playground_settings_user_id_users_id_fk 
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
        
        -- Audit Logs -> Users (optional)
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_user_id_users_id_fk'
        ) THEN
          ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_users_id_fk 
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        
        -- Notifications -> Users
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_users_id_fk'
        ) THEN
          ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_users_id_fk 
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
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
      CREATE INDEX IF NOT EXISTS codes_user_id_idx ON codes(user_id);
      CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id);
      CREATE INDEX IF NOT EXISTS custom_mcp_servers_user_id_idx ON custom_mcp_servers(user_id);
      CREATE INDEX IF NOT EXISTS tools_mcp_server_id_idx ON tools(mcp_server_id);
      CREATE INDEX IF NOT EXISTS resources_mcp_server_id_idx ON resources(mcp_server_id);
      CREATE INDEX IF NOT EXISTS prompts_mcp_server_id_idx ON prompts(mcp_server_id);
      CREATE INDEX IF NOT EXISTS docs_user_id_idx ON docs(user_id);
      CREATE INDEX IF NOT EXISTS playground_settings_user_id_idx ON playground_settings(user_id);
      CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
    `);
    
    console.log('✅ Database setup completed successfully!');
    
    // Check all tables were created
    const tables = [
      'users', 'accounts', 'sessions', 'verification_tokens', 'projects', 'profiles',
      'codes', 'api_keys', 'mcp_servers', 'custom_mcp_servers', 'tools', 'resources',
      'prompts', 'docs', 'playground_settings', 'audit_logs', 'notifications', 'system_logs'
    ];
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
