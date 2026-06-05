# 🟢 Fedha Backend
### FinTech Financial Inclusion for Informal Sector Traders

> **Fedha** (Swahili for "money/finance") — A backend system that empowers small-scale traders
> in Kenya to track income and expenses using voice, photos, and a visual dashboard.

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FEDHA BACKEND                            │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Express.js  │    │  Gemini API  │    │  ElevenLabs  │  │
│  │  REST API    │───▶│  (AI Core)   │    │  (Voice STT) │  │
│  │  Port 3000   │    │              │    │              │  │
│  └──────┬───────┘    └──────────────┘    └──────────────┘  │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   CONVEX DATABASE                    │  │
│  │  • transactions  • users  • dailySummaries           │  │
│  │  • insightsCache                                     │  │
│  │  Real-time sync • Auto-indexed • TypeSafe            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

| Feature | Route | AI Model |
|---|---|---|
| 🎙️ Voice-to-Ledger | `POST /api/voice/log` | ElevenLabs STT + Gemini |
| 📸 Receipt OCR Scan | `POST /api/receipts/scan` | Gemini Vision |
| 📊 Financial Dashboard | `GET /api/dashboard/summary` | Gemini Insights |
| 💬 Audio Confirmation | `POST /api/voice/confirm-tts` | ElevenLabs TTS |
| 📈 Chart Data | `GET /api/dashboard/chart` | Aggregated |
| 🗂️ Category Breakdown | `GET /api/dashboard/categories` | Aggregated |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 18+ (ES Modules) |
| **Framework** | Express.js 4 |
| **Database** | Convex (real-time, serverless) |
| **AI / Vision** | Google Gemini 1.5 Flash |
| **Voice STT** | ElevenLabs Scribe v1 |
| **Voice TTS** | ElevenLabs Multilingual v2 |
| **File Uploads** | Multer |
| **Validation** | Joi |
| **Logging** | Winston |
| **Security** | Helmet, CORS, Rate Limiting |

---

## 🚀 Setup

### 1. Prerequisites
- Node.js v18+
- A [Convex](https://dashboard.convex.dev) account (free)
- A [Google AI Studio](https://aistudio.google.com) API key
- An [ElevenLabs](https://elevenlabs.io) API key

### 2. Install Dependencies
```bash
cd fedha-backend
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env and fill in your API keys
```

### 4. Set up Convex
```bash
npx convex dev
# Follow the prompts to create a project
# Copy the CONVEX_URL into your .env
```

### 5. Deploy Convex Schema
```bash
npx convex deploy
```

### 6. Start the Server
```bash
npm run dev          # Development (nodemon)
npm start            # Production
```

---

## 📡 API Reference

### Authentication
```
POST /api/auth/register   { name, phone, pin, businessName }
POST /api/auth/login      { phone, pin }
```

### Voice-to-Ledger
```
POST /api/voice/transcribe    multipart: audio file
POST /api/voice/log           multipart: audio + userId + language
POST /api/voice/confirm-tts   JSON: { transaction }  → returns mp3
```

**Voice Pipeline:**
```
Audio File
    ↓ ElevenLabs Scribe
Transcript: "Sold 3kg tomatoes for 150 bob"
    ↓ Gemini 1.5 Flash
{ type: "income", amount: 150, description: "3kg tomatoes", category: "produce" }
    ↓ Convex
Saved Transaction
    ↓ ElevenLabs TTS
"Transaction logged. You recorded income of 150 shillings..."
```

### Receipt Scanning
```
POST /api/receipts/scan       multipart: receipt image
POST /api/receipts/confirm    JSON: { userId, parsed, saveAsLineItems }
```

**Receipt Pipeline:**
```
Photo (jpg/png/webp)
    ↓ Gemini Vision
{ vendor, date, lineItems, total, barcodes, confidence }
    ↓ User reviews
Confirmed → Convex (1 transaction or N line items)
```

### Dashboard
```
GET /api/dashboard/summary?userId=&period=30d
GET /api/dashboard/chart?userId=&period=30d&groupBy=day
GET /api/dashboard/categories?userId=&period=30d
GET /api/dashboard/insights?userId=&period=30d    ← Gemini AI analysis
```

### Transactions (Manual)
```
GET    /api/transactions?userId=&type=&category=
POST   /api/transactions
GET    /api/transactions/:id
PUT    /api/transactions/:id
DELETE /api/transactions/:id
```

---

## 🗄️ Convex Database Schema

```
users
  └─ userId, name, phone, pinHash, businessName, language

transactions
  └─ userId, type, amount, currency, description, category
  └─ quantity, unit, vendor, receiptNumber
  └─ source (voice | receipt_scan | manual)
  └─ rawTranscript, confidence, createdAt
  
  Indexes: by_userId, by_userId_type, by_userId_category, by_userId_createdAt

dailySummaries
  └─ userId, date (YYYY-MM-DD), totalIncome, totalExpenses, netProfit

insightsCache
  └─ userId, period, insights (JSON), computedAt, expiresAt
```

---

## 🔒 Security Features

- **Helmet** — HTTP security headers
- **Rate Limiting** — 100 req/15min globally; 20 req/min for uploads
- **CORS** — Whitelist-only origins
- **Input Validation** — Joi schemas on all write endpoints
- **File Filtering** — MIME type + extension validation
- **Auto Cleanup** — Uploaded files deleted after processing

---

## 📁 Project Structure

```
fedha-backend/
├── convex/
│   ├── schema.ts          ← Database schema (Convex)
│   └── transactions.ts    ← Convex mutations & queries
├── src/
│   ├── server.js          ← Express app entry point
│   ├── routes/
│   │   ├── auth.js        ← Register / Login
│   │   ├── transactions.js← CRUD transactions
│   │   ├── voice.js       ← Voice-to-Ledger pipeline
│   │   ├── receipts.js    ← Receipt scanning pipeline
│   │   └── dashboard.js   ← Analytics & AI insights
│   ├── services/
│   │   ├── geminiService.js      ← Gemini AI (parse, OCR, insights)
│   │   └── elevenlabsService.js  ← STT + TTS
│   ├── middleware/
│   │   ├── upload.js      ← Multer config
│   │   ├── errorHandler.js
│   │   └── notFound.js
│   └── utils/
│       ├── convexClient.js← Convex HTTP client wrapper
│       └── logger.js      ← Winston logger
├── .env.example
├── package.json
└── README.md
```

---

## 🌍 Swahili Language Support

Voice transactions support both English and Swahili:
- "Niliuza nyanya kwa shilingi 200" → income, 200 KES, tomatoes
- "Nililipa nauli shilingi 50" → expense, 50 KES, transport
- Slang: "bob", "pesa", "hela" all map to KES

---

## 📌 Next Steps / Roadmap

- [ ] Add M-Pesa transaction sync (Safaricom API)
- [ ] Weekly profit SMS reports (Africa's Talking)
- [ ] Offline PWA with IndexedDB sync
- [ ] Group/chama shared ledger
- [ ] Multi-currency (UGX, TZS)
- [ ] Barcode product lookup (Open Food Facts API)
