// ============================================
// CONVEX FUNCTIONS — Users
// Syncs Clerk identity into the Convex users table.
// Called by Express after verifying the Clerk JWT.
// ============================================

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * upsert
 * Creates the user row on first login, updates on subsequent logins.
 * userId = Clerk's user ID (the "user_xxx" string from the verified JWT).
 */
export const upsert = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    phone: v.string(),
    businessName: v.optional(v.string()),
    language: v.string(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      // Update name/phone in case they changed in Clerk
      await ctx.db.patch(existing._id, {
        name: args.name,
        phone: args.phone,
        businessName: args.businessName,
        language: args.language,
        currency: args.currency,
        lastLoginAt: Date.now(),
      });
      return existing._id;
    }

    // First login — create the row
    const id = await ctx.db.insert("users", {
      userId: args.userId,
      name: args.name,
      phone: args.phone,
      pinHash: "",                        // Clerk handles auth — not needed
      businessName: args.businessName,
      language: args.language,
      currency: args.currency,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    });

    return id;
  },
});

/**
 * getByUserId
 * Fetch a user's Convex profile by their Clerk user ID.
 */
export const getByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});