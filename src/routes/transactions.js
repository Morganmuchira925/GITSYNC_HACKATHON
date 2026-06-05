// ============================================
// TRANSACTION ROUTES
// GET    /api/transactions           — list with filters
// POST   /api/transactions           — create manually
// GET    /api/transactions/:id       — single transaction
// PUT    /api/transactions/:id       — update
// DELETE /api/transactions/:id       — delete
// ============================================

import express from "express";
import Joi from "joi";
import { runMutation, runQuery } from "../utils/convexClient.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

// Validation schema
const transactionSchema = Joi.object({
  userId: Joi.string().required(),
  type: Joi.string().valid("income", "expense").required(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().default("KES"),
  description: Joi.string().min(1).max(200).required(),
  category: Joi.string().default("other"),
  quantity: Joi.number().positive().allow(null),
  unit: Joi.string().max(20).allow(null),
  vendor: Joi.string().max(100).allow(null),
  notes: Joi.string().max(500).allow(null),
  date: Joi.number().default(Date.now), // Unix timestamp in ms
});

/**
 * GET /api/transactions?userId=&type=&category=&from=&to=&limit=&cursor=
 */
router.get("/", async (req, res) => {
  const { userId, type, category, from, to, limit = 50, cursor } = req.query;
  if (!userId) throw new AppError("userId query param is required.", 400);

  // NOTE: Replace with actual Convex query when live
  // const transactions = await runQuery(api.transactions.list, {
  //   userId, type, category,
  //   from: from ? parseInt(from) : undefined,
  //   to: to ? parseInt(to) : undefined,
  //   limit: parseInt(limit),
  //   cursor,
  // });

  // Mock data for development
  const mockTransactions = generateMockTransactions(userId, 20);

  res.json({
    success: true,
    transactions: mockTransactions,
    count: mockTransactions.length,
    cursor: null,
  });
});

/**
 * POST /api/transactions — manual entry
 */
router.post("/", async (req, res) => {
  const { error, value } = transactionSchema.validate(req.body);
  if (error) throw error;

  const transaction = {
    ...value,
    source: "manual",
    createdAt: Date.now(),
  };

  // const savedId = await runMutation(api.transactions.create, transaction);
  const savedId = `txn_manual_${Date.now()}`;

  logger.info(`[Transaction] Manual entry: ${savedId} — ${value.type} KES ${value.amount}`);

  res.status(201).json({
    success: true,
    transactionId: savedId,
    transaction: { ...transaction, _id: savedId },
  });
});

/**
 * GET /api/transactions/:id
 */
router.get("/:id", async (req, res) => {
  // const transaction = await runQuery(api.transactions.get, { id: req.params.id });
  // if (!transaction) throw new AppError("Transaction not found.", 404);

  res.json({ success: true, transaction: { _id: req.params.id, mock: true } });
});

/**
 * PUT /api/transactions/:id
 */
router.put("/:id", async (req, res) => {
  const { error, value } = transactionSchema.fork(
    ["userId", "type", "amount", "description"],
    (s) => s.optional()
  ).validate(req.body);
  if (error) throw error;

  // await runMutation(api.transactions.update, { id: req.params.id, ...value });
  logger.info(`[Transaction] Updated: ${req.params.id}`);

  res.json({ success: true, transactionId: req.params.id, updated: value });
});

/**
 * DELETE /api/transactions/:id
 */
router.delete("/:id", async (req, res) => {
  // await runMutation(api.transactions.remove, { id: req.params.id });
  logger.info(`[Transaction] Deleted: ${req.params.id}`);

  res.json({ success: true, deleted: req.params.id });
});

// ── Mock data generator (remove when Convex is live) ─────
function generateMockTransactions(userId, count) {
  const categories = ["produce", "livestock", "groceries", "transport", "services", "other"];
  const descriptions = {
    income: ["Tomatoes", "Onions", "Potatoes", "Maize", "Fish", "Sukuma wiki", "Beans"],
    expense: ["Transport fare", "Market fee", "Bags", "Electricity", "Water bill", "Stock"],
  };

  return Array.from({ length: count }, (_, i) => {
    const type = Math.random() > 0.4 ? "income" : "expense";
    const descs = descriptions[type];
    return {
      _id: `txn_mock_${i}`,
      userId,
      type,
      amount: Math.floor(Math.random() * 2000) + 50,
      currency: "KES",
      description: descs[Math.floor(Math.random() * descs.length)],
      category: categories[Math.floor(Math.random() * categories.length)],
      source: ["voice", "manual", "receipt_scan"][Math.floor(Math.random() * 3)],
      createdAt: Date.now() - Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000),
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
}

export default router;
