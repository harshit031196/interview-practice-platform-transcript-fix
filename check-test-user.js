// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTestUser() {
  try {
    console.log('Checking test user in database...');
    console.log('Database URL:', process.env.DATABASE_URL ? '✅ Found' : '❌ Missing');
    
    const user = await prisma.user.findUnique({
      where: { email: 'pm.candidate@example.com' }
    });
    
    if (user) {
      console.log('✅ Test user found:');
      console.log(`- ID: ${user.id}`);
      console.log(`- Email: ${user.email}`);
      console.log(`- Name: ${user.name}`);
      console.log(`- Role: ${user.role}`);
      console.log(`- Has password: ${!!user.passwordHash}`);
      
      // Check if password matches test password
      const bcrypt = require('bcryptjs');
      const testPassword = 'password123';
      const passwordMatches = await bcrypt.compare(testPassword, user.passwordHash || '');
      console.log(`- Password 'password123' matches: ${passwordMatches ? '✅ Yes' : '❌ No'}`);
      
      if (!passwordMatches) {
        console.log('⚠️ The test password in the verification script does not match the stored hash!');
      }
    } else {
      console.log('❌ Test user not found in database');
      console.log('⚠️ You may need to create the test user first');
    }
  } catch (error) {
    console.error('Error checking test user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTestUser();
