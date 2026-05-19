/**
 * Listing model — canonical "listings" collection for Nakhsha.
 *
 * Uses Mongoose discriminators so that type-specific fields are stored in the
 * same "listings" collection while each listing type has its own schema shape.
 *
 * Discriminator key: "type"
 *   Possible values: 'post' | 'tour' | 'training' | 'academy'
 *
 * Usage:
 *   const { PostListing, TourListing, TrainingListing, AcademyListing } = require('./Listing');
 *   const item = await PostListing.create({ title, ... price, forSale });
 */
const mongoose = require("mongoose");

// ── Base schema ───────────────────────────────────────────────────────────────

const listingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "عنوان الزامی است"],
      trim: true,
      minlength: [5, "عنوان باید حداقل ۵ کاراکتر باشد"],
      maxlength: [200, "عنوان نباید بیش از ۲۰۰ کاراکتر باشد"],
    },
    description: {
      type: String,
      required: [true, "توضیحات الزامی است"],
      trim: true,
      maxlength: [5000, "توضیحات نباید بیش از ۵۰۰۰ کاراکتر باشد"],
    },
    tags: {
      type: [String],
      default: [],
    },
    /**
     * Stored as relative server paths, e.g. "/uploads/abc.webp".
     * Never store absolute URLs — the domain may change.
     */
    images: {
      type: [String],
      default: [],
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "مالک الزامی است"],
    },
    /**
     * Link to draft that created this listing (for tracking draft→listing flow)
     * Sparse index allows this field to be missing for legacy listings.
     */
    draftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Draft",
      sparse: true,
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
    },
    /**
     * Enhanced location schema with address and GeoJSON Point.
     *
     * coordinates: [longitude, latitude]  (per GeoJSON spec)
     * All address fields are optional; the sparse 2dsphere index on
     * location.geometry skips documents without coordinates.
     *
     * Example:
     * {
     *   "type": "Point",
     *   "coordinates": [51.389, 35.689],
     *   "city": "تهران",
     *   "province": "تهران",
     *   "district": "بلوار فرردوسی",
     *   "address": "خیابان ولیعصر، پلاک ۱۲۳"
     * }
     */
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: undefined,
      },
      coordinates: {
        type: [Number],
        default: undefined,
        validate: {
          validator(coords) {
            if (!Array.isArray(coords) || coords.length !== 2) return false;
            const [lng, lat] = coords;
            return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
          },
          message:
            "مختصات جغرافیایی نامعتبر — باید [lng, lat] در محدوده‌های مجاز باشد",
        },
      },
      /** City name (e.g., "تهران", "اصفهان"). Indexed for filtering. */
      city: {
        type: String,
        trim: true,
        maxlength: 100,
        sparse: true,
      },
      /** Province/state name (e.g., "تهران", "اصفهان"). Indexed for filtering. */
      province: {
        type: String,
        trim: true,
        maxlength: 100,
        sparse: true,
      },
      /** District/neighborhood (e.g., "بلوار فرردوسی"). Optional detail for precision. */
      district: {
        type: String,
        trim: true,
        maxlength: 150,
        sparse: true,
      },
      /** Full address string. For display and detailed location info. */
      address: {
        type: String,
        trim: true,
        maxlength: 500,
        sparse: true,
      },
    },
    /**
     * Revision number for optimistic concurrency control and conflict detection.
     * Incremented on every successful update.
     */
    revision: {
      type: Number,
      default: 0,
      required: true,
    },
    /**
     * Edit history tracking: array of edit records.
     * Each record contains:
     *   - timestamp: when the edit was made
     *   - editor: user ID who made the edit
     *   - changes: map of field names to their old values
     *   - newRevision: revision number after this edit
     */
    editHistory: {
      type: [
        {
          timestamp: { type: Date, required: true, default: Date.now },
          editor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          changes: { type: Map, of: mongoose.Schema.Types.Mixed },
          newRevision: { type: Number, required: true },
          reason: { type: String, trim: true }, // Optional: why was this edit made?
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    /** The discriminatorKey tells Mongoose which field carries the type tag. */
    discriminatorKey: "type",
    /**
     * Use "user_listings" to avoid collision with the legacy Craft model,
     * which also targets the "listings" collection.
     */
    collection: "user_listings",
  },
);

// ── Indexes ───────────────────────────────────────────────────────────────────

/**
 * Sparse 2dsphere index for geospatial queries.
 * sparse:true → documents without the location.coordinates field are skipped,
 * so the index can coexist with records that have no location.
 *
 * CRITICAL: Must be named so it can be explicitly checked/created.
 */
listingSchema.index(
  { "location.coordinates": "2dsphere" },
  { sparse: true, name: "location_geo_idx" }
);

/**
 * Compound index for location-based filtering with city/province.
 * Speeds up filters like: { "location.city": "تهران", "location.province": "تهران" }
 */
listingSchema.index(
  { "location.city": 1, "location.province": 1, createdAt: -1 },
  { sparse: true, name: "location_city_province_idx" }
);

/**
 * Compound index for geospatial + category filtering (common query pattern).
 * Speeds up: { "location.coordinates": "2dsphere", category: 1 }
 */
listingSchema.index(
  { "location.coordinates": "2dsphere", category: 1 },
  { sparse: true, name: "location_category_idx" }
);

/**
 * Full-text search across title, description, and tags.
 * Weighted so title matches rank higher than generic description text.
 * The collection "user_listings" is separate from "listings" (Craft model),
 * so this index does not conflict with craft_text_search.
 */
listingSchema.index(
  { title: "text", description: "text", tags: "text" },
  {
    weights: { title: 10, tags: 5, description: 1 },
    name: "listings_text_idx",
  },
);

/** Compound index for per-owner content sorted by recency. */
listingSchema.index({ owner: 1, createdAt: -1 });

/** Sparse index for draft linking (only indexes listings created from drafts). */
listingSchema.index({ draftId: 1 }, { sparse: true });

/** Index for optimistic concurrency control lookups. */
listingSchema.index({ _id: 1, revision: 1 });

const Listing = mongoose.model("Listing", listingSchema);

// ── PostListing discriminator ─────────────────────────────────────────────────

const PostListing = Listing.discriminator(
  "post",
  new mongoose.Schema({
    price: { type: Number, min: 0 },
    forSale: { type: Boolean, default: true },
    category: { type: String, trim: true },
    /** Free-form key/value product attributes (e.g. { material: "clay", size: "30cm" }). */
    attributes: { type: Map, of: String },
  }),
);

// ── TourListing discriminator ─────────────────────────────────────────────────

const TourListing = Listing.discriminator(
  "tour",
  new mongoose.Schema({
    /** ISO date string or Date object for when the tour starts. */
    startDate: { type: Date },
    /** ISO date string or Date object for when the tour ends. */
    endDate: { type: Date },
    /** Human-readable duration string from the wizard, e.g. "3 روز". */
    duration: { type: String, trim: true },
    durationDays: { type: Number, min: 1 },
    capacity: { type: Number, min: 1 },
    itinerary: { type: String, trim: true },
  }),
);

// ── TrainingListing discriminator ─────────────────────────────────────────────

/** Sub-schema for one weekly-recurrence slot. */
const scheduleItemSchema = new mongoose.Schema(
  {
    /** 0 = Sunday … 6 = Saturday */
    dayOfWeek: {
      type: Number,
      required: true,
      min: [0, "روز هفته باید بین ۰ تا ۶ باشد"],
      max: [6, "روز هفته باید بین ۰ تا ۶ باشد"],
    },
    startTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "فرمت زمان شروع باید HH:mm باشد"],
    },
    endTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "فرمت زمان پایان باید HH:mm باشد"],
    },
  },
  { _id: false },
);

const TrainingListing = Listing.discriminator(
  "training",
  new mongoose.Schema({
    /** Weekly recurring schedule slots (optional when using date-range form). */
    schedule: {
      type: [scheduleItemSchema],
      default: undefined,
    },
    /** Date-range style scheduling collected by the wizard. */
    startDate: { type: Date },
    endDate: { type: Date },
    duration: { type: String, trim: true },
    capacity: { type: Number, min: 1 },
    level: { type: String, trim: true },
    instructor: { type: String, trim: true },
  }),
);

// ── AcademyListing discriminator ─────────────────────────────────────────────

const AcademyListing = Listing.discriminator(
  "academy",
  new mongoose.Schema({
    addressDetails: { type: String, trim: true },
    phone: { type: String, trim: true },
    workingHours: { type: String, trim: true },
    website: { type: String, trim: true },
  }),
);

module.exports = {
  Listing,
  PostListing,
  TourListing,
  TrainingListing,
  AcademyListing,
};
