const express = require("express");
const mongoose = require("mongoose");
const { getSmsStatus } = require("../services/sms/melipayamakSms");

const router = express.Router();

// Health check endpoint (public — keeps the existing shape, only adds fields)
router.get("/", async (_req, res) => {
  let dbStatus = "down";

  try {
    // Check MongoDB connection
    const state = mongoose.connection.readyState;
    dbStatus = state === 1 ? "up" : "down";
  } catch (err) {
    console.error("Health check DB error:", err);
  }

  // SMS status never dials the provider when mocked/disabled or from tests.
  let sms = { configured: false, mock: false, mode: "error" };
  try {
    sms = await getSmsStatus();
  } catch (err) {
    console.error("Health check SMS error:", err);
  }

  const mem = process.memoryUsage();

  res.json({
    ok: true,
    db: dbStatus,
    sms,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    environment: process.env.NODE_ENV || "development",
    version: process.env.COMMIT_SHA || "dev",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
