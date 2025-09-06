require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function testCredentialsAuth() {
  try {
    console.log('🔍 Testing Credentials Authentication Logic');
    console.log('==========================================');

    const email = 'pm.candidate@example.com';
    const password = 'password123';

    // 1. Check if user exists
    console.log('1. Checking if user exists...');
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('✅ User found:', user.email);
    console.log('- User ID:', user.id);
    console.log('- Has password hash:', !!user.passwordHash);

    if (!user.passwordHash) {
      console.log('❌ User has no password hash - cannot authenticate with credentials');
      return;
    }

    // 2. Test password comparison
    console.log('\n2. Testing password comparison...');
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    console.log('Password valid:', isPasswordValid);

    if (!isPasswordValid) {
      console.log('❌ Password is invalid');
      return;
    }

    console.log('✅ Password is valid');

    // 3. Test what the authorize function would return
    console.log('\n3. Testing authorize function return value...');
    const authorizeResult = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    console.log('Authorize would return:', authorizeResult);

  } catch (error) {
    console.error('❌ Error testing credentials auth:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testCredentialsAuth();
