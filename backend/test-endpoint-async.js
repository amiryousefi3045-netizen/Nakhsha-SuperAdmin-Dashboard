const http = require("http");

async function testEndpoint() {
  return new Promise((resolve, reject) => {
    const postId = "507f1f77bcf86cd799439011";

    const options = {
      hostname: "localhost",
      port: 5000,
      path: `/api/posts/${postId}/images`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    };

    console.log(
      `Testing endpoint: POST http://localhost:5000/api/posts/${postId}/images`
    );

    const req = http.request(options, (res) => {
      console.log(`Status: ${res.statusCode}`);

      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        console.log("Response body:", body);
        if (res.statusCode === 401) {
          console.log(
            "✅ Endpoint exists and correctly requires authentication"
          );
        } else if (res.statusCode === 400) {
          console.log("✅ Endpoint exists and correctly validates input");
        } else {
          console.log("❓ Unexpected status code");
        }
        resolve({ status: res.statusCode, body });
      });
    });

    req.on("error", (e) => {
      console.error(`Request error: ${e.message}`);
      reject(e);
    });

    req.setTimeout(5000, () => {
      console.error("Request timeout");
      req.destroy();
      reject(new Error("Timeout"));
    });

    req.end();
  });
}

async function main() {
  try {
    await testEndpoint();
    console.log("Test completed successfully");
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

main();
