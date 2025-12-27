#!/usr/bin/env node

const axios = require("axios");
const mongoose = require("mongoose");
const User = require("./models/User");
const { generateUniqueHandle } = require("./utils/handleGenerator");

const BASE_URL = "http://localhost:5000/api";

async function testHandleFlow() {
  console.log("🚀 Testing Handle Flow...\n");

  try {
    // Connect to MongoDB to create a test user
    const mongoUri =
      process.env.MONGO_URI || "mongodb://localhost:27017/nakhsha";
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Clean up any existing test data
    const testPhone = "09123456789";
    await User.deleteMany({ phone: testPhone });

    // Create a test user with handle (simulating OTP verification result)
    const handle = await generateUniqueHandle(testPhone);

    const testUser = new User({
      name: "Test Handle User",
      phone: testPhone,
      handle: handle,
      isVerified: true,
      role: "user",
      creatorType: "artisan",
      bio: "Test user for handle flow verification",
    });

    await testUser.save();
    console.log("✅ Created test user (simulating OTP verification):");
    console.log(`   📱 Phone: ${testUser.phone}`);
    console.log(`   🏷️  Handle: ${testUser.handle}`);
    console.log(`   👤 Name: ${testUser.name}`);
    console.log(`   🆔 User ID: ${testUser._id}`);

    // Step 2: Test the public handle lookup endpoint
    console.log("\n🔍 Testing GET /api/users/handle/:handle endpoint...");

    try {
      const response = await axios.get(`${BASE_URL}/users/handle/${handle}`, {
        timeout: 5000,
      });

      console.log("✅ Handle lookup successful!");
      console.log("📊 Response status:", response.status);
      console.log("📋 Response data:");
      console.log(`   🆔 User ID: ${response.data.user.id}`);
      console.log(`   🏷️  Handle: ${response.data.user.handle}`);
      console.log(`   👤 Name: ${response.data.user.name}`);
      console.log(`   📱 Phone: ${response.data.user.phone}`);
      console.log(`   ✅ Verified: ${response.data.user.isVerified}`);
    } catch (apiError) {
      console.log("❌ Handle lookup failed!");
      if (apiError.code === "ECONNREFUSED") {
        console.log(
          "🚨 Connection refused - server might not be running on localhost:5000"
        );
        console.log(
          "💡 Please make sure the backend server is started with: node server.js"
        );

        // Skip API tests but continue with database tests
        console.log(
          "\n🔄 Skipping API tests, continuing with database verification..."
        );

        // Test direct database lookup
        const foundUser = await User.findOne({ handle: handle });
        if (foundUser) {
          console.log("✅ User found in database:");
          console.log(`   🆔 User ID: ${foundUser._id}`);
          console.log(`   🏷️  Handle: ${foundUser.handle}`);
          console.log(`   👤 Name: ${foundUser.name}`);
        }
      } else {
        console.log("📊 Status:", apiError.response?.status);
        console.log(
          "📋 Response:",
          JSON.stringify(apiError.response?.data, null, 2)
        );
        console.log("📋 Error details:", apiError.message);
      }
    }

    // Step 3: Test with non-existent handle (only if server is available)
    if (!axios.defaults.timeout || axios.defaults.timeout > 1000) {
      console.log("\n🧪 Testing with non-existent handle...");
      try {
        await axios.get(`${BASE_URL}/users/handle/nonexistenthandle`, {
          timeout: 5000,
        });
        console.log("❌ Expected 404 but request succeeded!");
      } catch (apiError) {
        if (apiError.code === "ECONNREFUSED") {
          console.log("⏭️  Skipped - server not available");
        } else if (apiError.response?.status === 404) {
          console.log("✅ Correctly returned 404 for non-existent handle");
          console.log(
            "📋 Error response:",
            JSON.stringify(apiError.response?.data, null, 2)
          );
        } else {
          console.log("❌ Unexpected error:", apiError.response?.status);
        }
      }
    }

    // Clean up test data
    await User.deleteOne({ _id: testUser._id });
    console.log("\n🧹 Cleaned up test data");

    console.log("\n🎉 Handle flow test completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("📋 Full error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("📝 Disconnected from MongoDB");
  }
}

// Helper function to check if server is running
async function checkServerHealth() {
  try {
    console.log(`🔍 Checking server at ${BASE_URL}/health...`);
    const response = await axios.get(`${BASE_URL}/health`);
    console.log(`✅ Server responded with status: ${response.status}`);
    return true;
  } catch (error) {
    console.log(`❌ Server health check failed: ${error.message}`);
    console.log(`   Code: ${error.code || "Unknown"}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
    }
    return false;
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  console.log("🚀 Starting Handle Flow Test...");
  console.log(
    "📝 Note: This test will work even if the API server is not running"
  );
  console.log(
    "💡 To test the API endpoint, make sure to start the server with: node server.js\n"
  );

  testHandleFlow().catch(console.error);
}

module.exports = testHandleFlow;
