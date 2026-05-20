const mongoose = require("mongoose");

console.log("Testing MongoDB connection...");
console.log("Connection string: mongodb://127.0.0.1:27017/nakhsha");

const startTime = Date.now();

mongoose
  .connect("mongodb://127.0.0.1:27017/nakhsha", {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  })
  .then(() => {
    const elapsed = Date.now() - startTime;
    console.log(`✅ MongoDB connected successfully in ${elapsed}ms`);
    process.exit(0);
  })
  .catch((err) => {
    const elapsed = Date.now() - startTime;
    console.error(`❌ MongoDB connection failed after ${elapsed}ms:`);
    console.error(`Error type: ${err.name}`);
    console.error(`Error message: ${err.message}`);
    console.error(`Full error:`, err);
    process.exit(1);
  });

// Timeout safeguard
setTimeout(() => {
  console.error("⚠️  Test timed out after 15 seconds");
  process.exit(2);
}, 15000);
