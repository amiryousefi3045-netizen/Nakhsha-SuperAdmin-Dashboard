// Alias removed — explicit 410 response
const express = require("express");

const router = express.Router();

router.use((req, res) => {
  res.status(410).json({
    message:
      "The /api/recipes compatibility alias has been removed. Use /api/crafts instead.",
  });
});

module.exports = router;
