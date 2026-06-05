// ============================================
// CONVEX SCHEMA — Fedha Database
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

    // Optional enrichment
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    vendor: v.optional(v.string()),
    receiptNumber: v.optional(v.string()),
    notes: v.optional(v.string()),

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
    .index("by_userId_type", ["userId", "type"])
    .index("by_userId_category", ["userId", "category"])
    .index("by_userId_createdAt", ["userId", "createdAt"]),

  // ── Daily Summaries (cached aggregates) ──────
  // Pre-computed daily summaries for fast dashboard queries
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
    .index("by_userId_date", ["userId", "date"]),

  // ── AI Insights Cache ─────────────────────────
  // Cache Gemini insights to avoid repeated API calls
  insightsCache: defineTable({
    userId: v.string(),
    period: v.string(),                     // "7d" | "30d" | "90d"
    insights: v.any(),                      // Parsed Gemini JSON
    computedAt: v.number(),
    expiresAt: v.number(),                  // Cache TTL
  })
    .index("by_userId_period", ["userId", "period"]),
});
