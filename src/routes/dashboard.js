// ============================================
// DASHBOARD ROUTES
// GET /api/dashboard/summary?period=
// GET /api/dashboard/chart?period=&groupBy=
// GET /api/dashboard/insights?period=
// GET /api/dashboard/categories?period=
// ============================================

import express from "express";
import { runQuery } from "../utils/convexClient.js";
import { generateFinancialInsights } from "../services/geminiService.js";
import { AppError } from "../middleware/errorHandler.js";

// ADDED CHANGE: Import your Clerk authentication middleware
import { requireClerkAuth } from "../middleware/clerkAuth.js";

const router = express.Router();

// ADDED CHANGE: Protect all endpoints inside this router file with Clerk verification
router.use(requireClerkAuth);

// Utility: get start timestamp for a period
function periodToTimestamp(period) {
  const now = Date.now();
  const DAY = 86400000;
  const periods = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
  return now - (periods[period] || 30) * DAY;
}

/**
 * GET /api/dashboard/summary?period=30d
 * Returns: total income, total expenses, net profit, transaction count
 */
router.get("/summary", async (req, res) => {
  const { period = "30d" } = req.query;
  
  // UPDATED CHANGE: Use the secure user identity injected by the middleware
  const userId = req.userId;
  if (!userId) throw new AppError("userId is required.", 400);

  // const transactions = await runQuery(api.transactions.list, { userId, from: periodToTimestamp(period) });
  const transactions = generateMockTransactions(userId, 40); // Remove when Convex live

  const income = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const netProfit = income - expenses;

  res.json({
    success: true,
    period,
    summary: {
      totalIncome: income,
      totalExpenses: expenses,
      netProfit,
      profitMargin: income > 0 ? parseFloat(((netProfit / income) * 100).toFixed(1)) : 0,
      transactionCount: transactions.length,
      avgDailyIncome: parseFloat((income / getDays(period)).toFixed(2)),
      avgDailyExpenses: parseFloat((expenses / getDays(period)).toFixed(2)),
      currency: "KES",
    },
  });
});

/**
 * GET /api/dashboard/chart?period=30d&groupBy=day
 * Returns: time series data for chart rendering
 * groupBy: "day" | "week"
 */
router.get("/chart", async (req, res) => {
  const { period = "30d", groupBy = "day" } = req.query;
  
  // UPDATED CHANGE: Pull userId from req context object instead of query parameters
  const userId = req.userId;
  if (!userId) throw new AppError("userId is required.", 400);

  // const transactions = await runQuery(api.transactions.list, { userId, from: periodToTimestamp(period) });
  const transactions = generateMockTransactions(userId, 40);

  const days = getDays(period);
  const chartData = [];
  const now = Date.now();
  const DAY = 86400000;

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = now - i * DAY;
    const dayEnd = dayStart + DAY;
    const dayLabel = new Date(dayStart).toISOString().split("T")[0];

    const dayTxns = transactions.filter(t =>
      t.createdAt >= dayStart && t.createdAt < dayEnd
    );

    chartData.push({
      date: dayLabel,
      income: dayTxns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
      expenses: dayTxns.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      transactions: dayTxns.length,
    });
  }

  // Add running balance
  let balance = 0;
  chartData.forEach(d => {
    balance += d.income - d.expenses;
    d.balance = balance;
  });

  res.json({ success: true, period, groupBy, chartData });
});

/**
 * GET /api/dashboard/categories?period=30d
 * Returns: spending breakdown by category (for pie/donut chart)
 */
router.get("/categories", async (req, res) => {
  const { period = "30d" } = req.query;
  
  // UPDATED CHANGE: Pull userId securely via middleware verification wrapper
  const userId = req.userId;
  if (!userId) throw new AppError("userId is required.", 400);

  const transactions = generateMockTransactions(userId, 40);
  const categoryMap = {};

  transactions.forEach(t => {
    if (!categoryMap[t.category]) {
      categoryMap[t.category] = { income: 0, expenses: 0, count: 0 };
    }
    if (t.type === "income") categoryMap[t.category].income += t.amount;
    else categoryMap[t.category].expenses += t.amount;
    categoryMap[t.category].count++;
  });

  const categories = Object.entries(categoryMap).map(([name, data]) => ({
    category: name,
    ...data,
    net: data.income - data.expenses,
  })).sort((a, b) => b.expenses - a.expenses);

  res.json({ success: true, period, categories });
});

/**
 * GET /api/dashboard/insights?period=30d
 * Returns: AI-generated financial health insights (Gemini)
 */
router.get("/insights", async (req, res) => {
  const { period = "30d" } = req.query;
  
  // UPDATED CHANGE: Access authenticated token owner's userId context
  const userId = req.userId;
  if (!userId) throw new AppError("userId is required.", 400);

  const transactions = generateMockTransactions(userId, 40);
  const insights = await generateFinancialInsights(transactions, getDays(period));

  res.json({ success: true, period, insights });
});

function getDays(period) {
  const map = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
  return map[period] || 30;
}

function generateMockTransactions(userId, count) {
  const categories = ["produce", "groceries", "transport", "services", "livestock", "other"];
  const types = ["income", "expense"];
  return Array.from({ length: count }, (_, i) => ({
    _id: `txn_${i}`,
    userId,
    type: Math.random() > 0.4 ? "income" : "expense",
    amount: Math.floor(Math.random() * 2500) + 100,
    category: categories[Math.floor(Math.random() * categories.length)],
    description: "Mock transaction",
    createdAt: Date.now() - Math.floor(Math.random() * 30 * 86400000),
  }));
}

export default router;