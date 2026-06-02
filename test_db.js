require('dotenv').config();

const url = `${process.env.SUPABASE_URL}/rest/v1/chat_sessions?session_id=eq.5c84f462-00d6-4aba-bc42-7714628a1b1b`;

const patchData = {
  is_approved: true,
  approval_status: 'APPROVED_BY_SLACK',
  total_tokens_consumed: 0
};

// We will also request Prefer: return=representation so Supabase returns the updated row!
fetch(url, {
  method: 'PATCH',
  headers: {
    'apikey': process.env.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  body: JSON.stringify(patchData)
})
.then(async (res) => {
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response Payload:", text);
})
.catch((err) => {
  console.error("Fetch Error:", err);
});
