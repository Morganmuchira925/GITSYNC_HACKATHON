// ============================================
// AUTH ROUTES
// POST /api/auth/register
// POST /api/auth/login
// POST /api/auth/refresh
// ============================================

import express from "express";
import Joi from "joi";
import { createHmac, randomBytes } from "crypto";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
  phone: Joi.string().pattern(/^\+?[0-9]{9,15}$/).required(),
  pin: Joi.string().length(4).pattern(/^\d+$/).required(),
  businessName: Joi.string().max(100).optional(),
  language: Joi.string().valid("en", "sw").default("en"),
});

// Simple JWT-like token (use a proper JWT library in production, e.g. jose)
function createToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, iat: Date.now() })).toString("base64");
  const sig = createHmac("sha256", process.env.JWT_SECRET || "dev-secret")
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

/**
 * POST /api/auth/register
 */
router.post("/register", async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) throw error;

  // In production: check phone not already registered in Convex
  // const exists = await runQuery(api.users.findByPhone, { phone: value.phone });
  // if (exists) throw new AppError("Phone already registered.", 409);

  const userId = `user_${randomBytes(8).toString("hex")}`;
  const pinHash = createHmac("sha256", process.env.JWT_SECRET || "dev")
    .update(value.pin)
    .digest("hex");

  // await runMutation(api.users.create, { ...value, pinHash, userId });

  logger.info(`[Auth] New user registered: ${userId} (${value.phone})`);

  const token = createToken(userId);

  res.status(201).json({
    success: true,
    userId,
    name: value.name,
    token,
    message: "Account created! Welcome to Fedha.",
  });
});

/**
 * POST /api/auth/login
 * Body: { phone, pin }
 */
router.post("/login", async (req, res) => {
  const { phone, pin } = req.body;
  if (!phone || !pin) throw new AppError("Phone and PIN are required.", 400);

  // const user = await runQuery(api.users.findByPhone, { phone });
  // if (!user) throw new AppError("Phone not registered.", 404);
  // const pinHash = createHmac("sha256", process.env.JWT_SECRET || "dev").update(pin).digest("hex");
  // if (pinHash !== user.pinHash) throw new AppError("Incorrect PIN.", 401);

  const mockUserId = `user_${createHmac("sha256", "seed").update(phone).digest("hex").slice(0, 8)}`;
  const token = createToken(mockUserId);

  logger.info(`[Auth] Login: ${phone}`);

  res.json({
    success: true,
    userId: mockUserId,
    token,
    message: "Welcome back!",
  });
});

export default router;
