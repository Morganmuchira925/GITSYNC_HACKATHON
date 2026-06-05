// ============================================
// VOICE ROUTES
// POST /api/voice/transcribe   — audio file → transcript (Gemini STT)
// POST /api/voice/log          — audio → transcript → parsed transaction → save
// POST /api/voice/confirm-tts  — transaction → confirmation text (TTS on frontend)
// ============================================

import express from "express";
import { uploadAudio, cleanupFile } from "../middleware/upload.js";
import {
  transcribeAudio,
  parseVoiceTransaction,
  buildTransactionConfirmation,
} from "../services/geminiService.js";
import { runMutation } from "../utils/convexClient.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

/**
 * POST /api/voice/transcribe
 * Audio file → transcript only (preview before saving)
 * multipart/form-data: { audio: File, language?: "en"|"sw" }
 */
router.post("/transcribe", (req, res, next) => {
  uploadAudio(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return next(new AppError("No audio file provided.", 400));

    const filePath = req.file.path;
    try {
      const language = req.body.language || "en";
      logger.info(`[Voice] Transcribing: ${req.file.originalname} (${req.file.size}B), lang=${language}`);

      const result = await transcribeAudio(filePath, language);

      res.json({
        success: true,
        transcript: result.transcript,
        confidence: result.confidence,
        wordCount: result.wordCount,
        detectedLanguage: result.detectedLanguage,
      });
    } finally {
      cleanupFile(filePath);
    }
  });
});

/**
 * POST /api/voice/log
 * Full pipeline: audio → Gemini STT → Gemini parse → Convex save
 * multipart/form-data: { audio: File, userId: string, language?: "en"|"sw" }
 */
router.post("/log", (req, res, next) => {
  uploadAudio(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return next(new AppError("No audio file provided.", 400));

    const filePath = req.file.path;
    try {
      const { userId, language = "en" } = req.body;
      if (!userId) throw new AppError("userId is required.", 400);

      // ── Step 1: Gemini Speech-to-Text ─────────────────
      logger.info(`[Voice] STT for user ${userId}, file=${req.file.originalname}`);
      const { transcript, confidence: sttConfidence, detectedLanguage } =
        await transcribeAudio(filePath, language);

      if (!transcript || transcript.trim().length < 3) {
        throw new AppError("Audio was too short or unclear. Please speak clearly and try again.", 422);
      }

      logger.info(`[Voice] Transcript: "${transcript}" (lang=${detectedLanguage})`);

      // ── Step 2: Gemini NLP Transaction Parse ───────────
      const parsed = await parseVoiceTransaction(transcript, detectedLanguage || language);

      // Ask user to clarify if Gemini is unsure
      if (parsed.needsClarification) {
        return res.status(200).json({
          success: true,
          status: "needs_clarification",
          transcript,
          detectedLanguage,
          parsed,
          clarificationQuestion: parsed.clarificationQuestion,
        });
      }

      // ── Step 3: Persist to Convex ──────────────────────
      const transaction = {
        userId,
        type: parsed.type,
        amount: parsed.amount,
        currency: parsed.currency || "KES",
        description: parsed.description,
        category: parsed.category,
        quantity: parsed.quantity || null,
        unit: parsed.unit || null,
        source: "voice",
        rawTranscript: transcript,
        confidence: Math.min(sttConfidence, parsed.confidence),
        createdAt: Date.now(),
      };

      // Uncomment when Convex is live:
      // const savedId = await runMutation(api.transactions.create, transaction);
      const savedId = `txn_voice_${Date.now()}`;

      logger.info(`[Voice] Saved: ${savedId} — ${parsed.type} KES ${parsed.amount}`);

      // ── Step 4: Build audio confirmation text ──────────
      const confirmationText = buildTransactionConfirmation(transaction);

      res.status(201).json({
        success: true,
        status: "saved",
        transactionId: savedId,
        transcript,
        detectedLanguage,
        transaction: { ...transaction, _id: savedId },
        // Frontend can feed confirmationText to Web Speech API (speechSynthesis)
        confirmationText,
      });
    } finally {
      cleanupFile(filePath);
    }
  });
});

/**
 * POST /api/voice/confirm-tts
 * Returns a confirmation message string for the frontend to speak via
 * the Web Speech API (window.speechSynthesis) — no external TTS API needed.
 *
 * Body JSON: { transaction: { type, amount, description, category } }
 * Response:  { success: true, message: string }
 */
router.post("/confirm-tts", async (req, res) => {
  const { transaction } = req.body;
  if (!transaction) throw new AppError("Transaction data required.", 400);

  const message = buildTransactionConfirmation(transaction);

  // Return text — the React/PWA frontend uses window.speechSynthesis to speak it
  res.json({
    success: true,
    message,
    // Hint for the frontend TTS call
    ttsConfig: {
      lang: transaction.language === "sw" ? "sw-KE" : "en-KE",
      rate: 0.95,
      pitch: 1.0,
    },
  });
});

export default router;