#!/usr/bin/env node

console.log('🚀 TEST SCRIPT STARTED!');
console.log('📋 DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('📋 NODE_ENV:', process.env.NODE_ENV);
console.log('📋 RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT);
console.log('✅ TEST SCRIPT COMPLETED!');

