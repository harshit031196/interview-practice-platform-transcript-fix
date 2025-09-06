#!/usr/bin/env node

// Test script for Cloud SQL connectivity
import { PrismaClient } from '@prisma/client'

const testCloudSQL = async () => {
  console.log('🔍 Testing Cloud SQL connectivity...')
  
  // Test with Cloud SQL Proxy connection
  const proxyUrl = 'postgresql://wingman_user:WingmanSecure2024!@127.0.0.1:5433/wingman_interview'
  
  try {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: proxyUrl
        }
      }
    })
    
    // Test basic connection
    await prisma.$connect()
    console.log('✅ Connected to Cloud SQL successfully')
    
    // Test a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`
    console.log('✅ Query executed successfully:', result)
    
    // Check if tables exist
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `
    console.log(`✅ Found ${tables.length} tables in database`)
    
    await prisma.$disconnect()
    console.log('✅ Connection test completed successfully')
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message)
    console.log('\n💡 Make sure to:')
    console.log('1. Start Cloud SQL Proxy: cloud-sql-proxy wingman-interview-470419:us-central1:wingman-interview-db --port 5433')
    console.log('2. Update your .env.local with the Cloud SQL DATABASE_URL')
    process.exit(1)
  }
}

testCloudSQL()
