const mongoose = require("mongoose");
const logger = require("./utils/logger");

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/nakhsha";

async function dropEmailIndex() {
  try {
    console.log("🔄 Connecting to database...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to database");

    const db = mongoose.connection.db;
    const usersCollection = db.collection("users");

    // Check if email index exists
    const indexes = await usersCollection.indexes();
    console.log("📋 Current indexes:");
    indexes.forEach((index, i) => {
      console.log(`  ${i + 1}. ${JSON.stringify(index.key)} - ${index.name}`);
    });

    // Try to drop email index
    try {
      await usersCollection.dropIndex("email_1");
      console.log("✅ Successfully dropped email index");
    } catch (error) {
      if (error.message.includes("index not found")) {
        console.log("ℹ️ Email index not found (already removed)");
      } else {
        console.error("❌ Error dropping email index:", error.message);
      }
    }

    // Check remaining indexes
    const finalIndexes = await usersCollection.indexes();
    console.log("\n📋 Final indexes:");
    finalIndexes.forEach((index, i) => {
      console.log(`  ${i + 1}. ${JSON.stringify(index.key)} - ${index.name}`);
    });
  } catch (error) {
    console.error("❌ Database operation failed:", error.message);
    logger.error("Drop email index failed", { error: error.message });
  } finally {
    await mongoose.connection.close();
    console.log("🔒 Database connection closed");
  }
}

// Run if called directly
if (require.main === module) {
  dropEmailIndex()
    .then(() => {
      console.log("✅ Index cleanup completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Index cleanup failed:", error);
      process.exit(1);
    });
}

module.exports = dropEmailIndex;
