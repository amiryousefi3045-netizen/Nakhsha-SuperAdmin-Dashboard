// Simple HTTP test for the profile endpoint
const http = require("http");

const postData = JSON.stringify({
  name: "احمد رضایی",
  bio: "هنرمند سفالگری",
});

const options = {
  hostname: "localhost",
  port: 5000,
  path: "/api/users/me",
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer invalid-token",
    "Content-Length": Buffer.byteLength(postData),
  },
};

console.log("تست PATCH /api/users/me...");

const req = http.request(options, (res) => {
  console.log(`وضعیت: ${res.statusCode}`);

  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    console.log("پاسخ:", data);
    process.exit(0);
  });
});

req.on("error", (e) => {
  console.error("خطا:", e.message);
  process.exit(1);
});

req.setTimeout(5000, () => {
  console.log("تایم‌اوت");
  req.destroy();
  process.exit(1);
});

req.write(postData);
req.end();
