// ============================================
// Convex Client — Server-side Usage
// Used to call Convex mutations/queries from Express
// ============================================

import { ConvexHttpClient } from "convex/browser";
import dotenv from "dotenv";
import { logger } from "../utils/logger.js";

dotenv.config();

if (!process.env.CONVEX_URL) {
  logger.warn("⚠️  CONVEX_URL not set. Convex features will be unavailable.");
}

export const convex = new ConvexHttpClient(
  process.env.CONVEX_URL || "https://placeholder.convex.cloud"
);

/**
 * Wraps a Convex mutation with error handling
 */
export async function runMutation(mutation, args) {
  try {
    return await convex.mutation(mutation, args);
  } catch (err) {
    logger.error(`Convex mutation failed: ${err.message}`);
    throw err;
  }
}

/**
 * Wraps a Convex query with error handling
 */
export async function runQuery(query, args) {
  try {
    return await convex.query(query, args);
  } catch (err) {
    logger.error(`Convex query failed: ${err.message}`);
    throw err;
  }
}
