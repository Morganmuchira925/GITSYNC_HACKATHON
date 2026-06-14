// ============================================
// TRANSACTION ROUTES
// GET    /api/transactions           — list with filters
// POST   /api/transactions           — create manually
// GET    /api/transactions/:id       — single transaction
// PUT    /api/transactions/:id       — update
// DELETE /api/transactions/:id       — delete
// GET    /api/transactions/aggregate — dashboard aggregates
// All routes require a valid Clerk JWT via requireClerkAuth.
// ============================================

import express from "express";
import Joi from "joi";
import { runMutation, runQuery } from "../utils/convexClient.js";
import { api } from "../../convex/_generated/api.js";
import { requireClerkAuth } from "../middleware/clerkAuth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

// Apply Clerk auth to every transaction route
router.use(requireClerkAuth);

// ── Validation ────────────────────────────────────────────────
const createSchema = Joi.object({
  type: Joi.string().valid("income", "expense").required(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().default("KES"),
  description: Joi.string().min(1).max(200).required(),
  category: Joi.string().default("other"),
  quantity: Joi.number().positive().allow(null).optional(),
  unit: Joi.string().max(20).allow(null).optional(),
  vendor: Joi.string().max(100).allow(null).optional(),
  notes: Joi.string().max(500).allow(null).optional(),
});

// ── GET /api/transactions ─────────────────────────────────────
// userId comes from the verified Clerk token — never from the client
router.get("/", async (req, res) => {
  const { userId } = req; // injected by requireClerkAuth
  const { type, category, from, to, limit = 50 } = req.query;

  const transactions = await runQuery(api.transactions.list, {
    userId,
    type: type || undefined,
    category: category || undefined,
    from: from ? parseInt(from) : undefined,
    to: to ? parseInt(to) : undefined,
    limit: parseInt(limit),
  });

  res.json({
    success: true,
    transactions,
    count: transactions.length,
  });
});

// ── GET /api/transactions/aggregate ──────────────────────────
// Must be defined BEFORE /:id to avoid route collision
router.get("/aggregate", async (req, res) => {
  const { userId } = req;
  const { from, to } = req.query;

  if (!from) throw new AppError("'from' timestamp is required.", 400);

  const aggregates = await runQuery(api.transactions.getAggregates, {
    userId,
    from: parseInt(from),
    to: to ? parseInt(to) : undefined,
  });

  res.json({ success: true, ...aggregates });
});

// ── POST /api/transactions ────────────────────────────────────
router.post("/", async (req, res) => {
  const { error, value } = createSchema.validate(req.body);
  if (error) throw error;

  const { userId } = req; // from verified token — not from body

  const transaction = {
    userId,
    ...value,
    source: "manual",
    createdAt: Date.now(),
  };

  const savedId = await runMutation(api.transactions.create, transaction);
  logger.info(`[Transaction] Manual: ${savedId} — ${value.type} KES ${value.amount} (user: ${userId})`);

  res.status(201).json({
    success: true,
    transactionId: savedId,
    transaction: { ...transaction, _id: savedId },
  });
});

// ── GET /api/transactions/:id ─────────────────────────────────
router.get("/:id", async (req, res) => {
  const transaction = await runQuery(api.transactions.get, {
    id: req.params.id,
  });

  if (!transaction) throw new AppError("Transaction not found.", 404);

  // Security: users can only read their own transactions
  if (transaction.userId !== req.userId) {
    throw new AppError("Forbidden.", 403);
  }

  res.json({ success: true, transaction });
});

// ── PUT /api/transactions/:id ─────────────────────────────────
router.put("/:id", async (req, res) => {
  // First verify ownership
  const existing = await runQuery(api.transactions.get, { id: req.params.id });
  if (!existing) throw new AppError("Transaction not found.", 404);
  if (existing.userId !== req.userId) throw new AppError("Forbidden.", 403);

  const updateSchema = Joi.object({
    amount: Joi.number().positive().optional(),
    description: Joi.string().min(1).max(200).optional(),
    category: Joi.string().optional(),
    notes: Joi.string().max(500).allow(null).optional(),
  });

  const { error, value } = updateSchema.validate(req.body);
  if (error) throw error;

  await runMutation(api.transactions.update, { id: req.params.id, ...value });
  logger.info(`[Transaction] Updated: ${req.params.id} (user: ${req.userId})`);

  res.json({ success: true, transactionId: req.params.id, updated: value });
});

// ── DELETE /api/transactions/:id ──────────────────────────────
router.delete("/:id", async (req, res) => {
  const existing = await runQuery(api.transactions.get, { id: req.params.id });
  if (!existing) throw new AppError("Transaction not found.", 404);
  if (existing.userId !== req.userId) throw new AppError("Forbidden.", 403);

  await runMutation(api.transactions.remove, { id: req.params.id });
  logger.info(`[Transaction] Deleted: ${req.params.id} (user: ${req.userId})`);

  res.json({ success: true, deleted: req.params.id });
});

export default router;