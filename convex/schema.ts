// ============================================
// CONVEX SCHEMA — Fedha Database (Optimized)
// Deploy with: npx convex deploy
// ============================================

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ── Users ────────────────────────────────────
  users: defineTable({
    userId: v.string(),
    name: v.string(),
    phone: v.string(),
    pinHash: v.string(),
    businessName: v.optional(v.string()),
    language: v.string(),                   // "en" | "sw"
    currency: v.string(),                   // default "KES"
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_phone", ["phone"]),

  // ── Transactions ─────────────────────────────
  transactions: defineTable({
    userId: v.string(),
    type: v.union(v.literal("income"), v.literal("expense")),
    amount: v.number(),
    currency: v.string(),
    description: v.string(),
    category: v.string(),

    // OPTIMIZATION (CRITICAL BUG FIX): Wrapped with v.union(..., v.null())
    // This stops the ArgumentValidationError crash when the AI parses missing fields as null.
    quantity: v.optional(v.union(v.number(), v.null())),
    unit: v.optional(v.union(v.string(), v.null())),
    vendor: v.optional(v.union(v.string(), v.null())),
    receiptNumber: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),

    // Metadata
    source: v.union(
      v.literal("voice"),
      v.literal("receipt_scan"),
      v.literal("manual")
    ),
    rawTranscript: v.optional(v.string()),  // Original voice input
    confidence: v.optional(v.number()),     // AI confidence score 0-1
    imageUrl: v.optional(v.string()),       // Receipt image URL

    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    // OPTIMIZATION: Compound index sorted by date for fast, prioritized dashboard lookups
    .index("by_userId_type_createdAt", ["userId", "type", "createdAt"])
    .index("by_userId_category_createdAt", ["userId", "category", "createdAt"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  // ── Daily Summaries (cached aggregates) ──────
  dailySummaries: defineTable({
    userId: v.string(),
    date: v.string(),                       // "YYYY-MM-DD"
    totalIncome: v.number(),
    totalExpenses: v.number(),
    netProfit: v.number(),
    transactionCount: v.number(),
    topCategory: v.optional(v.string()),
    computedAt: v.number(),
  })
    // OPTIMIZATION: Sorted date filtering index for blazing fast date-range metric lookups
    .index("by_userId_date", ["userId", "date"]),

  // ── AI Insights Cache ─────────────────────────
  insightsCache: defineTable({
    userId: v.string(),
    period: v.string(),                     // "7d" | "30d" | "90d"
    insights: v.any(),                      // Parsed Gemini JSON
    computedAt: v.number(),
    expiresAt: v.number(),                  // Cache TTL
  })
    .index("by_userId_period", ["userId", "period"])
    // OPTIMIZATION: Helps clean up stale cache entries seamlessly via background crons
    .index("by_expiresAt", ["expiresAt"]),
});