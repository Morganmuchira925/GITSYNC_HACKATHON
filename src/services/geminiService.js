// ============================================
// Gemini AI Service
// Powers: Voice STT, Voice parsing, Receipt OCR,
//         Barcode lookup, Financial insights
// ============================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";
import { AppError } from "../middleware/errorHandler.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// ── AUDIO MIME TYPE HELPER ──────────────────────────────
function getAudioMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".mp3": "audio/mp3",
    ".mpeg": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".webm": "audio/webm",
    ".mp4": "audio/mp4",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
  };
  return map[ext] || "audio/webm";
}

// ═══════════════════════════════════════════════════════
//  VOICE — Speech-to-Text  (replaces ElevenLabs STT)
// ═══════════════════════════════════════════════════════

/**
 * Transcribe an audio file using Gemini's native audio understanding.
 * Supports English and Swahili (and any language Gemini understands).
 *
 * @param {string} audioFilePath  - Local path to the audio file
 * @param {string} languageHint   - "en" | "sw" (used as prompt hint only)
 * @returns {Promise<{ transcript: string, confidence: number, wordCount: number }>}
 */
export async function transcribeAudio(audioFilePath, languageHint = "en") {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError("Voice service not configured. Please set GEMINI_API_KEY.", 503);
  }

  const mimeType = getAudioMimeType(audioFilePath);
  const audioBuffer = fs.readFileSync(audioFilePath);
  const base64Audio = audioBuffer.toString("base64");

  const model = genAI.getGenerativeModel({ model: MODEL });

  const languageInstruction =
    languageHint === "sw"
      ? "The speaker may use Swahili or mix Swahili and English (Sheng). Transcribe exactly."
      : "The speaker may use English or mix English and Swahili. Transcribe exactly.";

  const prompt = `
You are a transcription service for a financial app used by small traders in Kenya.
${languageInstruction}

Transcribe the audio precisely. Preserve numbers, units (kg, litre, dozen), 
currency terms ("shillings", "bob", "pesa", "shilingi"), and product names.

Respond ONLY with a JSON object — no markdown:
{
  "transcript": "<exact transcription>",
  "detectedLanguage": "en" | "sw" | "mixed",
  "confidence": <0.0-1.0>,
  "wordCount": <integer>
}
`;

  try {
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: base64Audio,
        },
      },
    ]);

    const raw = result.response.text().trim().replace(/```json|```/g, "");
    const parsed = JSON.parse(raw);

    logger.info(
      `[STT] Transcribed (${parsed.detectedLanguage}): "${parsed.transcript?.substring(0, 80)}..." ` +
      `confidence=${parsed.confidence}`
    );

    return {
      transcript: parsed.transcript?.trim() || "",
      confidence: parseFloat((parsed.confidence || 0.85).toFixed(3)),
      wordCount: parsed.wordCount || parsed.transcript?.split(" ").length || 0,
      detectedLanguage: parsed.detectedLanguage || languageHint,
    };
  } catch (err) {
    logger.error(`[STT] Gemini transcription failed: ${err.message}`);
    throw new AppError("Could not transcribe the audio. Please try again.", 422);
  }
}

// ═══════════════════════════════════════════════════════
//  VOICE — Transaction Parsing
// ═══════════════════════════════════════════════════════

/**
 * Parse a natural-language voice transcript into a structured transaction.
 *
 * Example: "Sold 2kg of tomatoes for 200 shillings"
 * Returns: { type:"income", amount:200, currency:"KES", description:"2kg tomatoes", ... }
 */
export async function parseVoiceTransaction(transcript, userLanguage = "en") {
  const model = genAI.getGenerativeModel({ model: MODEL });

  const prompt = `
You are a financial assistant for small-scale traders in Kenya. 
Parse this voice transaction into structured JSON.

Voice input: "${transcript}"
User language hint: ${userLanguage}

Rules:
- "sold", "got paid", "received", "earned", "niliuza", "nilipokea" → type: "income"
- "bought", "paid", "spent", "expense", "nilinunua", "nililipa" → type: "expense"
- Extract amount (handle Swahili: "shilingi", "bob", "pesa", "hela")
- Extract item name, quantity, unit if mentioned
- Category: produce | livestock | groceries | transport | rent | utilities | salary | loan | services | other
- Confidence 0.0–1.0 based on clarity
- If ambiguous, set needsClarification: true with a clarifying question in the user's language

Respond ONLY with valid JSON, no markdown:
{
  "type": "income" | "expense",
  "amount": number,
  "currency": "KES",
  "description": string,
  "category": string,
  "quantity": number | null,
  "unit": string | null,
  "rawTranscript": string,
  "confidence": number,
  "needsClarification": boolean,
  "clarificationQuestion": string | null
}
`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json|```/g, "");
    const parsed = JSON.parse(raw);
    logger.debug(`[Voice] Parsed: ${JSON.stringify(parsed)}`);
    return parsed;
  } catch (err) {
    logger.error(`[Voice] Gemini parse failed: ${err.message}`);
    throw new AppError("Could not understand the transaction. Please try again.", 422);
  }
}

// ═══════════════════════════════════════════════════════
//  RECEIPT — OCR + Barcode-aware Parsing
// ═══════════════════════════════════════════════════════

/**
 * Parse a receipt/invoice image with Gemini Vision.
 * Enhanced barcode handling: extracts all visible barcodes/QR codes and
 * attempts to map them to product names and prices where possible.
 *
 * @param {string} base64Image  - Base64-encoded image
 * @param {string} mimeType     - e.g. "image/jpeg"
 * @returns {Promise<ParsedReceipt>}
 */
export async function parseReceiptImage(base64Image, mimeType = "image/jpeg") {
  const model = genAI.getGenerativeModel({ model: MODEL });

  const prompt = `
You are an OCR + barcode-reading assistant for a financial app used by small traders in Kenya.

Carefully analyze this receipt, invoice, or product label image and extract ALL available data.

BARCODE / QR CODE INSTRUCTIONS (critical):
- Visually scan the entire image for barcodes (1D linear codes: EAN-13, EAN-8, Code-128, Code-39, 
  ITF, UPC-A, UPC-E) and 2D codes (QR codes, Data Matrix, PDF417).
- For each code found, record:
    • symbology: the barcode type (e.g. "EAN-13", "QR", "Code-128")
    • rawValue: the exact decoded string/number
    • associatedProduct: the product name on the label near this barcode (null if unclear)
    • associatedPrice: the price near this barcode (null if unclear)
    • region: where on the receipt ("top-left", "top-right", "bottom", "item-row", "standalone")
- If a barcode's digits match a known product format (EAN-13 starts with 614 = Kenya), note it.
- If NO barcodes are visible, return an empty barcodes array — do NOT fabricate codes.

RECEIPT EXTRACTION:
1. Vendor/shop name and address
2. Date and time of transaction
3. Cashier name or till/counter number (if visible)
4. ALL line items: description, quantity, unit, unit price, total price, and any barcode on that row
5. Subtotal, discounts, tax (VAT), and grand total
6. Payment method and amount tendered / change given
7. Receipt/invoice/order number
8. Any loyalty card numbers, promotion codes, or reference numbers

Respond ONLY with valid JSON, no markdown backticks:
{
  "vendor": string | null,
  "vendorAddress": string | null,
  "date": "YYYY-MM-DD" | null,
  "time": "HH:MM" | null,
  "receiptNumber": string | null,
  "cashier": string | null,
  "lineItems": [
    {
      "description": string,
      "quantity": number | null,
      "unit": string | null,
      "unitPrice": number | null,
      "totalPrice": number,
      "barcode": string | null
    }
  ],
  "subtotal": number | null,
  "discount": number | null,
  "tax": number | null,
  "taxRate": number | null,
  "total": number,
  "currency": "KES",
  "paymentMethod": string | null,
  "amountTendered": number | null,
  "change": number | null,
  "barcodes": [
    {
      "symbology": string,
      "rawValue": string,
      "associatedProduct": string | null,
      "associatedPrice": number | null,
      "region": string
    }
  ],
  "loyaltyCard": string | null,
  "promotionCodes": string[],
  "rawText": string,
  "confidence": number,
  "notes": string | null
}
`;

  try {
    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType, data: base64Image } },
    ]);

    const raw = result.response.text().trim().replace(/```json|```/g, "");
    const parsed = JSON.parse(raw);

    logger.info(
      `[Receipt] vendor="${parsed.vendor}", total=${parsed.total}, ` +
      `barcodes=${parsed.barcodes?.length || 0}, confidence=${parsed.confidence}`
    );

    return parsed;
  } catch (err) {
    logger.error(`[Receipt] Gemini parse failed: ${err.message}`);
    throw new AppError("Could not read the receipt. Please try a clearer photo.", 422);
  }
}

// ═══════════════════════════════════════════════════════
//  BARCODE — Product Lookup
// ═══════════════════════════════════════════════════════

/**
 * Given a barcode value, attempt to identify the product using Gemini's
 * knowledge (works well for common Kenyan retail products with EAN-13).
 * This is a best-effort lookup — for production, pair with Open Food Facts API.
 *
 * @param {string} barcodeValue - e.g. "6141234567890"
 * @param {string} symbology    - e.g. "EAN-13"
 * @returns {Promise<BarcodeProduct>}
 */
export async function lookupBarcode(barcodeValue, symbology = "EAN-13") {
  const model = genAI.getGenerativeModel({ model: MODEL });

  const prompt = `
You are a product database for a Kenyan retail financial app.

Barcode: ${barcodeValue} (${symbology})

Based on this barcode number, try to identify the product. 
Kenyan EAN-13 barcodes typically start with 614.
Common local brands: Brookside, Bidco, Unga, Ketepa, Tuzo, Delmonte, Softa.

If you can reasonably identify the product, provide details.
If unsure, set "identified" to false and leave product fields null.

Respond ONLY with JSON:
{
  "identified": boolean,
  "productName": string | null,
  "brand": string | null,
  "category": string | null,
  "unit": string | null,
  "typicalPriceKES": number | null,
  "countryOfOrigin": string | null,
  "notes": string | null
}
`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json|```/g, "");
    return JSON.parse(raw);
  } catch (err) {
    logger.error(`[Barcode] Lookup failed for ${barcodeValue}: ${err.message}`);
    return { identified: false, productName: null, notes: "Lookup failed" };
  }
}

// ═══════════════════════════════════════════════════════
//  DASHBOARD — AI Financial Insights
// ═══════════════════════════════════════════════════════

/**
 * Generate friendly, actionable financial insights for a trader.
 * Falls back gracefully if Gemini is unavailable.
 */
export async function generateFinancialInsights(transactions, periodDays = 30) {
  const model = genAI.getGenerativeModel({ model: MODEL });

  const summary = {
    totalIncome: transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
    totalExpenses: transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    transactionCount: transactions.length,
    categories: {},
  };

  transactions.forEach(t => {
    if (!summary.categories[t.category]) {
      summary.categories[t.category] = { income: 0, expense: 0, count: 0 };
    }
    summary.categories[t.category][t.type] += t.amount;
    summary.categories[t.category].count++;
  });

  const prompt = `
You are a friendly financial advisor for a small-scale trader in Kenya.
Analyze their ${periodDays}-day financial summary and give practical, encouraging advice in simple English.

Financial Summary (KES):
${JSON.stringify(summary, null, 2)}

Focus on:
1. Is the business profitable overall?
2. Which categories have the highest spending — is that reasonable?
3. One actionable tip to improve profit
4. One encouraging observation about their behavior

Respond ONLY with valid JSON:
{
  "profitMargin": number,
  "netProfit": number,
  "healthScore": number,
  "healthLabel": "Excellent" | "Good" | "Fair" | "Needs Attention",
  "summary": string,
  "insights": [
    { "type": "positive" | "warning" | "tip", "message": string }
  ],
  "topCategory": string,
  "recommendation": string
}
`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json|```/g, "");
    return JSON.parse(raw);
  } catch (err) {
    logger.error(`[Insights] Gemini failed: ${err.message}`);
    const net = summary.totalIncome - summary.totalExpenses;
    return {
      profitMargin: summary.totalIncome > 0 ? parseFloat(((net / summary.totalIncome) * 100).toFixed(1)) : 0,
      netProfit: net,
      healthScore: net > 0 ? 65 : 30,
      healthLabel: net > 0 ? "Fair" : "Needs Attention",
      summary: net > 0
        ? "Your business is making a profit. Keep tracking your expenses."
        : "Your expenses are higher than income. Review your spending.",
      insights: [{ type: "tip", message: "Keep logging every transaction to get better insights." }],
      topCategory: Object.keys(summary.categories)[0] || "other",
      recommendation: "Track daily income and expenses consistently.",
    };
  }
}

// ── TTS via Gemini (text confirmation message) ──────────
// NOTE: Gemini does not support TTS output natively as of 1.5.
// Use the confirmation message as on-screen text, or integrate a
// free TTS provider (e.g. Web Speech API on the frontend).
export function buildTransactionConfirmation(transaction) {
  const { type, amount, description, category } = transaction;
  const action = type === "income" ? "income" : "expense";
  return `Transaction saved! ${action === "income" ? "Income" : "Expense"} of KES ${amount} for ${description} (${category}) has been recorded.`;
}