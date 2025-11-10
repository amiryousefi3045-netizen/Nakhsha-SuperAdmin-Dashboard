const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

// Health check endpoint
router.get("/", async (_req, res) => {
  let dbStatus = "down";

  try {
    // Check MongoDB connection
    const state = mongoose.connection.readyState;
    dbStatus = state === 1 ? "up" : "down";
  } catch (err) {
    console.error("Health check DB error:", err);
  }

  res.json({
    ok: true,
    db: dbStatus,
    version: process.env.COMMIT_SHA || "dev",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
