const { v4: uuidv4 } = require('uuid');

const BASE_URL = 'http://localhost:8080';

async function runTests() {
  const sessionId = uuidv4();
  console.log(`Generated Test Session ID: ${sessionId}`);

  try {
    // 1. Health Check
    console.log('\n--- 1. Testing Health Check ---');
    const healthRes = await fetch(`${BASE_URL}/`);
    console.log(`Health Check Status: ${healthRes.status}`);
    const healthJson = await healthRes.json();
    console.log('Response:', JSON.stringify(healthJson, null, 2));

    // 2. Initial Chat (should be under threshold)
    console.log('\n--- 2. Testing Initial Chat ---');
    const chatRes1 = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        message: 'Hello, are you Syed?'
      })
    });
    console.log(`Initial Chat Status: ${chatRes1.status}`);
    const chatJson1 = await chatRes1.json();
    console.log('Response:', JSON.stringify(chatJson1, null, 2));

    // 3. Status Check
    console.log('\n--- 3. Testing Session Status ---');
    const statusRes1 = await fetch(`${BASE_URL}/api/session-status/${sessionId}`);
    console.log(`Status Check Status: ${statusRes1.status}`);
    const statusJson1 = await statusRes1.json();
    console.log('Response:', JSON.stringify(statusJson1, null, 2));

    // 4. Force lockout by sending a query that exceeds the budget
    // Note: Since systemInstruction contains the master profile, the first prompt actually consumed ~1000 tokens already!
    // Let's check if the first chat response already triggered lockout or if we need another message.
    if (chatJson1.requiresAuthForm) {
      console.log('Session is already locked out (expected since instruction + profile context is large!).');
    } else {
      console.log('\n--- 4. Testing Lockout Trigger ---');
      const chatRes2 = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId,
          message: 'Can you write a detailed description of your serverless architecture and tell me about all your projects?'
        })
      });
      console.log(`Lockout Chat Status: ${chatRes2.status}`);
      const chatJson2 = await chatRes2.json();
      console.log('Response:', JSON.stringify(chatJson2, null, 2));
    }

    // 5. Submit Auth
    console.log('\n--- 5. Testing Submit Auth ---');
    const authRes = await fetch(`${BASE_URL}/api/submit-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        name: 'Automated Integration Tester',
        email: 'tester@example.com'
      })
    });
    console.log(`Submit Auth Status: ${authRes.status}`);
    const authJson = await authRes.json();
    console.log('Response:', JSON.stringify(authJson, null, 2));

    // 6. Check status is BLOCKED_WAITING_APPROVAL
    console.log('\n--- 6. Verifying Locked Status ---');
    const statusRes2 = await fetch(`${BASE_URL}/api/session-status/${sessionId}`);
    const statusJson2 = await statusRes2.json();
    console.log('Response:', JSON.stringify(statusJson2, null, 2));

    // 7. Approve via Slack Interactivity Webhook
    console.log('\n--- 7. Testing Slack Approval Webhook ---');
    const slackPayload = {
      actions: [
        {
          action_id: 'approve_session',
          value: sessionId
        }
      ]
    };
    const approveRes = await fetch(`${BASE_URL}/api/slack-interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `payload=${encodeURIComponent(JSON.stringify(slackPayload))}`
    });
    console.log(`Slack Interaction Status: ${approveRes.status}`);
    const approveJson = await approveRes.json();
    console.log('Response:', JSON.stringify(approveJson, null, 2));

    // 8. Check status is APPROVED_BY_SLACK
    console.log('\n--- 8. Verifying Approved Status ---');
    const statusRes3 = await fetch(`${BASE_URL}/api/session-status/${sessionId}`);
    const statusJson3 = await statusRes3.json();
    console.log('Response:', JSON.stringify(statusJson3, null, 2));

    // 9. Post-Approval Chat (should succeed!)
    console.log('\n--- 9. Testing Post-Approval Chat ---');
    const chatRes3 = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId,
        message: 'Glad to talk to you after approval!'
      })
    });
    console.log(`Post-Approval Chat Status: ${chatRes3.status}`);
    const chatJson3 = await chatRes3.json();
    console.log('Response:', JSON.stringify(chatJson3, null, 2));

  } catch (err) {
    console.error('Test Execution Failed:', err);
  }
}

runTests();
