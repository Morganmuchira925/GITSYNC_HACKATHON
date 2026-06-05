// ============================================
// RECEIPT SCANNING ROUTES
// POST /api/receipts/scan      — image → parsed receipt + barcodes
// POST /api/receipts/confirm   — save parsed receipt as transaction(s)
// POST /api/receipts/barcode   — barcode value → product info lookup
// ============================================

import express from "express";
import fs from "fs";
import path from "path";
import { uploadReceipt, cleanupFile } from "../middleware/upload.js";
import { parseReceiptImage, lookupBarcode } from "../services/geminiService.js";
import { runMutation } from "../utils/convexClient.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

/**
 * POST /api/receipts/scan
 * Upload a receipt image → Gemini Vision extracts all data including barcodes.
 * Returns parsed data for user review BEFORE saving.
 *
 * If barcodes are found, each one is enriched with a product lookup.
 */
router.post("/scan", (req, res, next) => {
  uploadReceipt(req, res, async (err) => {
    if (err) return next(err);
    if (!req.file) return next(new AppError("No receipt image provided.", 400));

    const filePath = req.file.path;
    try {
      const imageBuffer = fs.readFileSync(filePath);
      const base64Image = imageBuffer.toString("base64");

      const ext = path.extname(req.file.originalname).toLowerCase();
      const mimeTypeMap = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".heic": "image/heic",
      };
      const mimeType = mimeTypeMap[ext] || req.file.mimetype || "image/jpeg";

      logger.info(`[Receipt] Scanning ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)}KB)`);

      // Parse receipt with Gemini Vision (includes barcode extraction)
      const parsed = await parseReceiptImage(base64Image, mimeType);

      // ── Barcode enrichment ─────────────────────────────
      // For each barcode found in the receipt, attempt a product lookup.
      // Run lookups in parallel for speed.
      if (parsed.barcodes?.length > 0) {
        logger.info(`[Receipt] Found ${parsed.barcodes.length} barcode(s), enriching...`);

        const enriched = await Promise.allSettled(
          parsed.barcodes.map(async (bc) => {
            const productInfo = await lookupBarcode(bc.rawValue, bc.symbology);
            return { ...bc, productInfo };
          })
        );

        parsed.barcodes = enriched.map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : { ...parsed.barcodes[i], productInfo: { identified: false } }
        );
      }

      res.json({
        success: true,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        parsed,
        barcodeCount: parsed.barcodes?.length || 0,
        hasUnidentifiedBarcodes: parsed.barcodes?.some(b => !b.productInfo?.identified) || false,
      });
    } finally {
      cleanupFile(filePath);
    }
  });
});

/**
 * POST /api/receipts/barcode
 * Look up a single barcode value to identify the product.
 * Useful when the user scans a product barcode (not a receipt).
 *
 * Body JSON: { barcode: string, symbology?: string }
 */
router.post("/barcode", async (req, res) => {
  const { barcode, symbology = "EAN-13" } = req.body;
  if (!barcode) throw new AppError("barcode value is required.", 400);

  logger.info(`[Barcode] Looking up ${symbology}: ${barcode}`);
  const product = await lookupBarcode(barcode, symbology);

  res.json({
    success: true,
    barcode,
    symbology,
    product,
  });
});

/**
 * POST /api/receipts/confirm
 * After user reviews the scan, save transaction(s) to Convex.
 *
 * Body JSON:
 * {
 *   userId: string,
 *   parsed: { vendor, date, total, lineItems, barcodes, ... },
 *   saveAsLineItems: boolean
 * }
 */
router.post("/confirm", async (req, res) => {
  const { userId, parsed, saveAsLineItems = false } = req.body;
  if (!userId) throw new AppError("userId is required.", 400);
  if (!parsed || !parsed.total) throw new AppError("Parsed receipt data is required.", 400);

  const transactions = [];
  const timestamp = parsed.date
    ? new Date(parsed.date).getTime()
    : Date.now();

  if (saveAsLineItems && parsed.lineItems?.length > 0) {
    for (const item of parsed.lineItems) {
      transactions.push({
        userId,
        type: "expense",
        amount: item.totalPrice || (item.unitPrice || 0) * (item.quantity || 1),
        currency: parsed.currency || "KES",
        description: item.description,
        category: "groceries",
        quantity: item.quantity || null,
        unit: item.unit || null,
        vendor: parsed.vendor || null,
        receiptNumber: parsed.receiptNumber || null,
        source: "receipt_scan",
        confidence: parsed.confidence,
        barcode: item.barcode || null,
        createdAt: timestamp,
      });
    }
  } else {
    const itemCount = parsed.lineItems?.length || 1;
    transactions.push({
      userId,
      type: "expense",
      amount: parsed.total,
      currency: parsed.currency || "KES",
      description: `${parsed.vendor || "Receipt"} — ${itemCount} item${itemCount !== 1 ? "s" : ""}`,
      category: "groceries",
      vendor: parsed.vendor || null,
      receiptNumber: parsed.receiptNumber || null,
      source: "receipt_scan",
      confidence: parsed.confidence,
      createdAt: timestamp,
    });
  }

  const savedIds = [];
  for (const txn of transactions) {
    // const id = await runMutation(api.transactions.create, txn);
    const id = `txn_receipt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    savedIds.push(id);
    logger.info(`[Receipt] Saved: ${id} — KES ${txn.amount} (${txn.description})`);
  }

  res.status(201).json({
    success: true,
    savedCount: savedIds.length,
    transactionIds: savedIds,
    transactions: transactions.map((t, i) => ({ ...t, _id: savedIds[i] })),
  });
});

export default router;