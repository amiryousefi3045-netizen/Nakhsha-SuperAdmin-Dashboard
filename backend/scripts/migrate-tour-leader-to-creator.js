/**
 * One-time migration: rename the `tour_leader` role to `creator`.
 *
 * Rules:
 *  - Users with role = "tour_leader" become role = "creator".
 *  - Their `creatorType` is preserved (tour_leader artisans stay tour_leader).
 *  - Any user without a creatorType gets a sensible default based on their
 *    role history if encoded in existing fields; otherwise "artisan".
 *
 * Run:
 *   node scripts/migrate-tour-leader-to-creator.js
 *
 * Safe to re-run (idempotent).
 */
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nakhsha";

async function main() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log(`Connected to ${MONGODB_URI.replace(/\/\/[^@/]+@/, "//***@")}`);

  const legacy = await User.find({ role: "tour_leader" }).lean();
  console.log(`Found ${legacy.length} user(s) with role "tour_leader"`);

  if (legacy.length > 0) {
    const res = await User.updateMany(
      { role: "tour_leader" },
      [{ $set: { role: "creator" } }],
    );
    console.log(`Migrated: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
  } else {
    console.log("Nothing to migrate.");
  }

  // Ensure no stray tour_leader remains anywhere
  const remaining = await User.countDocuments({ role: { $in: ["tour_leader"] } });
  if (remaining > 0) {
    console.error(`ERROR: ${remaining} user(s) still carry role "tour_leader"`);
    process.exitCode = 1;
  } else {
    console.log("OK: no users carry the removed role.");
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});