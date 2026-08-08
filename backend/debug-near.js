process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key";
const mongoose = require("mongoose");
const app = require("./server");
const request = require("supertest");

(async () => {
  const mongoUri = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  app.locals.dbReady = true;
  const res = await request(app)
    .get("/api/listings/near")
    .query({ lat: 35.6892, lng: 51.389, radiusKm: 10 });
  console.log("STATUS:", res.status);
  console.log("BODY:", JSON.stringify(res.body));
  await mongoose.disconnect();
})();
