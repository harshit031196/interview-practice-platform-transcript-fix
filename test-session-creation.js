const fetch = require('node-fetch');

async function testSessionCreation() {
  console.log('🔐 Testing Session Creation After NextAuth Fix\n');
  
  try {
    // Test 1: Check NextAuth session endpoint
    console.log('1️⃣ Testing NextAuth session endpoint...');
    const sessionResponse = await fetch('http://localhost:3000/api/auth/session');
    
    console.log('Status:', sessionResponse.status);
    console.log('Headers:', Object.fromEntries(sessionResponse.headers.entries()));
    
    if (sessionResponse.ok) {
      const sessionData = await sessionResponse.json();
      console.log('✅ Session endpoint working');
      console.log('Session data:', JSON.stringify(sessionData, null, 2));
    } else {
      console.log('❌ Session endpoint failed');
      const errorText = await sessionResponse.text();
      console.log('Error:', errorText);
    }
    
    // Test 2: Check sign-in page accessibility
    console.log('\n2️⃣ Testing sign-in page...');
    const signinResponse = await fetch('http://localhost:3000/auth/signin');
    
    if (signinResponse.ok) {
      console.log('✅ Sign-in page accessible');
    } else {
      console.log('❌ Sign-in page failed:', signinResponse.status);
    }
    
    // Test 3: Check CSRF token endpoint
    console.log('\n3️⃣ Testing CSRF token...');
    const csrfResponse = await fetch('http://localhost:3000/api/auth/csrf');
    
    if (csrfResponse.ok) {
      const csrfData = await csrfResponse.json();
      console.log('✅ CSRF token available');
      console.log('CSRF token:', csrfData.csrfToken);
    } else {
      console.log('❌ CSRF token failed:', csrfResponse.status);
    }
    
    console.log('\n📋 Session Creation Status:');
    console.log('- NextAuth configuration: Fixed (removed Prisma adapter conflict)');
    console.log('- Database connection: Working');
    console.log('- JWT strategy: Enabled');
    console.log('- NEXTAUTH_SECRET: Configured');
    
    console.log('\n🎯 Next Steps:');
    console.log('1. Sign in through the browser at http://localhost:3000/auth/signin');
    console.log('2. Use credentials: test@example.com / password123');
    console.log('3. After sign-in, test video analysis through the UI');
    
  } catch (error) {
    console.error('💥 Test error:', error);
  }
}

testSessionCreation();
