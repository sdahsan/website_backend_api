require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const swaggerUi = require('swagger-ui-express');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 8080;

// Ingest master_profile.md synchronous on startup
let masterProfileContext = '';
try {
  masterProfileContext = fs.readFileSync(path.join(__dirname, 'master_profile.md'), 'utf8');
  console.log('Successfully ingested master_profile.md');
} catch (error) {
  console.error('Failed to load master_profile.md. Server running without master context.', error.message);
}

// Ingest swagger.json synchronous on startup
let swaggerDocument = {};
try {
  swaggerDocument = JSON.parse(fs.readFileSync(path.join(__dirname, 'swagger.json'), 'utf8'));
  console.log('Successfully ingested swagger.json');
} catch (error) {
  console.error('Failed to load swagger.json. OpenAPI documentation will not be available.', error.message);
}

// Global Middlewares
app.use(cors());
app.use(express.json());

// Centralized clean logging interceptor
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  let payloadString = '';
  if (req.body && Object.keys(req.body).length > 0) {
    const bodyCopy = { ...req.body };
    if (bodyCopy.message && bodyCopy.message.length > 80) {
      bodyCopy.message = bodyCopy.message.substring(0, 80) + '...';
    }
    payloadString = JSON.stringify(bodyCopy);
  }
  console.log(`[${timestamp}] ${req.method} ${req.path} - Payload: ${payloadString}`);
  next();
});

// Swagger UI Route
if (swaggerDocument.openapi) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const ai = new GoogleGenAI(apiKey ? { apiKey } : {});

// Slack Notification Helper
function sendSlackNotification(userName, sessionId, message) {
  if (!process.env.SLACK_WEBHOOK_URL) return;

  const slackBody = {
    text: `🔔 *Syed's AI Assistant Portfolio Interaction Alert* 🔔\n*Visitor Identifier:* ${userName}\n*Session Token Reference:* ${sessionId}\n*Ingested Query:* ${message}`
  };

  fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(slackBody)
  })
  .then((res) => {
    if (!res.ok) {
      console.error(`Slack webhook responded with status ${res.status}`);
    }
  })
  .catch((err) => {
    console.error('Slack webhook notification failed:', err.message);
  });
}

// Supabase REST Helpers
async function getSupabaseSession(sessionId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase environment variables are missing. Skipping DB retrieve.');
    return null;
  }

  const url = `${supabaseUrl}/rest/v1/chat_sessions?session_id=eq.${sessionId}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase GET request failed with status: ${response.status}`);
  }

  const data = await response.json();
  return data && data.length > 0 ? data[0] : null;
}

async function upsertSupabaseSession(sessionData) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return;
  }

  const url = `${supabaseUrl}/rest/v1/chat_sessions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(sessionData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase UPSERT request failed with status ${response.status}: ${errorText}`);
  }
}

// Authorization Middleware
function authenticateApiKey(req, res, next) {
  const gatewayKey = process.env.API_GATEWAY_KEY;

  // Skip authentication if the key is not set in the environment variables (e.g., local development)
  if (!gatewayKey) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Unauthorized: Missing or malformed Authorization Bearer header." });
  }

  const token = authHeader.split(' ')[1];
  if (token !== gatewayKey) {
    return res.status(403).json({ error: "Forbidden: Invalid authorization token." });
  }

  next();
}

// POST /api/chat Route
app.post('/api/chat', authenticateApiKey, async (req, res) => {
  try {
    let { sessionId, name, message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: "Property 'message' is required and must be a string." });
    }

    // Step A: Session Retrieval & Layout Token Resolution
    if (!sessionId) {
      sessionId = uuidv4();
    }

    let isApproved = false;
    let userName = 'Anonymous Guest';
    let chatHistory = [];

    // Query Supabase securely
    try {
      const record = await getSupabaseSession(sessionId);
      if (record) {
        isApproved = record.is_approved || false;
        userName = record.user_name || 'Anonymous Guest';
        chatHistory = Array.isArray(record.conversation_history) ? record.conversation_history : [];
      }
    } catch (dbError) {
      console.error('Database Session Retrieval Isolation Error:', dbError.message);
      // Graceful fallback to baseline session object in memory
    }

    // Dynamic Frontend UI Toggle Overwrite
    if (name && typeof name === 'string' && name.trim().length > 0) {
      isApproved = true;
      userName = name.trim();
    }

    // Step B: Slack Webhook Notification Integration (Asynchronous and Detached)
    try {
      sendSlackNotification(userName, sessionId, message);
    } catch (slackError) {
      console.error('Slack Webhook Invocation Isolation Error:', slackError.message);
    }

    // Step C: Gemini API AI Processing
    const userTurn = { role: 'user', parts: [{ text: message }] };
    chatHistory.push(userTurn);

    const systemInstructionText = `You are "Syed's AI Assistant", representing Syed Azharuddin.
The visitor you are communicating with is named: ${userName}.

Here is Syed Azharuddin's master professional profile context:
${masterProfileContext}

Operational Directives:
1. Adopt the digital persona of Syed Azharuddin. Respond in the first person ("I", "my", "me").
2. Prioritize absolute factual accuracy strictly based on the master profile. Do not make external assumptions, extrapolate, or hallucinate career facts.
3. If asked about undocumented skills, experiences, or personal secrets, politely explain that the information is outside your operational profile and offer to redirect the visitor to Syed's LinkedIn or direct channels.
4. Match designated profile nomenclature guidelines. Keep your responses highly professional, clean, structured, and helpful.`;

    let botReplyText = '';
    try {
      const modelResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: chatHistory,
        config: {
          systemInstruction: systemInstructionText,
          temperature: 0.3
        }
      });
      botReplyText = modelResponse.text || '';
    } catch (geminiError) {
      console.error('Gemini API Invocation Isolation Error:', geminiError.stack || geminiError.message);
      throw geminiError; // Rethrow to let global try-catch return HTTP 500 error payload
    }

    // Step D: Supabase Data Sync & Client Payload Emission
    const modelTurn = { role: 'model', parts: [{ text: botReplyText }] };
    chatHistory.push(modelTurn);

    try {
      await upsertSupabaseSession({
        session_id: sessionId,
        is_approved: isApproved,
        user_name: userName,
        conversation_history: chatHistory
      });
    } catch (dbSyncError) {
      console.error('Database Sync Isolation Error:', dbSyncError.message);
      // Proceed gracefully to respond to the visitor even if DB write fails
    }

    // Return the response payload
    return res.status(200).json({
      sessionId,
      isApproved,
      reply: botReplyText
    });

  } catch (error) {
    // Centralized 500 handler for unhandled exceptions or Gemini failures
    console.error('CRITICAL: Chat Orchestration Exception Trace:', error.stack || error.message);
    return res.status(500).json({
      error: "The AI agent failed to parse context instructions."
    });
  }
});

// Root Route
app.get('/', (req, res) => {
  res.status(200).json({
    name: "Syed's AI Assistant Backend API",
    status: "Healthy",
    docs: "/api-docs"
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Syed's AI Assistant backend server listening dynamically on port ${PORT}`);
});
