/**
 * Simple test for the PATCH /api/users/me endpoint
 */

const http = require("http");

// Test data
const testData = JSON.stringify({
  name: "Test User",
  bio: "Test bio",
  location: {
    city: "Test City",
    neighborhood: "Test Neighborhood",
    coordinates: {
      lat: 35.6892,
      lng: 51.389,
    },
  },
});

// Test with invalid token (should return 401)
const options = {
  hostname: "localhost",
  port: 5000,
  path: "/api/users/me",
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer invalid-token",
    "Content-Length": Buffer.byteLength(testData),
  },
};

console.log("Testing PATCH /api/users/me endpoint...\n");

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, JSON.stringify(res.headers, null, 2));

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("\nResponse body:");
    try {
      const jsonResponse = JSON.parse(data);
      console.log(JSON.stringify(jsonResponse, null, 2));

      // Verify it's the expected error response format
      if (jsonResponse.error && jsonResponse.error.code === "UNAUTHORIZED") {
        console.log(
          "\n✅ Endpoint is working correctly! Returns proper error format for invalid token."
        );
      } else {
        console.log("\n❌ Unexpected response format");
      }
    } catch (e) {
      console.log("Raw response:", data);
    }
  });
});

req.on("error", (e) => {
  console.error(`Request failed: ${e.message}`);
});

req.write(testData);
req.end();
