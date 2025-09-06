/**
 * Script to add an intervieweeProfile to the existing test user
 */

const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();

async function updateTestUserProfile() {
  try {
    console.log('Adding intervieweeProfile to test user...');
    
    // Test user email
    const email = 'pm.candidate@example.com';
    
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { intervieweeProfile: true }
    });
    
    if (!existingUser) {
      console.log(`User ${email} not found. Please create the user first.`);
      return null;
    }
    
    console.log(`Found user ${email} with ID: ${existingUser.id}`);
    
    if (existingUser.intervieweeProfile) {
      console.log('User already has an intervieweeProfile:', existingUser.intervieweeProfile.id);
      return existingUser;
    }
    
    // Create intervieweeProfile for the user
    const updatedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        intervieweeProfile: {
          create: {
            currentRole: 'Product Manager',
            yearsExp: 5,
            industry: 'Technology',
            skills: JSON.stringify(['Product Management', 'Agile', 'User Research', 'Data Analysis']),
            targetRoles: ['Product Manager', 'Senior Product Manager'],
            readinessScore: 75
          }
        }
      },
      include: {
        intervieweeProfile: true
      }
    });
    
    console.log('IntervieweeProfile created successfully:', updatedUser.intervieweeProfile.id);
    console.log('Profile details:', {
      readinessScore: updatedUser.intervieweeProfile.readinessScore,
      jobTitle: updatedUser.intervieweeProfile.jobTitle,
      experienceLevel: updatedUser.intervieweeProfile.experienceLevel
    });
    
    return updatedUser;
  } catch (error) {
    console.error('Error updating test user profile:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateTestUserProfile();
