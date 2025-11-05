const mongoose = require("mongoose");

// Reuse the compiled Listing model's schema so we don't duplicate schema code here.
// This creates a `Craft` model that points to the same underlying `listings` collection.
// That keeps data consistent during the transition from recipes/listings -> crafts.
const Listing = require("./Recipe");
const listingSchema = Listing.schema;

// Export a Craft model that uses the same collection name ('listings') to remain
// compatible with existing documents until we perform an explicit DB migration.
module.exports = mongoose.model("Craft", listingSchema, "listings");
