// ============================================
// CONVEX FUNCTIONS — Transactions
// These run server-side inside Convex
// ============================================

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ── CREATE ────────────────────────────────────
export const create = mutation({
  args: {
    userId: v.string(),
    type: v.union(v.literal("income"), v.literal("expense")),
    amount: v.number(),
    currency: v.string(),
    description: v.string(),
    category: v.string(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    vendor: v.optional(v.string()),
    receiptNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.union(
      v.literal("voice"),
      v.literal("receipt_scan"),
      v.literal("manual")
    ),
    rawTranscript: v.optional(v.string()),
    confidence: v.optional(v.number()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Insert the transaction
    const id = await ctx.db.insert("transactions", {
      ...args,
      updatedAt: Date.now(),
    });

    // Trigger daily summary update (async)
    await updateDailySummary(ctx, args.userId, new Date(args.createdAt));

    return id;
  },
});

// ── LIST (with filters) ───────────────────────
export const list = query({
  args: {
    userId: v.string(),
    type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
    category: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("transactions")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId));

    const results = await q.order("desc").collect();

    return results
      .filter(t => {
        if (args.type && t.type !== args.type) return false;
        if (args.category && t.category !== args.category) return false;
        if (args.from && t.createdAt < args.from) return false;
        if (args.to && t.createdAt > args.to) return false;
        return true;
      })
      .slice(0, args.limit || 100);
  },
});

// ── GET SINGLE ────────────────────────────────
export const get = query({
  args: { id: v.id("transactions") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

// ── UPDATE ────────────────────────────────────
export const update = mutation({
  args: {
    id: v.id("transactions"),
    amount: v.optional(v.number()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
    return id;
  },
});

// ── DELETE ────────────────────────────────────
export const remove = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
    return id;
  },
});

// ── AGGREGATE for dashboard ───────────────────
export const getAggregates = query({
  args: {
    userId: v.string(),
    from: v.number(),
    to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    const filtered = transactions.filter(t =>
      t.createdAt >= args.from && (!args.to || t.createdAt <= args.to)
    );

    const income = filtered.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expenses = filtered.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);

    const categories: Record<string, { income: number; expenses: number; count: number }> = {};
    filtered.forEach(t => {
      if (!categories[t.category]) categories[t.category] = { income: 0, expenses: 0, count: 0 };
      if (t.type === "income") categories[t.category].income += t.amount;
      else categories[t.category].expenses += t.amount;
      categories[t.category].count++;
    });

    return {
      totalIncome: income,
      totalExpenses: expenses,
      netProfit: income - expenses,
      transactionCount: filtered.length,
      categories,
    };
  },
});

// ── Helper: Update/create daily summary ──────
async function updateDailySummary(ctx: any, userId: string, date: Date) {
  const dateStr = date.toISOString().split("T")[0];
  const dayStart = new Date(dateStr).getTime();
  const dayEnd = dayStart + 86400000;

  const dayTxns = await ctx.db
    .query("transactions")
    .withIndex("by_userId_createdAt", (q: any) => q.eq("userId", userId))
    .filter((q: any) =>
      q.and(
        q.gte(q.field("createdAt"), dayStart),
        q.lt(q.field("createdAt"), dayEnd)
      )
    )
    .collect();

  const income = dayTxns.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + t.amount, 0);
  const expenses = dayTxns.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + t.amount, 0);

  const existing = await ctx.db
    .query("dailySummaries")
    .withIndex("by_userId_date", (q: any) => q.eq("userId", userId).eq("date", dateStr))
    .first();

  const summaryData = {
    userId,
    date: dateStr,
    totalIncome: income,
    totalExpenses: expenses,
    netProfit: income - expenses,
    transactionCount: dayTxns.length,
    computedAt: Date.now(),
  };

  if (existing) {
    await ctx.db.patch(existing._id, summaryData);
  } else {
    await ctx.db.insert("dailySummaries", summaryData);
  }
}
