require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testAuthConnection() {
  try {
    // Test user authentication
    const user = await prisma.user.findUnique({
      where: {
        email: 'pm.candidate@example.com'
      }
    });
    
    if (user) {
      console.log('User found:', { id: user.id, email: user.email });
      
      // Check for active sessions for this user
      const sessions = await prisma.session.findMany({
        where: {
          userId: user.id
        }
      });
      
      console.log(`Found ${sessions.length} active sessions for user`);
      if (sessions.length > 0) {
        console.log('Latest session:', {
          id: sessions[0].id,
          expires: sessions[0].expires
        });
      }
    } else {
      console.log('User not found');
    }
  } catch (error) {
    console.error('Authentication test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAuthConnection();
