const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

async function testNextAuthSignin() {
  try {
    console.log('🔍 Testing NextAuth Signin Flow');
    console.log('===============================');

    // 1. Get CSRF token first
    console.log('1. Getting CSRF token...');
    const csrfResponse = await fetch('http://localhost:3000/api/auth/csrf');
    const csrfData = await csrfResponse.json();
    console.log('CSRF token:', csrfData.csrfToken);

    // 2. Test signin with proper form data and CSRF token
    console.log('\n2. Testing signin with CSRF token...');
    const signinData = new URLSearchParams({
      email: 'pm.candidate@example.com',
      password: 'password123',
      csrfToken: csrfData.csrfToken,
      callbackUrl: 'http://localhost:3000/dashboard',
      json: 'true'
    });

    const signinResponse = await fetch('http://localhost:3000/api/auth/signin/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: signinData
    });

    console.log('Signin response status:', signinResponse.status);
    console.log('Signin response headers:', Object.fromEntries(signinResponse.headers.entries()));
    
    const signinResult = await signinResponse.text();
    console.log('Signin response body:', signinResult);

    // 3. Extract cookies from signin response
    const cookies = signinResponse.headers.get('set-cookie');
    console.log('\n3. Cookies from signin:', cookies);

    // 4. Test session endpoint with cookies
    if (cookies) {
      console.log('\n4. Testing session with cookies...');
      const sessionResponse = await fetch('http://localhost:3000/api/auth/session', {
        method: 'GET',
        headers: {
          'Cookie': cookies,
          'Content-Type': 'application/json'
        }
      });
      
      const sessionData = await sessionResponse.json();
      console.log('Session data with cookies:', sessionData);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testNextAuthSignin();
