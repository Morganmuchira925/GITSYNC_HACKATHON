// ============================================
// FEDHA - Main Server Entry Point
// FinTech for the Informal Sector
// ============================================

import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { rateLimit } from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

import { logger } from "./utils/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";

// Routes
import transactionRoutes from "./routes/transactions.js";
import voiceRoutes from "./routes/voice.js";
import receiptRoutes from "./routes/receipts.js";
import dashboardRoutes from "./routes/dashboard.js";
import authRoutes from "./routes/auth.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security Middleware ─────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ── CORS ────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:5173"];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Rate Limiting ───────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api/", limiter);

// Voice & receipt routes get more generous limits (file uploads)
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { error: "Too many uploads. Please wait a moment." },
});

// ── Body Parsing ────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Logging ─────────────────────────────────────────────
app.use(morgan("combined", {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ── Static Files (uploads) ──────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ── Health Check ────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Fedha Backend",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── API Routes ───────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/voice", uploadLimiter, voiceRoutes);
app.use("/api/receipts", uploadLimiter, receiptRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ── Error Handling ───────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🚀 Fedha Backend running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🧠 Gemini model: ${process.env.GEMINI_MODEL || "(unset)"}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
});

export default app;
