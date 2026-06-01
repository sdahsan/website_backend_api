# Syed's AI Assistant Backend API Gateway

This repository contains the production-grade orchestration and artificial intelligence backend engine for Syed Azharuddin's portfolio chatbot platform (`Syed's AI Assistant`). 

Designed using **Node.js Express** and strict **CommonJS** formatting, this backend operates serverless and scales to zero seamlessly on **GCP Cloud Run**.

---

## Technical Architecture Overview

The backend serves as a centralized gateway coordinating three external integrations with **strict token quota enforcement (500 tokens)**:
1. **Google Gen AI SDK**: Interfaces with `gemini-2.5-flash` using pre-flight token foot-printing (`ai.models.countTokens()`) to enforce user budgets.
2. **Supabase Database (REST-only)**: Synchronizes visitor session states, contact variables, and conversation histories via direct REST calls, bypassing client wrapper latency.
3. **Slack Webhook Notifications**: Dispatches real-time lockout alerts to internal team channels asynchronously in the background.

```
                      ┌──────────────────────┐
                      │  React/Vercel Client │
                      └──────────┬───────────┘
                                 │ POST /api/chat
                                 │ POST /api/submit-auth
                                 ▼
                   ┌───────────────────────────┐
                   │    Express.js Gateway     │
                   │      (GCP Cloud Run)      │
                   └────┬──────────┬─────────┬─┘
                        │          │         │
          Direct REST   │          │         │ Asynchronous & Detached
        ┌───────────────┘          │         └─────────────────────────┐
        ▼                          ▼                                   ▼
    ┌───────┐             ┌─────────────────┐                     ┌─────────┐
    │Supabase│             │ Google Gen AI   │                     │  Slack  │
    │  DB   │             │gemini-2.5-flash │                     │ Channel │
    └───────┘             └─────────────────┘                     └─────────┘
```

---

## Local Setup & Configuration

### 1. Prerequisites
* **Node.js**: `v18.0.0` or higher
* **npm**: `v9.0.0` or higher

### 2. Environment Configuration
Create a `.env` file in the root folder and configure the following variables:

```env
# Application Port
PORT=8080

# API Gateway Key (Optional, Bearer header authorization)
API_GATEWAY_KEY=your_optional_gateway_token

# Administrative Override Passphrase (Required for /api/slack-webhook-approval)
INTERNAL_SECRET_PASSPHRASE=your_secret_admin_passphrase_here

# Google Gemini API Credentials
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase REST Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Slack Integration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/path
```

### 3. Installation
Install project dependencies:
```bash
npm install
```

### 4. Running the Service
To run the server in development mode:
```bash
npm run dev
```
The application will boot and expose:
* **Base Gateway Endpoint**: `http://localhost:8080`
* **Swagger/OpenAPI Documentation Route**: `http://localhost:8080/api-docs`

---

## Database Table Schema & SQL Query
To implement the database column for session tracking, copy and execute the updated SQL script directly in the **SQL Editor** of your Supabase dashboard:

```sql
-- Create the chat sessions tracking table with token quota states
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id UUID PRIMARY KEY,
    user_name TEXT DEFAULT 'Anonymous Guest' NOT NULL,
    user_email TEXT, -- Ingested contact email on lockout
    is_approved BOOLEAN DEFAULT false NOT NULL,
    approval_status TEXT DEFAULT 'PENDING_THRESHOLD' NOT NULL, -- PENDING_THRESHOLD, BLOCKED_WAITING_APPROVAL, APPROVED_BY_SLACK
    conversation_history JSONB DEFAULT '[]'::jsonb NOT NULL,
    total_tokens_consumed INTEGER DEFAULT 0 NOT NULL
);

-- Enable row-level security (RLS) if required by your database security rules
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all anonymous access (insert, select, update) 
-- matching the anon-key configuration utilized by the REST API gateway
CREATE POLICY "Allow anonymous read access" ON chat_sessions 
    FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous insert access" ON chat_sessions 
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous update access" ON chat_sessions 
    FOR UPDATE TO anon USING (true) WITH CHECK (true);
```

---

## API Endpoints

### 1. Conversational Chat Router
* **Endpoint**: `POST /api/chat`
* **Request Payload**:
  ```json
  {
    "sessionId": "4a7b5d2c-8f9e-4c1d-8b0a-9d8e7f6c5b4a", // Optional
    "message": "What is your GKE experience?"              // Required
  }
  ```
* **Normal Response (200 OK - requiresAuthForm: false)**:
  ```json
  {
    "sessionId": "4a7b5d2c-8f9e-4c1d-8b0a-9d8e7f6c5b4a",
    "requiresAuthForm": false,
    "reply": "I have over 12 years of experience managing GKE clusters..."
  }
  ```
* **Lockout Response (200 OK - requiresAuthForm: true)**:
  ```json
  {
    "sessionId": "4a7b5d2c-8f9e-4c1d-8b0a-9d8e7f6c5b4a",
    "requiresAuthForm": true,
    "message": "Token quota constraint reached."
  }
  ```

### 2. Lockout Form Ingestion
* **Endpoint**: `POST /api/submit-auth`
* **Request Payload**:
  ```json
  {
    "sessionId": "4a7b5d2c-8f9e-4c1d-8b0a-9d8e7f6c5b4a",
    "name": "Jane Doe",
    "email": "jane.doe@example.com"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Authorization logged."
  }
  ```
  *(Simultaneously streams a markdown request for action to the team's Slack channel).*

### 3. Administrative Reset Webhook
* **Endpoint**: `POST /api/slack-webhook-approval`
* **Request Payload**:
  ```json
  {
    "secretToken": "your_secret_admin_passphrase_here",
    "targetSessionId": "4a7b5d2c-8f9e-4c1d-8b0a-9d8e7f6c5b4a"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Session successfully reset."
  }
  ```
  *(This unlocks the session, sets approval_status to 'APPROVED_BY_SLACK', and resets consumption back to zero).*

---

## Serverless GCP Cloud Run Deployment

To deploy this backend as a serverless container on Google Cloud Run:

```bash
# 1. Build and submit container image to Artifact Registry
gcloud builds submit --tag gcr.io/your-gcp-project-id/syeds-ai-assistant-backend

# 2. Deploy service on Cloud Run with environment overrides
gcloud run deploy syeds-ai-assistant-backend \
  --image gcr.io/your-gcp-project-id/syeds-ai-assistant-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="GEMINI_API_KEY=your_gemini_key,SUPABASE_URL=your_supabase_url,SUPABASE_ANON_KEY=your_supabase_key,INTERNAL_SECRET_PASSPHRASE=your_passphrase"
```
