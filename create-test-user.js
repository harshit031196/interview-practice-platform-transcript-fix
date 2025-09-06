/**
 * Script to create a test user for authentication testing
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log('Creating test user for authentication testing...');
    
    // Test user details
    const email = 'pm.candidate@example.com';
    const password = 'password123';
    const name = 'PM Candidate';
    const role = 'INTERVIEWEE'; // Valid roles: INTERVIEWEE, INTERVIEWER, BOTH
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      console.log(`User ${email} already exists with ID: ${existingUser.id}`);
      return existingUser;
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user with intervieweeProfile
    const user = await prisma.user.create({
      data: {
        email,
        name,
        role,
        passwordHash,
        intervieweeProfile: {
          create: {
            readinessScore: 75,
            jobTitle: 'Product Manager',
            industry: 'Technology',
            experienceLevel: 'MID',
            targetCompanies: ['Google', 'Microsoft', 'Amazon'],
            targetRoles: ['Product Manager', 'Senior Product Manager']
          }
        }
      },
      include: {
        intervieweeProfile: true
      }
    });
    
    console.log(`User created successfully with ID: ${user.id}`);
    console.log('User details:', {
      email: user.email,
      name: user.name,
      role: user.role
    });
    
    return user;
  } catch (error) {
    console.error('Error creating test user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
