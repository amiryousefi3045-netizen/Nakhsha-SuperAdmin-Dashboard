/**
 * Test script for PATCH /api/users/me endpoint
 * Run this with: node test-profile-update.js
 */

const axios = require("axios");

const API_BASE = process.env.API_BASE || "http://localhost:5000/api";

async function testProfileUpdate() {
  console.log("Testing PATCH /api/users/me endpoint...\n");

  // You'll need to replace this with a valid JWT token
  const testToken = "your-jwt-token-here";

  const testCases = [
    {
      name: "Valid profile update",
      data: {
        name: "احمد رضایی",
        bio: "هنرمند سفالگری از کاشان",
        location: {
          city: "کاشان",
          neighborhood: "حکیم نزاری",
          coordinates: {
            lat: 33.9831,
            lng: 51.4154,
          },
        },
      },
      shouldSucceed: true,
    },
    {
      name: "Empty bio (should be allowed)",
      data: {
        name: "علی محمدی",
        bio: "",
        location: {
          city: "اصفهان",
          neighborhood: null,
          coordinates: null,
        },
      },
      shouldSucceed: true,
    },
    {
      name: "Name too long (should fail)",
      data: {
        name: "این نام بسیار طولانی است و بیش از شصت کاراکتر دارد که نباید مجاز باشد",
        bio: "بیو معمولی",
      },
      shouldSucceed: false,
    },
    {
      name: "Bio too long (should fail)",
      data: {
        name: "نام معمولی",
        bio:
          "این متن بیو بسیار طولانی است ".repeat(10) +
          "و بیش از سیصد کاراکتر دارد که نباید مجاز باشد",
      },
      shouldSucceed: false,
    },
    {
      name: "Try to update prohibited fields (should be ignored)",
      data: {
        name: "نام جدید",
        bio: "بیو جدید",
        role: "admin", // Should be ignored
        phone: "09123456789", // Should be ignored
        isVerified: true, // Should be ignored
      },
      shouldSucceed: true,
    },
  ];

  for (const testCase of testCases) {
    try {
      console.log(`Testing: ${testCase.name}`);

      if (testToken === "your-jwt-token-here") {
        console.log("❌ Please set a valid JWT token in the test script");
        break;
      }

      const response = await axios.patch(
        `${API_BASE}/users/me`,
        testCase.data,
        {
          headers: {
            Authorization: `Bearer ${testToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (testCase.shouldSucceed) {
        console.log("✅ Success:", response.data);
      } else {
        console.log("❌ Expected failure but got success:", response.data);
      }
    } catch (error) {
      if (!testCase.shouldSucceed) {
        console.log(
          "✅ Expected failure:",
          error.response?.data || error.message
        );
      } else {
        console.log(
          "❌ Unexpected failure:",
          error.response?.data || error.message
        );
      }
    }

    console.log("---\n");
  }
}

// Run tests if called directly
if (require.main === module) {
  testProfileUpdate().catch(console.error);
}

module.exports = { testProfileUpdate };
