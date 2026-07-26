# Infiplus AI WhatsApp Calling Agent

Production-ready, modular, and scalable **WhatsApp AI Voice Calling Agent** using the **Official WhatsApp Business Calling API**.

Designed for deployment on **Ubuntu 24.04 VPS** with Node.js 22 LTS, PM2, Nginx reverse proxy, and Let's Encrypt SSL.

---

## 🚀 Domain & Infrastructure

- **Domain**: `https://aiwh.infiplus.in`
- **Target OS**: Ubuntu 24.04 LTS
- **Runtime**: Node.js 22 LTS
- **Process Manager**: PM2
- **Reverse Proxy**: Nginx
- **SSL**: Let's Encrypt Certbot

---

## 🛠 Tech Stack & Architecture

- **Core Framework**: Express.js (Node.js 22 LTS)
- **Language**: TypeScript 5 (Strict typing, zero `any`)
- **Protocol**: Official WhatsApp Business Calling API & WebRTC (SDP offer/answer exchange)
- **Logging**: Winston Logger with daily rotate file transport (`logs/combined-*.log`, `logs/error-*.log`)
- **Validation**: Zod schema validation for environment configuration
- **Future AI Pipeline (Phase 2)**:
  - **STT**: Sarvam AI (Streaming Speech-to-Text)
  - **LLM Agent**: Gemini 2.5 Flash API (Hospital AI Receptionist)
  - **Database**: Supabase
  - **TTS**: Sarvam AI (Text-to-Speech)

---

## 📂 Project Architecture

```
/Volumes/CrucialX9/infispark_project/whatappcalling/
├── .env                       # Local environment file
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore file
├── Dockerfile                 # Docker containerization file
├── docker-compose.yml         # Docker compose service definition
├── ecosystem.config.js        # PM2 cluster configuration
├── package.json               # Node.js dependencies and scripts
├── tsconfig.json              # Strict TypeScript compiler options
├── README.md                  # Comprehensive documentation
└── src/
    ├── server.ts              # HTTP Server entry point & graceful shutdown
    ├── app.ts                 # Express application configuration
    ├── config/
    │   └── env.config.ts      # Zod-validated environment config loader
    ├── utils/
    │   └── logger.ts          # Winston daily-rotate logger
    ├── types/
    │   └── whatsapp.types.ts  # Webhook payload & SDP TypeScript definitions
    ├── webrtc/
    │   └── sdpParser.ts       # WebRTC Session Description Protocol (SDP) parser
    ├── whatsapp/
    │   ├── webhookParser.ts   # WhatsApp webhook call payload extractor
    │   ├── callSessionManager.ts # In-memory active call state manager
    │   └── whatsappClient.ts  # WhatsApp Graph API HTTP signaling client
    ├── services/
    │   └── callAcceptanceService.ts # Core call offer ingestion & acceptance service
    ├── api/
    │   ├── middleware/
    │   │   ├── verifyWebhook.middleware.ts # GET verify_token & POST HMAC signature verification
    │   │   ├── requestLogger.middleware.ts # HTTP access log middleware
    │   │   └── error.middleware.ts        # Global error handling middleware
    │   ├── controllers/
    │   │   ├── whatsapp.controller.ts     # Webhook verification & call event controller
    │   │   └── health.controller.ts       # Service health diagnostic controller
    │   └── routes/
    │       ├── whatsapp.routes.ts         # /api/v1/whatsapp route declarations
    │       ├── health.routes.ts           # /api/v1/health route declarations
    │       └── index.ts                   # Router aggregator
    ├── sarvam/
    │   ├── sttService.ts      # (Phase 2) Sarvam STT streaming integration
    │   └── ttsService.ts      # (Phase 2) Sarvam TTS voice synthesis integration
    ├── gemini/
    │   └── receptionistAgent.ts # (Phase 2) Gemini 2.5 Flash Hospital Receptionist
    ├── supabase/
    │   └── dbClient.ts        # (Phase 2) Supabase database client
    └── audio/
        └── audioProcessor.ts  # (Phase 2) PCM / Opus audio stream processor
```

---

## ⚡ Quick Start & Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env` and fill in your WhatsApp Business Calling API credentials:
```bash
cp .env.example .env
```

### 3. Run in Development Mode
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
```

---

## 🧪 Testing Phase 1 Implementation

### 1. Health Diagnostic Check
```bash
curl http://localhost:3000/api/v1/health
```

### 2. WhatsApp Webhook GET Verification
Simulate Meta developer platform verification request:
```bash
curl "http://localhost:3000/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=infiplus_wh_verify_token_secure_2026&hub.challenge=CHALLENGE_12345"
```
*Expected output*: `CHALLENGE_12345` with HTTP 200 OK.

### 3. Simulate Incoming WhatsApp Call Event POST
Simulate incoming voice call with SDP offer:
```bash
curl -X POST http://localhost:3000/api/v1/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [
      {
        "id": "100000000000002",
        "changes": [
          {
            "field": "calls",
            "value": {
              "messaging_product": "whatsapp",
              "metadata": {
                "display_phone_number": "+919876543210",
                "phone_number_id": "100000000000001"
              },
              "calls": [
                {
                  "id": "call_test_998877",
                  "from": "+919876543210",
                  "to": "+911122334455",
                  "event": "offer",
                  "timestamp": "1774533000",
                  "session": {
                    "sdp": "v=0\r\no=- 1774533000 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9000 RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=sendrecv\r\n"
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  }'
```

### 4. Inspect Active Call Sessions
```bash
curl http://localhost:3000/api/v1/whatsapp/sessions
```

---

## 🌐 Ubuntu 24.04 Production Deployment Guide

### Step 1: Nginx Configuration
Create file `/etc/nginx/sites-available/aiwh.infiplus.in`:
```nginx
server {
    server_name aiwh.infiplus.in;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/aiwh.infiplus.in /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 2: SSL Certificate (Let's Encrypt)
```bash
sudo certbot --nginx -d aiwh.infiplus.in
```

### Step 3: Run with PM2 Process Manager
```bash
npm run build
npm run pm2:start
pm2 save
```

---

## 📌 Meta Webhook Configuration

In Meta App Dashboard under **WhatsApp -> Configuration**:
- **Callback URL**: `https://aiwh.infiplus.in/api/v1/whatsapp/webhook`
- **Verify Token**: `infiplus_wh_verify_token_secure_2026`
- **Subscribe Fields**: `calls`, `messages`

---

## 🔒 Security & Code Standards

- Strictly enforced TypeScript compilation (zero `any`).
- HMAC SHA256 signature verification (`X-Hub-Signature-256`).
- Helmet HTTP security headers.
- Async / await throughout with centralized error handling.
