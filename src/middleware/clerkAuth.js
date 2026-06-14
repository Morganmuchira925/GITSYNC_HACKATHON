// ============================================
// CLERK AUTH MIDDLEWARE
// Verifies Clerk JWT and attaches userId to req
// ============================================

import { verifyToken } from "@clerk/express";
import { AppError } from "./errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * requireClerkAuth
 * Verifies the Bearer token from Clerk, attaches req.userId (the Clerk user ID)
 * Use on any route that needs an authenticated user.
 */
export async function requireClerkAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // FIX: Return a clean 401 response immediately
      return res.status(401).json({ error: "Missing or malformed Authorization header." });
    }

    const token = authHeader.split(" ")[1];

    // Verify the JWT with Clerk using your secret key
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (!payload || !payload.sub) {
      // FIX: Return a clean 401 response immediately
      return res.status(401).json({ error: "Invalid or expired token." });
    }

    // payload.sub is the Clerk user ID, e.g. "user_2abc123..."
    req.userId = payload.sub;
    next();
  } catch (err) {
    logger.error(`[ClerkAuth] Token verification failed: ${err.message}`);
    
    // FIX: Block the request here so it NEVER drops down to dashboard.js with an undefined userId
    return res.status(401).json({ 
      error: "Authentication failed. Please log in again.",
      reason: err.message 
    });
  }
}