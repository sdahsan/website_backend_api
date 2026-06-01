# Syed's AI Assistant Backend API Gateway

This repository contains the production-grade orchestration and artificial intelligence backend engine for Syed Azharuddin's portfolio chatbot platform (`Syed's AI Assistant`). 

Designed using **Node.js Express** and strict **CommonJS** formatting, this backend operates serverless and scales to zero seamlessly on **GCP Cloud Run**.

---

## Technical Architecture Overview

The backend serves as a centralized gateway coordinating three external integrations:
1. **Google Gen AI SDK**: Interfaces with `gemini-2.5-flash` utilizing strict system instruction grounding to prevent hallucinations.
2. **Supabase Database (REST-only)**: Reads and persists visitor session details and rolling conversation context via direct RESTful PostgREST calls, eliminating cold-start client overhead.
3. **Slack Webhook Notifications**: Streams real-time portfolio interaction alerts to a Slack channel asynchronously, entirely isolated from the client request timeline.

```
                  ┌──────────────────────┐
                  │  React/Vercel Client │
                  └──────────┬───────────┘
                             │ POST /api/chat
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

# Google Gemini API Credentials
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase REST Configuration
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Slack Integration (Optional)
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

## API Documentation

### 1. Health Check
* **Endpoint**: `GET /`
* **Response**:
  ```json
  {
    "name": "Syed's AI Assistant Backend API",
    "status": "Healthy",
    "docs": "/api-docs"
  }
  ```

### 2. Interactive Swagger documentation
* **Endpoint**: `GET /api-docs`
* **Description**: Renders the complete OpenAPI 3.0 interface powered by `swagger.json`.

### 3. Chat Endpoint
* **Endpoint**: `POST /api/chat`
* **Request Header**: `Content-Type: application/json`
* **Request Payload**:
  ```json
  {
    "sessionId": "4a7b5d2c-8f9e-4c1d-8b0a-9d8e7f6c5b4a", // Optional (generates a fresh UUID if null)
    "name": "John Doe",                                  // Optional (Finalizes dynamic name verification)
    "message": "Can you summarize Syed's Cloud experience?" // Required
  }
  ```
* **Response Payload (200 OK)**:
  ```json
  {
    "sessionId": "4a7b5d2c-8f9e-4c1d-8b0a-9d8e7f6c5b4a",
    "isApproved": true,
    "reply": "Syed Azharuddin has over 12 years of hands-on experience specializing in highly scalable cloud architectures..."
  }
  ```
* **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "The AI agent failed to parse context instructions."
  }
  ```

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
  --set-env-vars="GEMINI_API_KEY=your_gemini_key,SUPABASE_URL=your_supabase_url,SUPABASE_ANON_KEY=your_supabase_key"
```
