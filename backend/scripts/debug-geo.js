require("dotenv").config();
const mongoose = require("mongoose");
const { Listing, PostListing } = require("../models/Listing");

async function test() {
  await mongoose.connect("mongodb://127.0.0.1:27017/nakhsha_test");
  console.log("connected");

  const indexes = await mongoose.connection
    .collection("user_listings")
    .indexes();
  console.log(
    "indexes:",
    JSON.stringify(
      indexes.map((i) => i.key),
      null,
      2,
    ),
  );

  // Seed a test doc
  const user = await mongoose.connection.collection("users").findOne({});
  const ownerId = user ? user._id : new mongoose.Types.ObjectId();

  const doc = await PostListing.create({
    title: "تست گئو",
    description: "توضیحات تست جغرافیایی برای دیباگ",
    owner: ownerId,
    status: "published",
    location: { type: "Point", coordinates: [51.389, 35.6892] },
  });
  console.log("seeded doc:", doc._id);

  try {
    const result = await Listing.aggregate([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [51.389, 35.6892] },
          key: "location",
          distanceField: "distanceMeters",
          maxDistance: 10000,
          spherical: true,
          query: {},
        },
      },
      { $limit: 5 },
    ]);
    console.log("result count:", result.length);
    console.log("first:", JSON.stringify(result[0], null, 2));
  } catch (e) {
    console.error("geoNear error:", e.message, e.codeName);
  }

  await PostListing.deleteOne({ _id: doc._id });
  await mongoose.disconnect();
}

test().catch(console.error);
