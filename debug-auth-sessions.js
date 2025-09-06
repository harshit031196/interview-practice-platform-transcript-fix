const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function debugAuthSessions() {
  try {
    console.log('🔍 Debugging Authentication Sessions for pm.candidate@example.com');
    console.log('================================================================');

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: 'pm.candidate@example.com' },
      include: {
        sessions: true,
        accounts: true,
        intervieweeSessions: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    if (!user) {
      console.log('❌ User not found in database');
      return;
    }

    console.log('✅ User found:', {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt
    });

    console.log('\n📱 NextAuth Sessions:');
    if (user.sessions.length === 0) {
      console.log('❌ No NextAuth sessions found');
    } else {
      user.sessions.forEach((session, index) => {
        console.log(`${index + 1}. Session ID: ${session.id}`);
        console.log(`   Token: ${session.sessionToken.substring(0, 20)}...`);
        console.log(`   Expires: ${session.expires}`);
        console.log(`   Active: ${session.expires > new Date() ? '✅' : '❌'}`);
      });
    }

    console.log('\n🔗 OAuth Accounts:');
    if (user.accounts.length === 0) {
      console.log('❌ No OAuth accounts linked');
    } else {
      user.accounts.forEach((account, index) => {
        console.log(`${index + 1}. Provider: ${account.provider}`);
        console.log(`   Type: ${account.type}`);
        console.log(`   Provider Account ID: ${account.providerAccountId}`);
      });
    }

    console.log('\n🎯 Recent Interview Sessions:');
    if (user.intervieweeSessions.length === 0) {
      console.log('❌ No interview sessions found');
    } else {
      user.intervieweeSessions.forEach((session, index) => {
        console.log(`${index + 1}. Session ID: ${session.id}`);
        console.log(`   Type: ${session.type}`);
        console.log(`   Status: ${session.status}`);
        console.log(`   Created: ${session.createdAt}`);
        console.log(`   Conversational: ${session.isConversational || false}`);
      });
    }

    // Check for any recent database connections/errors
    console.log('\n🔧 Database Connection Test:');
    const connectionTest = await prisma.$queryRaw`SELECT NOW() as current_time`;
    console.log('✅ Database connection successful:', connectionTest);

  } catch (error) {
    console.error('❌ Error debugging auth sessions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugAuthSessions();
