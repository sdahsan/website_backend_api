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

// Synchronous core context ingestion
let masterProfileContext = '';
try {
  masterProfileContext = fs.readFileSync(path.join(__dirname, 'master_profile.md'), 'utf8');
  console.log('Successfully ingested master_profile.md');
} catch (error) {
  console.error('Failed to load master_profile.md. Server running without master context.', error.message);
}

// Synchronous Swagger configuration ingestion
let swaggerDocument = {};
try {
  swaggerDocument = JSON.parse(fs.readFileSync(path.join(__dirname, 'swagger.json'), 'utf8'));
  console.log('Successfully ingested swagger.json');
} catch (error) {
  console.error('Failed to load swagger.json. OpenAPI documentation will not be available.', error.message);
}

// Global Middleware Configuration
app.use(cors());
app.use(express.json());

// Native Centralized Logging Utility
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const sessionId = req.body?.sessionId || req.body?.targetSessionId || 'N/A';
  
  res.on('finish', () => {
    const tokenFootprint = res.locals.tokenFootprint || '0';
    console.log(`[${timestamp}] ${req.method} ${req.path} - Session: ${sessionId} - Token Footprint: ${tokenFootprint}`);
  });
  
  next();
});

// Expose OpenAPI UI Documentation
if (swaggerDocument.openapi) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// Initialize official Google Gen AI Client
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const ai = new GoogleGenAI(apiKey ? { apiKey } : {});

// Slack Lockout Notification Dispatcher (Asynchronous & Non-Blocking)
function sendSlackLockoutAlert(name, email, sessionId) {
  if (!process.env.SLACK_WEBHOOK_URL) return;

  const slackBody = {
    text: `🚨 *Token Limit Warning: Syed's AI Assistant Action Required* 🚨\n*Visitor Identity Name:* ${name}\n*Contact Email:* ${email}\n*Target Session Key:* \`${sessionId}\``
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
      console.error(`Slack webhook responded with error status ${res.status}`);
    }
  })
  .catch((err) => {
    console.error('Slack webhook lock alert failed:', err.message);
  });
}

// Supabase Direct REST PostgREST Handlers
async function getSupabaseSession(sessionId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase environment variables are missing. Skipping DB retrieval.');
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

async function insertSupabaseSession(sessionData) {
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
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(sessionData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase INSERT request failed with status ${response.status}: ${errorText}`);
  }
}

async function patchSupabaseSession(sessionId, patchData) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return;
  }

  const url = `${supabaseUrl}/rest/v1/chat_sessions?session_id=eq.${sessionId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(patchData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase PATCH request failed with status ${response.status}: ${errorText}`);
  }
}

// System Instructions grounder for countTokens and generateContent
const systemInstructionText = `You are "Syed's AI Assistant", representing Syed Azharuddin.

Here is Syed Azharuddin's master professional profile context:
${masterProfileContext}

Operational Directives:
1. Adopt the digital persona of Syed Azharuddin. Respond in the first person ("I", "my", "me").
2. Prioritize absolute factual accuracy strictly based on the master profile. Do not make external assumptions, extrapolate, or hallucinate career facts.
3. If asked about undocumented skills, experiences, or personal secrets, politely explain that the information is outside your operational profile and offer to redirect the visitor to Syed's LinkedIn or direct channels.
4. Match designated profile nomenclature guidelines. Keep your responses highly professional, clean, structured, and helpful.`;

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

// CORE API ROUTE 1: POST `/api/chat`
app.post('/api/chat', authenticateApiKey, async (req, res) => {
  try {
    let { sessionId, message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: "Property 'message' is required and must be a string." });
    }

    // Step A: Session Resolution & Status Evaluation
    if (!sessionId) {
      sessionId = uuidv4();
    }

    let record = null;
    try {
      record = await getSupabaseSession(sessionId);
    } catch (dbError) {
      console.error('Database Session Retrieval Isolation Error:', dbError.message);
    }

    if (!record) {
      // Initialize fresh session baseline in database
      const baseline = {
        session_id: sessionId,
        user_name: 'Anonymous Guest',
        user_email: null,
        is_approved: false,
        approval_status: 'PENDING_THRESHOLD',
        conversation_history: [],
        total_tokens_consumed: 0
      };

      try {
        await insertSupabaseSession(baseline);
        record = baseline;
      } catch (dbInsertError) {
        console.error('Database Baseline Creation Isolation Error:', dbInsertError.message);
        // Fallback in memory
        record = baseline;
      }
    }

    // Hard Lock Check
    if (record.approval_status === 'BLOCKED_WAITING_APPROVAL') {
      res.locals.tokenFootprint = record.total_tokens_consumed;
      return res.status(200).json({
        sessionId,
        requiresAuthForm: true,
        message: "Session quota exceeded. Awaiting admin approval."
      });
    }

    // Step B: Pre-Flight Token Footprint Calculation
    const userTurn = { role: 'user', parts: [{ text: message }] };
    const chatHistory = Array.isArray(record.conversation_history) ? record.conversation_history : [];
    const simulatedHistory = [...chatHistory, userTurn];

    let totalTokens = 0;
    try {
      const tokenResponse = await ai.models.countTokens({
        model: 'gemini-2.5-flash',
        contents: simulatedHistory
      });
      totalTokens = tokenResponse.totalTokens || 0;
      res.locals.tokenFootprint = totalTokens;
    } catch (geminiCountError) {
      console.error('Gemini Pre-Flight Tokenization Isolation Error:', geminiCountError.message);
      // Fallback estimate if SDK fails to count
      totalTokens = (chatHistory.length + 1) * 150;
    }

    // Step C: Token Limit Enforcement Logic (>500 Tokens)
    if (totalTokens > 500 && record.approval_status !== 'APPROVED_BY_SLACK') {
      try {
        await patchSupabaseSession(sessionId, {
          approval_status: 'BLOCKED_WAITING_APPROVAL',
          conversation_history: simulatedHistory,
          total_tokens_consumed: totalTokens
        });
      } catch (dbPatchError) {
        console.error('Database Lock Status Isolation Error:', dbPatchError.message);
      }

      return res.status(200).json({
        sessionId,
        requiresAuthForm: true,
        message: "Token quota constraint reached."
      });
    }

    // Step D: Generation & Sync Lifecycle
    chatHistory.push(userTurn);

    let botReplyText = '';
    let finalTokens = totalTokens;

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
      
      // Extract exact metadata from Gemini
      if (modelResponse.usageMetadata?.totalTokenCount) {
        finalTokens = modelResponse.usageMetadata.totalTokenCount;
      }
      res.locals.tokenFootprint = finalTokens;
    } catch (geminiError) {
      console.error('Gemini API Invocation Isolation Error:', geminiError.stack || geminiError.message);
      throw geminiError; // Rethrow to let global try-catch return HTTP 500 error payload
    }

    // Commit model turn to rolling history
    const modelTurn = { role: 'model', parts: [{ text: botReplyText }] };
    chatHistory.push(modelTurn);

    try {
      await patchSupabaseSession(sessionId, {
        conversation_history: chatHistory,
        total_tokens_consumed: finalTokens
      });
    } catch (dbSyncError) {
      console.error('Database Final Sync Isolation Error:', dbSyncError.message);
    }

    return res.status(200).json({
      sessionId,
      requiresAuthForm: false,
      reply: botReplyText
    });

  } catch (error) {
    console.error('CRITICAL: Chat Orchestration Exception Trace:', error.stack || error.message);
    return res.status(500).json({
      error: "The infrastructure failed to validate processing constraints."
    });
  }
});

// CORE API ROUTE 2: POST `/api/submit-auth`
app.post('/api/submit-auth', async (req, res) => {
  try {
    const { sessionId, name, email } = req.body;

    if (!sessionId || !name || !email) {
      return res.status(400).json({ error: "Properties 'sessionId', 'name', and 'email' are required." });
    }

    try {
      await patchSupabaseSession(sessionId, {
        user_name: name,
        user_email: email
      });
    } catch (dbError) {
      console.error('Database Submit-Auth Sync Isolation Error:', dbError.message);
    }

    // Detached background promise for Slack alert
    try {
      sendSlackLockoutAlert(name, email, sessionId);
    } catch (slackError) {
      console.error('Slack Alert Invocation Isolation Error:', slackError.message);
    }

    return res.status(200).json({
      success: true,
      message: "Authorization logged."
    });

  } catch (error) {
    console.error('CRITICAL: Submit-Auth Exception Trace:', error.stack || error.message);
    return res.status(500).json({
      error: "The infrastructure failed to validate processing constraints."
    });
  }
});

// CORE API ROUTE 3: POST `/api/slack-webhook-approval`
app.post('/api/slack-webhook-approval', async (req, res) => {
  try {
    const { secretToken, targetSessionId } = req.body;

    if (!secretToken || !targetSessionId) {
      return res.status(400).json({ error: "Properties 'secretToken' and 'targetSessionId' are required." });
    }

    const internalSecret = process.env.INTERNAL_SECRET_PASSPHRASE;
    if (!internalSecret || secretToken !== internalSecret) {
      return res.status(401).json({ error: "Unauthorized: Invalid administrative credentials." });
    }

    try {
      await patchSupabaseSession(targetSessionId, {
        is_approved: true,
        approval_status: 'APPROVED_BY_SLACK',
        total_tokens_consumed: 0
      });
    } catch (dbError) {
      console.error('Database Webhook Reset Sync Isolation Error:', dbError.message);
      throw dbError;
    }

    return res.status(200).json({
      success: true,
      message: "Session successfully reset."
    });

  } catch (error) {
    console.error('CRITICAL: Administrative Webhook Approval Exception Trace:', error.stack || error.message);
    return res.status(500).json({
      error: "The infrastructure failed to validate processing constraints."
    });
  }
});

// Health check and root route
app.get('/', (req, res) => {
  res.status(200).json({
    name: "Syed's AI Assistant Backend API",
    status: "Healthy",
    docs: "/api-docs"
  });
});

// Start the Express service
app.listen(PORT, () => {
  console.log(`Syed's AI Assistant backend server listening dynamically on port ${PORT}`);
});
