const path = require("path");
const fs = require("fs");
const FormData = require("form-data");
const axios = require("axios");

async function testAvatarUpload() {
  try {
    console.log("Testing avatar upload endpoint...");

    // Create a simple test image buffer (1x1 PNG)
    const testImageBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64"
    );

    // Test without auth first to ensure endpoint exists
    const form = new FormData();
    form.append("avatar", testImageBuffer, {
      filename: "test.png",
      contentType: "image/png",
    });

    try {
      const response = await axios.post(
        "http://localhost:5000/api/users/me/avatar",
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
        console.log("Full error:", error);
        if (error.response) {
          console.log("Status:", error.response.status);
          console.log("Data:", error.response.data);
        }
        if (error.request) {
          console.log("Request made but no response received");
          console.log("Request:", error.request);
        }
      }
    }

    console.log("✅ Avatar upload endpoint test completed");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testAvatarUpload();
