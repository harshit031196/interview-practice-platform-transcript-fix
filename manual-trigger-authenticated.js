// Manual trigger with proper authentication simulation
const sessionId = 'cmey2xwv80001z9vs36dnmn72';
const videoUri = 'gs://wingman-interview-videos-harshit-2024/interviews/cmexwu4d50000atgub3z63fdc/cmey2xwv80001z9vs36dnmn72/1756547385687_interview_cmey2xwv80001z9vs36dnmn72_1756547385335.webm';

console.log('🔧 Manual Video Analysis Trigger');
console.log('================================');
console.log('Session ID:', sessionId);
console.log('Video URI:', videoUri);
console.log('');

console.log('📋 INSTRUCTIONS TO MANUALLY TRIGGER:');
console.log('====================================');
console.log('1. Open your browser and go to: http://localhost:3000/auth/signin');
console.log('2. Sign in with: pm.candidate@example.com / password123');
console.log('3. Open browser developer tools (F12)');
console.log('4. Go to Console tab');
console.log('5. Paste and run this code:');
console.log('');
console.log('```javascript');
console.log('fetch("/api/video-analysis", {');
console.log('  method: "POST",');
console.log('  headers: { "Content-Type": "application/json" },');
console.log('  credentials: "include",');
console.log('  body: JSON.stringify({');
console.log(`    videoUri: "${videoUri}",`);
console.log(`    sessionId: "${sessionId}",`);
console.log('    analysisType: "comprehensive"');
console.log('  })');
console.log('}).then(r => r.json()).then(console.log).catch(console.error);');
console.log('```');
console.log('');
console.log('6. Wait for the analysis to complete (may take 2-5 minutes)');
console.log('7. Check results at: http://localhost:3000/feedback/' + sessionId);
console.log('');

console.log('🎯 EXPECTED RESULTS:');
console.log('===================');
console.log('✅ Speech Detection: YES (91.3% confidence)');
console.log('✅ Audio Transcription: Full transcript available');
console.log('✅ Speaker Diarization: Multiple speakers detected');
console.log('✅ Face Detection: Should detect video participants');
console.log('✅ Overall Analysis: Comprehensive feedback');
console.log('');

console.log('💡 TO PREVENT FUTURE ISSUES:');
console.log('============================');
console.log('1. Ensure stable internet during interviews');
console.log('2. Keep browser tab active during recording');
console.log('3. Don\'t close browser until "Analysis completed" message');
console.log('4. Check feedback page immediately after interview');
console.log('5. If analysis missing, use this manual trigger method');
