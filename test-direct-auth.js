const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

async function testDirectAuth() {
  try {
    console.log('🔍 Testing Direct NextAuth API');
    console.log('==============================');

    // Test the NextAuth providers endpoint
    console.log('1. Testing providers endpoint...');
    const providersResponse = await fetch('http://localhost:3000/api/auth/providers');
    const providers = await providersResponse.json();
    console.log('Available providers:', JSON.stringify(providers, null, 2));

    // Test direct POST to credentials signin
    console.log('\n2. Testing direct credentials POST...');
    const directAuth = await fetch('http://localhost:3000/api/auth/callback/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        email: 'pm.candidate@example.com',
        password: 'password123',
        redirect: 'false'
      })
    });

    console.log('Direct auth status:', directAuth.status);
    console.log('Direct auth headers:', Object.fromEntries(directAuth.headers.entries()));
    const directResult = await directAuth.text();
    console.log('Direct auth response:', directResult);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDirectAuth();
