const http = require("http");

const options = {
  hostname: "localhost",
  port: 5000,
  path: "/api/crafts/seed/dev?count=20",
  method: "GET",
};

console.log(
  "Attempting to connect to:",
  `http://${options.hostname}:${options.port}${options.path}`
);

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log("Headers:", res.headers);

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("Raw response:", data);
    try {
      const jsonData = JSON.parse(data);
      console.log("Parsed response:", jsonData);
    } catch (e) {
      console.log("Failed to parse JSON:", e.message);
    }
    process.exit(0);
  });
});

req.on("error", (err) => {
  console.error("Connection error:", err.message);
  console.error("Make sure the backend server is running on port 3001");
  process.exit(1);
});

req.on("timeout", () => {
  console.error("Request timeout");
  process.exit(1);
});

req.setTimeout(5000);
req.end();
