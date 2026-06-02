require('dotenv').config();

async function inspect() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  
  console.log("Supabase URL:", supabaseUrl);
  console.log("Supabase Key length:", supabaseAnonKey ? supabaseAnonKey.length : 0);

  // 1. Let's do a GET request to see if we can read the sessions
  const getUrl = `${supabaseUrl}/rest/v1/chat_sessions?limit=1`;
  try {
    const res = await fetch(getUrl, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    console.log("GET status:", res.status);
    const data = await res.json();
    console.log("GET data sample:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("GET Error:", err.message);
  }

  // 2. Let's try to do a PATCH request with return=representation to see the exact error or success
  // We will search for any active session, or just run PATCH for a dummy/non-existent one, or a known one
  const sessionId = "5c84f462-00d6-4aba-bc42-7714628a1b1b";
  const patchUrl = `${supabaseUrl}/rest/v1/chat_sessions?session_id=eq.${sessionId}`;
  try {
    const res = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        is_approved: true,
        approval_status: 'APPROVED_BY_SLACK',
        total_tokens_consumed: 0
      })
    });
    console.log("PATCH status:", res.status);
    const text = await res.text();
    console.log("PATCH response:", text);
  } catch (err) {
    console.error("PATCH Error:", err.message);
  }
}

inspect();
