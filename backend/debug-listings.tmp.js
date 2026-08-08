process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key";
const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

(async () => {
  await mongoose.connect("mongodb://127.0.0.1:27017/nakhsha_test");
  const User = require("D:/Work/Projects/Nakhsha/backend/models/User");
  const { Listing, PostListing } = require("D:/Work/Projects/Nakhsha/backend/models/Listing");
  await User.deleteMany({});
  await Listing.deleteMany({});
  const user = await User.create({
    name: "هنرمند آزمایشی",
    phone: "09100000001",
    role: "user",
    isVerified: true,
  });
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
  const app = require("D:/Work/Projects/Nakhsha/backend/server");
  app.locals.dbReady = true;

  const BASE = {
    title: "عنوان آزمایشی برای تست",
    description: "توضیحات آزمایشی برای بررسی عملکرد API",
    tags: ["هنر", "صنایع‌دستی"],
  };

  const res = await request(app)
    .post("/api/listings")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", "application/json")
    .send({ ...BASE, type: "post", status: "published", details: { price: 150000 } });

  console.log("STATUS:", res.status);
  console.log("BODY:", JSON.stringify(res.body, null, 2));

  const trainingRes = await request(app)
    .post("/api/listings")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", "application/json")
    .send({ ...BASE, type: "training", details: { level: "beginner" } });
  console.log("TRAINING NO SCHEDULE STATUS:", trainingRes.status);
  console.log("TRAINING BODY:", JSON.stringify(trainingRes.body, null, 2));

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
