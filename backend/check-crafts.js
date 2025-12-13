const mongoose = require("mongoose");
const Craft = require("./models/Craft");

(async () => {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nakhsha";
    console.log("Connecting to MongoDB URI:", uri);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB");

    // Count total crafts
    const total = await Craft.countDocuments({});
    console.log("Total crafts in database:", total);

    // Count published crafts
    const published = await Craft.countDocuments({ isPublished: true });
    console.log("Published crafts:", published);

    // List all crafts with basic info
    const crafts = await Craft.find({})
      .limit(10)
      .select("title isPublished craftType location.city createdAt");
    console.log("\nFirst 10 crafts:");
    crafts.forEach((craft, index) => {
      console.log(
        `${index + 1}. ${craft.title} - Published: ${
          craft.isPublished
        } - Type: ${craft.craftType} - City: ${craft.location?.city}`
      );
    });

    await mongoose.connection.close();
    process.exit(0);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
