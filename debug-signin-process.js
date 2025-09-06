const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.env.local' });

async function debugSigninProcess() {
  try {
    console.log('🔍 Debugging Signin Process');
    console.log('===========================');

    // Test the signin API endpoint directly
    const signinData = {
      email: 'pm.candidate@example.com',
      password: 'password123',
      redirect: false
    };

    console.log('Testing credentials signin...');
    const signinResponse = await fetch('http://localhost:3000/api/auth/signin/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        email: signinData.email,
        password: signinData.password,
        redirect: 'false',
        json: 'true'
      })
    });

    console.log('Signin response status:', signinResponse.status);
    console.log('Signin response headers:', Object.fromEntries(signinResponse.headers.entries()));
    
    const signinResult = await signinResponse.text();
    console.log('Signin response body:', signinResult);

    // Test session endpoint after signin attempt
    console.log('\n🔍 Checking session after signin attempt...');
    const sessionResponse = await fetch('http://localhost:3000/api/auth/session', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const sessionData = await sessionResponse.json();
    console.log('Session data:', sessionData);

    // Test CSRF token
    console.log('\n🔍 Checking CSRF token...');
    const csrfResponse = await fetch('http://localhost:3000/api/auth/csrf');
    const csrfData = await csrfResponse.json();
    console.log('CSRF token:', csrfData);

  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugSigninProcess();
