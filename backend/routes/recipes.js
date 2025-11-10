// This compatibility alias has been removed as part of the migration to /api/crafts.
// The file is retained as a stub to surface a clear error if anyone still mounts it.
const express = require("express");

const router = express.Router();

router.use((req, res) => {
  res.status(410).json({
    message:
      "The /api/recipes compatibility alias has been removed. Use /api/crafts instead.",
  });
});

module.exports = router;
