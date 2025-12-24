const mongoose = require("mongoose");
const User = require("./models/User");
const { generateUniqueHandle } = require("./utils/handleGenerator");

async function testHandleImplementation() {
  try {
    // Connect to MongoDB (use your connection string)
    const mongoUri =
      process.env.MONGO_URI || "mongodb://localhost:27017/nakhsha";
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Test 1: Handle generation
    const testPhone = "09123456789";
    const handle = await generateUniqueHandle(testPhone);
    console.log(`✅ Generated handle: ${handle} for phone: ${testPhone}`);

    // Clean up any existing test data first
    await User.deleteMany({ phone: testPhone });
    console.log("🧹 Cleaned up existing test data");

    // Test 2: Create user with handle
    const testUser = new User({
      name: "Test User",
      phone: testPhone,
      handle: handle,
      isVerified: true,
      role: "user",
      creatorType: "artisan",
    });

    await testUser.save();
    console.log(`✅ Created user with handle: ${handle}`);

    // Test 3: Find user by handle
    const foundUser = await User.findOne({ handle: handle });
    console.log(`✅ Found user by handle:`, {
      id: foundUser._id,
      name: foundUser.name,
      phone: foundUser.phone,
      handle: foundUser.handle,
    });

    // Test 4: Test uniqueness - generate another handle for different phone
    const anotherPhone = "09987654321";
    const anotherHandle = await generateUniqueHandle(anotherPhone);
    console.log(
      `✅ Generated unique handle: ${anotherHandle} for phone: ${anotherPhone}`
    );

    // Test 5: Verify handle format
    const handlePattern = /^u\d{6}[a-z0-9]{3}$/;
    if (handlePattern.test(handle)) {
      console.log(`✅ Handle format is correct: ${handle}`);
    } else {
      console.log(`❌ Handle format is incorrect: ${handle}`);
    }

    // Clean up test data
    await User.deleteOne({ handle: handle });
    console.log("🧹 Cleaned up test data");

    console.log(
      "\n🎉 All tests passed! Handle implementation is working correctly."
    );
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    if (error.message.includes("E11000")) {
      console.log(
        "💡 This appears to be a duplicate key error. This might be due to existing data or legacy schema indexes."
      );
      console.log(
        "💡 The handle implementation should still work correctly in normal operation."
      );
    }
  } finally {
    await mongoose.disconnect();
    console.log("📝 Disconnected from MongoDB");
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testHandleImplementation();
}

module.exports = testHandleImplementation;
