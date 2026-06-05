# 🟢 TradePulse

### FinTech Financial Inclusion for Informal Sector Traders

**TradePulse** is an AI-powered financial management platform that helps informal traders and small businesses digitize their financial records effortlessly. By leveraging voice recognition, receipt scanning, barcode detection, and AI-powered insights, TradePulse eliminates the need for manual bookkeeping and enables smarter business decisions.

---

## 🚨 Problem Statement

Many informal traders rely on memory, notebooks, or paper receipts to track business transactions. This often leads to:

- Lost financial records
- Poor cash-flow visibility
- Inaccurate profit calculations
- Limited access to financial insights

---

## 💡 Solution

TradePulse enables traders to capture transactions naturally through:

- 🎙️ Voice commands
- 📸 Receipt scanning
- 📦 Barcode scanning

The platform automatically converts these activities into structured financial records and generates real-time business insights.

---

## ✨ Key Features

### 🎙️ Voice-to-Ledger
Record transactions by speaking naturally.

**Example:**

> "Sold 3kg of tomatoes for 150 shillings."

Automatically converted to:

```json
{
  "type": "income",
  "amount": 150,
  "description": "3kg tomatoes"
}
```

---

### 📸 Receipt OCR Scanning

Capture expenses by simply taking a photo of a receipt.

**Process:**

```text
Receipt Photo
      ↓
Gemini Vision OCR
      ↓
Extracted Data
      ↓
Expense Record
```

---

### 📦 Barcode Scanning

Scan product barcodes to quickly identify products and record transactions without manual entry.

---

### 📊 Financial Dashboard

View:

- Total Income
- Total Expenses
- Net Profit
- Cash Flow Trends
- Category Breakdown

---

### 🤖 AI-Powered Insights

Generate intelligent business recommendations such as:

- Spending trends
- Top expense categories
- Profitability analysis
- Growth opportunities

---

## 📐 System Architecture

```text
┌──────────────────────────────────────────────────────┐
│                  TRADEPULSE PLATFORM                 │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Mobile App / Web App                               │
│            │                                         │
│            ▼                                         │
│      Express.js REST API                             │
│            │                                         │
│    ┌───────┼────────┐                               │
│    ▼       ▼        ▼                               │
│ Gemini  ElevenLabs  Convex Database                  │
│   AI      STT/TTS                                    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

| Layer | Technology |
|---------|------------|
| Backend | Node.js + Express.js |
| Database | Convex |
| AI Engine | Google Gemini 1.5 Flash |
| Voice Recognition | ElevenLabs Scribe |
| Text-to-Speech | ElevenLabs Multilingual |
| File Uploads | Multer |
| Validation | Joi |
| Logging | Winston |
| Security | Helmet, CORS, Rate Limiting |

---

## 🔄 AI Processing Pipelines

### Voice Transaction Flow

```text
User Speaks
      ↓
ElevenLabs Speech-to-Text
      ↓
Gemini Transaction Parser
      ↓
Convex Database
      ↓
Dashboard Updates
```

---

### Receipt Processing Flow

```text
Receipt Photo
      ↓
Gemini Vision OCR
      ↓
Transaction Extraction
      ↓
User Confirmation
      ↓
Database Storage
```

---

## 📊 Core Modules

- User Management
- Voice Transaction Logging
- Receipt Scanning
- Barcode Recognition
- Financial Dashboard
- AI Insights Engine
- Reporting & Analytics

---

## 🌍 Language Support

TradePulse supports:

- English
- Swahili

Examples:

> "Niliuza nyanya kwa shilingi 200"

↓

```json
{
  "type": "income",
  "amount": 200,
  "description": "Tomatoes"
}
```

---

## 🎯 Expected Impact

TradePulse aims to:

- Improve financial inclusion
- Reduce manual bookkeeping
- Increase financial literacy
- Help traders make informed decisions
- Enable digital record keeping for small businesses

---

## 🚀 Vision

> Empower every trader with simple, intelligent, and accessible financial management tools.

### TradePulse — The Heartbeat of Your Business.
