// Compatibility alias router for /api/recipes during migration.
// This keeps the endpoint working while the original `recipes.js` is preserved
// for manual review/merge. The alias simply forwards to the canonical crafts router.
const express = require("express");
const craftsRouter = require("./crafts");

const router = express.Router();

router.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `Using compatibility alias /api/recipes -> /api/crafts ${req.method} ${req.originalUrl}`
    );
  }
  next();
});

router.use("/", craftsRouter);

module.exports = router;
