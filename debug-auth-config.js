require('dotenv').config({ path: '.env.local' });

async function debugAuthConfig() {
  console.log('🔍 Debugging NextAuth Configuration');
  console.log('===================================');

  // Check environment variables
  console.log('Environment Variables:');
  console.log('- NEXTAUTH_SECRET:', process.env.NEXTAUTH_SECRET ? 'Present' : 'Missing');
  console.log('- NEXTAUTH_URL:', process.env.NEXTAUTH_URL || 'Not set');
  console.log('- DATABASE_URL:', process.env.DATABASE_URL ? 'Present' : 'Missing');
  console.log('- NODE_ENV:', process.env.NODE_ENV);

  // Test database connection
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    console.log('\nTesting database connection...');
    await prisma.$connect();
    console.log('✅ Database connection successful');
    
    const userCount = await prisma.user.count();
    console.log('User count:', userCount);
    
    await prisma.$disconnect();
  } catch (error) {
    console.log('❌ Database connection failed:', error.message);
  }
}

debugAuthConfig();
