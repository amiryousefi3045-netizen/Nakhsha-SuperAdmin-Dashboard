const express = require("express");
const router = express.Router();

// Placeholder user routes
router.get("/:id", (req, res) => {
  return res.status(501).json({ message: "Not implemented" });
});

module.exports = router;
