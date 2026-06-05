import multer from "multer";
import path from "path";
import fs from "fs";
import { AppError } from "../middleware/errorHandler.js";

const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || "10") * 1024 * 1024;

// Ensure upload dirs exist
const uploadDirs = ["./uploads/audio", "./uploads/receipts"];
uploadDirs.forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

// ── Audio Upload (Voice-to-Ledger) ───────────────────────
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "./uploads/audio"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, `audio-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const audioFilter = (req, file, cb) => {
  const allowed = ["audio/webm", "audio/mp3", "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("Only audio files are allowed (webm, mp3, wav, ogg).", 400), false);
  }
};

export const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: audioFilter,
  limits: { fileSize: MAX_SIZE },
}).single("audio");

// ── Receipt Image Upload (Photo-to-Text) ─────────────────
const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "./uploads/receipts"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const receiptFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("Only images are allowed (jpg, png, webp).", 400), false);
  }
};

export const uploadReceipt = multer({
  storage: receiptStorage,
  fileFilter: receiptFilter,
  limits: { fileSize: MAX_SIZE },
}).single("receipt");

// ── Cleanup helper ───────────────────────────────────────
export function cleanupFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) console.error("File cleanup error:", err);
    });
  }
}
