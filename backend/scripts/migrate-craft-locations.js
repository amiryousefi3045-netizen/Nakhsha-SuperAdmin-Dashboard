const mongoose = require("mongoose");
const Craft = require("../models/Craft");

(async () => {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nakhsha";
    console.log("Connecting to MongoDB URI:", uri);

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log("Connected to MongoDB");

    const total = await Craft.countDocuments({});
    const hasGeometry = await Craft.countDocuments({
      "location.geometry": { $exists: true },
    });
    const hasLegacyCoordsOnly = await Craft.countDocuments({
      "location.coordinates": { $exists: true },
      "location.geometry": { $exists: false },
    });

    console.log("Total crafts:", total);
    console.log("With location.geometry:", hasGeometry);
    console.log("Legacy coords without geometry:", hasLegacyCoordsOnly);

    await Craft.migrateLocations();

    const hasGeometryAfter = await Craft.countDocuments({
      "location.geometry": { $exists: true },
    });
    const hasLegacyCoordsOnlyAfter = await Craft.countDocuments({
      "location.coordinates": { $exists: true },
      "location.geometry": { $exists: false },
    });

    console.log("After migration - with location.geometry:", hasGeometryAfter);
    console.log(
      "After migration - legacy coords without geometry:",
      hasLegacyCoordsOnlyAfter
    );

    await mongoose.connection.close();
    process.exit(0);
  } catch (e) {
    console.error("Migration error:", e);
    try {
      await mongoose.connection.close();
    } catch {
      // ignore
    }
    process.exit(1);
  }
})();
