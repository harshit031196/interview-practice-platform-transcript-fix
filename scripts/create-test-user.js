const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function createTestUser() {
  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: 'pm.candidate@example.com' }
    });

    if (existingUser) {
      console.log('User already exists:', existingUser.email);
      console.log('Password: password123');
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash('password123', 12);

    // Create the user
    const user = await prisma.user.create({
      data: {
        email: 'pm.candidate@example.com',
        name: 'PM Candidate',
        passwordHash: hashedPassword,
        role: 'INTERVIEWEE',
      }
    });

    console.log('Test user created successfully:', user.email);
  } catch (error) {
    console.error('Error creating test user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
