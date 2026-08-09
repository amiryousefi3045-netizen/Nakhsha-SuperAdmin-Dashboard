const { z } = require("zod");

/**
 * Draft Validation Schemas using Zod
 * Supports multi-step forms with partial updates
 * Reuses logic from listingValidation.js but allows nullable/undefined fields
 */

// Base draft schema - fields common to all draft types
const baseDraftSchema = z.object({
  type: z.enum(["post", "tour", "training", "academy"]),
  currentStep: z.number().int().min(1).default(1).optional(),
  isCompleted: z.boolean().default(false).optional(),
  title: z.string().min(5).max(200).optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
  location: z
    .object({
      type: z.literal("Point"),
      coordinates: z.tuple([z.number(), z.number()]),
    })
    .optional(),
});

// ========== CREATE DRAFT SCHEMAS ==========
// When creating a new draft, only type is required

const createPostDraftSchema = baseDraftSchema.extend({
  type: z.literal("post"),
  price: z.number().positive().optional(),
  forSale: z.boolean().optional(),
  category: z.string().optional(),
  attributes: z.record(z.any()).optional(),
});

const createTourDraftSchema = baseDraftSchema.extend({
  type: z.literal("tour"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  duration: z.string().optional(),
  durationDays: z.number().positive().optional(),
  capacity: z.number().positive().optional(),
  itinerary: z.array(z.string()).optional(),
});

const createTrainingDraftSchema = baseDraftSchema.extend({
  type: z.literal("training"),
  schedule: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  duration: z.string().optional(),
  capacity: z.number().positive().optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  instructor: z.string().optional(),
});

const createAcademyDraftSchema = baseDraftSchema.extend({
  type: z.literal("academy"),
  addressDetails: z.string().optional(),
  phone: z.string().optional(),
  workingHours: z.string().optional(),
  website: z.string().url().optional(),
});

const createDraftSchema = z.discriminatedUnion("type", [
  createPostDraftSchema,
  createTourDraftSchema,
  createTrainingDraftSchema,
  createAcademyDraftSchema,
]);

// ========== PARTIAL UPDATE DRAFT SCHEMAS ==========
// For autosave: ANY field can be null/undefined (partial form data)

const partialUpdatePostDraftSchema = baseDraftSchema
  .extend({
    type: z.literal("post"),
    price: z.number().positive().optional(),
    forSale: z.boolean().optional(),
    category: z.string().optional(),
    attributes: z.record(z.any()).optional(),
  })
  .partial();

const partialUpdateTourDraftSchema = baseDraftSchema
  .extend({
    type: z.literal("tour"),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    duration: z.string().optional(),
    durationDays: z.number().positive().optional(),
    capacity: z.number().positive().optional(),
    itinerary: z.array(z.string()).optional(),
  })
  .partial();

const partialUpdateTrainingDraftSchema = baseDraftSchema
  .extend({
    type: z.literal("training"),
    schedule: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    duration: z.string().optional(),
    capacity: z.number().positive().optional(),
    level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
    instructor: z.string().optional(),
  })
  .partial();

const partialUpdateAcademyDraftSchema = baseDraftSchema
  .extend({
    type: z.literal("academy"),
    addressDetails: z.string().optional(),
    phone: z.string().optional(),
    workingHours: z.string().optional(),
    website: z.string().url().optional(),
  })
  .partial();

// Partial update schema for autosave: ANY field optional, `type` NOT required.
// Autosave payloads are partial form data and may legitimately omit the
// discriminator key, so a discriminatedUnion is unsuitable here (zod v4 throws
// "Duplicate discriminator value" when the discriminator key is missing).
const partialUpdateDraftSchema = z
  .object({
    type: z.enum(["post", "tour", "training", "academy"]).optional(),
    currentStep: z.number().int().min(1).optional(),
    isCompleted: z.boolean().optional(),
    title: z.string().min(5).max(200).optional(),
    description: z.string().max(5000).optional(),
    tags: z.array(z.string()).optional(),
    images: z.array(z.string()).optional(),
    location: z
      .object({
        type: z.literal("Point"),
        coordinates: z.tuple([z.number(), z.number()]),
      })
      .optional(),
    price: z.number().positive().optional(),
    forSale: z.boolean().optional(),
    category: z.string().optional(),
    attributes: z.record(z.any()).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    duration: z.string().optional(),
    durationDays: z.number().positive().optional(),
    capacity: z.number().positive().optional(),
    itinerary: z.array(z.string()).optional(),
    schedule: z.string().optional(),
    level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
    instructor: z.string().optional(),
    addressDetails: z.string().optional(),
    phone: z.string().optional(),
    workingHours: z.string().optional(),
    website: z.string().url().optional(),
  })
  .optional();

// ========== OPTIMISTIC LOCK SCHEMA ==========
// Validates incoming _version for concurrency control

const optimisticLockSchema = z.object({
  _version: z.number().int().nonnegative(),
});

// ========== AUTOSAVE REQUEST SCHEMA ==========
// Full autosave payload: includes version check + partial data + step tracking

const autosaveDraftSchema = z.object({
  _version: z.number().int().nonnegative(), // Client's current version
  currentStep: z.number().int().min(1).optional(),
  data: partialUpdateDraftSchema, // All fields optional
  changeLog: z.array(z.string()).optional(), // Track which fields changed on client
});

// ========== PUBLISH DRAFT SCHEMA ==========
// When promoting draft to listing, validate required fields are present

const publishDraftSchema = z.object({
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  type: z.enum(["post", "tour", "training", "academy"]),
  // Type-specific required fields
  price: z.number().positive().optional(), // Required if type === 'post'
  startDate: z.string().datetime().optional(), // Required if type === 'tour'
  capacity: z.number().positive().optional(), // Required for tour, training
});

// ========== HELPER VALIDATORS ==========

/**
 * Validate that draft has required fields for publishing based on its type
 * @param {object} draft - Draft document
 * @param {string} type - Draft type (post, tour, etc.)
 * @returns {object} Validation result { valid: bool, missingFields: string[] }
 */
const validateDraftForPublish = (draft, type) => {
  const missingFields = [];

  // Common required fields
  if (!draft.title) missingFields.push("title");
  if (!draft.description) missingFields.push("description");

  // Type-specific required fields
  if (type === "post" && !draft.price) missingFields.push("price");
  if (type === "tour") {
    if (!draft.startDate) missingFields.push("startDate");
    if (!draft.endDate) missingFields.push("endDate");
    if (!draft.capacity) missingFields.push("capacity");
  }
  if (type === "training") {
    if (!draft.capacity) missingFields.push("capacity");
  }
  if (type === "academy") {
    if (!draft.addressDetails) missingFields.push("addressDetails");
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
};

/**
 * Detect which fields changed between old and new data
 * @param {object} oldData - Previous state
 * @param {object} newData - Current state (partial)
 * @returns {object} { changedFields: string[], hasChanges: bool }
 */
const detectChanges = (oldData, newData) => {
  const changedFields = [];
  let hasChanges = false;

  // Iterate through new data and check if it differs from old
  Object.keys(newData || {}).forEach((key) => {
    const oldValue = oldData?.[key];
    const newValue = newData[key];

    // Simple comparison (deep comparison not needed for draft fields)
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changedFields.push(key);
      hasChanges = true;
    }
  });

  return { changedFields, hasChanges };
};

module.exports = {
  createDraftSchema,
  partialUpdateDraftSchema,
  optimisticLockSchema,
  autosaveDraftSchema,
  publishDraftSchema,
  baseDraftSchema,
  createPostDraftSchema,
  createTourDraftSchema,
  createTrainingDraftSchema,
  createAcademyDraftSchema,
  partialUpdatePostDraftSchema,
  partialUpdateTourDraftSchema,
  partialUpdateTrainingDraftSchema,
  partialUpdateAcademyDraftSchema,
  validateDraftForPublish,
  detectChanges,
};
