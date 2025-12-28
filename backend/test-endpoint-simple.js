const http = require("http");

function testEndpoint() {
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

  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);

    let body = "";
    res.on("data", (chunk) => {
      body += chunk;
    });

    res.on("end", () => {
      console.log("Response body:", body);
      if (res.statusCode === 401) {
        console.log("✅ Endpoint exists and correctly requires authentication");
      } else if (res.statusCode === 400) {
        console.log("✅ Endpoint exists and correctly validates input");
      } else {
        console.log("❓ Unexpected status code");
      }
    });
  });

  req.on("error", (e) => {
    console.error(`Request error: ${e.message}`);
  });

  req.end();
}

testEndpoint();
