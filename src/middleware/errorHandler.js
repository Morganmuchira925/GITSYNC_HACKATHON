import { logger } from "../utils/logger.js";

export const errorHandler = (err, req, res, next) => {
  logger.error(err);

  // Multer file size error
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      error: "File too large. Maximum size is 10MB.",
    });
  }

  // Validation errors (Joi)
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: err.details.map((d) => d.message),
    });
  }

  // CORS errors
  if (err.message?.startsWith("CORS:")) {
    return res.status(403).json({ success: false, error: err.message });
  }

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

// Custom error class
export class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AppError";
  }
}
