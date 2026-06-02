const mongoose = require("mongoose");

/**
 * Draft Schema - Mongoose discriminator base schema for multi-step listing creation
 * Supports all listing types: post, tour, training, academy
 * Features:
 * - Optimistic concurrency control via _version field
 * - TTL index for automatic cleanup after 90 days of inactivity
 * - Partial updates with change tracking (lastAutosavedAt, draftVersion)
 * - Ownership validation (owner field)
 */

const draftSchema = new mongoose.Schema(
  {
    // Ownership & status
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["post", "tour", "training", "academy"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "published", "discarded"],
      default: "active",
      index: true,
    },

    // Draft management fields
    currentStep: {
      type: Number,
      default: 1,
      min: 1,
      max: 10, // Adjust based on your step count
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },

    // Concurrency control & versioning
    _version: {
      type: Number,
      default: 0,
      required: true,
    },
    lastAutosavedAt: {
      type: Date,
      default: Date.now,
    },
    draftVersion: {
      // Semantic version or counter; incremented only on actual changes
      type: Number,
      default: 0,
    },

    // Link to published listing (set when draft is promoted)
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      sparse: true,
    },

    // Base content fields (common to all types)
    title: {
      type: String,
      minlength: 5,
      maxlength: 200,
    },
    description: {
      type: String,
      maxlength: 5000,
    },
    tags: {
      type: [String],
      default: [],
    },
    images: {
      type: [String], // Relative paths like /uploads/abc.webp
      default: [],
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [lng, lat]
        minlength: 2,
        maxlength: 2,
      },
    },

    // Type-specific fields for 'post' discriminator
    price: Number,
    forSale: Boolean,
    category: String,
    attributes: mongoose.Schema.Types.Mixed, // Map-like object

    // Type-specific fields for 'tour' discriminator
    startDate: Date,
    endDate: Date,
    duration: String, // e.g., "3 days"
    durationDays: Number,
    capacity: Number,
    itinerary: [String], // Array of itinerary points

    // Type-specific fields for 'training' discriminator
    schedule: String, // Recurrence pattern (e.g., "weekly, mon-wed")
    level: String, // e.g., "beginner", "intermediate", "advanced"
    instructor: String,

    // Type-specific fields for 'academy' discriminator
    addressDetails: String,
    phone: String,
    workingHours: String,
    website: String,

    // Change tracking (optional, for audit/debugging)
    lastChangedFields: {
      type: [String],
      default: [],
    },
  },
  {
    discriminatorKey: "type",
    collection: "drafts",
    timestamps: true,
    // TTL: auto-delete after 90 days of inactivity
    // createdAt is the reference point; if not modified for 90 days, deleted
  },
);

// Indexes
draftSchema.index({ owner: 1, type: 1, status: 1 });
draftSchema.index({ owner: 1, status: 1 });
draftSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // TTL: 90 days
draftSchema.index({ lastAutosavedAt: 1 }); // For querying active drafts

// Create base Draft model
const Draft = mongoose.model("Draft", draftSchema, "drafts");

// Create discriminator models for each type
Draft.discriminator(
  "post",
  new mongoose.Schema({
    price: {
      type: Number,
      min: 0,
    },
    forSale: {
      type: Boolean,
      default: true,
    },
    category: String,
    attributes: mongoose.Schema.Types.Mixed,
  }),
);

Draft.discriminator(
  "tour",
  new mongoose.Schema({
    startDate: {
      type: Date,
      required: function () {
        return this.type === "tour";
      },
    },
    endDate: {
      type: Date,
      required: function () {
        return this.type === "tour";
      },
    },
    duration: String,
    durationDays: Number,
    capacity: Number,
    itinerary: [String],
  }),
);

Draft.discriminator(
  "training",
  new mongoose.Schema({
    schedule: String,
    startDate: Date,
    endDate: Date,
    duration: String,
    capacity: Number,
    level: String,
    instructor: String,
  }),
);

Draft.discriminator(
  "academy",
  new mongoose.Schema({
    addressDetails: String,
    phone: String,
    workingHours: String,
    website: String,
  }),
);

module.exports = Draft;
