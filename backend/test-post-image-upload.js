const path = require("path");
const fs = require("fs");
const FormData = require("form-data");
const axios = require("axios");

async function testPostImageUpload() {
  try {
    console.log("Testing post image upload endpoint...");

    // Create a simple test image buffer (1x1 PNG)
    const testImageBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64"
    );

    // Test a fake post ID to ensure endpoint exists and validates correctly
    const fakePostId = "507f1f77bcf86cd799439011";

    // Test without auth first to ensure endpoint exists
    const form = new FormData();
    form.append("images", testImageBuffer, {
      filename: "test.png",
      contentType: "image/png",
    });

    try {
      const response = await axios.post(
        `http://localhost:5000/api/posts/${fakePostId}/images`,
        form,
        {
          headers: {
            ...form.getHeaders(),
          },
        }
      );
      console.log("Unexpected success without auth:", response.status);
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log(
          "✅ Endpoint exists and correctly requires authentication (401)"
        );
        console.log("Response:", error.response.data);
      } else {
        console.log("❌ Unexpected error:", error.message);
        if (error.response) {
          console.log("Status:", error.response.status);
          console.log("Data:", error.response.data);
        }
        if (error.request) {
          console.log("Request made but no response received");
        }
      }
    }

    console.log("\n=== Test completed ===");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

if (require.main === module) {
  testPostImageUpload();
}

module.exports = { testPostImageUpload };
