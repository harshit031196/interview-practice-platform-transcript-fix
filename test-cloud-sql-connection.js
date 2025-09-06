// Test script to verify connection to Google Cloud SQL
require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function testConnection() {
  try {
    console.log('Testing connection to Google Cloud SQL...');
    console.log('Database URL:', process.env.DATABASE_URL);
    
    // Try to query the database
    const result = await prisma.$queryRaw`SELECT NOW() as current_time`;
    console.log('Connection successful!');
    console.log('Current time from database:', result[0].current_time);
    
    // Get some basic stats from the database
    const userCount = await prisma.user.count();
    console.log(`Number of users in database: ${userCount}`);
    
    const sessionCount = await prisma.session.count();
    console.log(`Number of sessions in database: ${sessionCount}`);
    
    const interviewSessionCount = await prisma.interviewSession.count();
    console.log(`Number of interview sessions in database: ${interviewSessionCount}`);
    
  } catch (error) {
    console.error('Error connecting to database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
