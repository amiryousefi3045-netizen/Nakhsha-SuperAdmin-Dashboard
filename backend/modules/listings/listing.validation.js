/**
 * listing.validation.js — Zod schemas and validation helpers for listings module.
 *
 * Centralized validation layer for all listing operations:
 * - Creating new listings (POST /api/listings)
 * - Updating existing listings (PATCH /api/listings/:id)
 * - Validating geospatial queries
 * - Type-specific detail validation
 *
 * Persian error messages throughout.
 */

const { z } = require("zod");

// ────────────────────────────────────────────────────────────────────────────
// GeoJSON Schemas
// ────────────────────────────────────────────────────────────────────────────

const geoPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([
    z
      .number()
      .min(-180, "طول جغرافیایی باید بین ۱۸۰- و ۱۸۰ باشد")
      .max(180, "طول جغرافیایی باید بین ۱۸۰- و ۱۸۰ باشد"),
    z
      .number()
      .min(-90, "عرض جغرافیایی باید بین ۹۰- و ۹۰ باشد")
      .max(90, "عرض جغرافیایی باید بین ۹۰- و ۹۰ باشد"),
  ]),
});

// ────────────────────────────────────────────────────────────────────────────
// Base Create Listing Schema
// ────────────────────────────────────────────────────────────────────────────

const createListingBaseSchema = z.object({
  type: z.enum(["post", "tour", "training", "academy"], {
    errorMap: () => ({
      message: "نوع آگهی باید یکی از: post, tour, training, academy باشد",
    }),
  }),
  title: z
    .string({ required_error: "عنوان الزامی است" })
    .trim()
    .min(5, "عنوان باید حداقل ۵ کاراکتر باشد")
    .max(200, "عنوان نباید بیش از ۲۰۰ کاراکتر باشد"),
  description: z
    .string({ required_error: "توضیحات الزامی است" })
    .trim()
    .min(1, "توضیحات الزامی است")
    .max(5000, "توضیحات نباید بیش از ۵۰۰۰ کاراکتر باشد"),
  tags: z.array(z.string()).optional().default([]),
  images: z.array(z.string()).optional().default([]),
  location: geoPointSchema.optional(),
  status: z.enum(["draft", "published"]).optional().default("draft"),
  details: z.record(z.string(), z.unknown()).optional().default({}),
});

// ────────────────────────────────────────────────────────────────────────────
// Type-Specific Detail Schemas (Create)
// ────────────────────────────────────────────────────────────────────────────

const TIME_HHmm = /^([01]\d|2[0-3]):([0-5]\d)$/;

const scheduleItemSchema = z.object({
  dayOfWeek: z
    .number()
    .int()
    .min(0, "روز هفته باید بین ۰ تا ۶ باشد")
    .max(6, "روز هفته باید بین ۰ تا ۶ باشد"),
  startTime: z
    .string()
    .regex(TIME_HHmm, "فرمت زمان شروع باید HH:mm باشد (مثلاً 09:00)"),
  endTime: z
    .string()
    .regex(TIME_HHmm, "فرمت زمان پایان باید HH:mm باشد (مثلاً 12:00)"),
});

const postDetailsSchema = z.object({
  price: z.number().nonnegative("قیمت نباید منفی باشد").optional(),
  forSale: z.boolean().optional(),
  category: z.string().trim().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
});

const tourDetailsSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  duration: z.string().trim().optional(),
  durationDays: z
    .number()
    .int()
    .positive("تعداد روزها باید عدد مثبت باشد")
    .optional(),
  capacity: z.number().int().positive("ظرفیت باید عدد مثبت باشد").optional(),
  itinerary: z.string().trim().optional(),
});

const trainingDetailsSchema = z.object({
  schedule: z
    .array(scheduleItemSchema)
    .min(1, "حداقل یک زمان‌بندی در برنامه الزامی است")
    .optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  duration: z.string().trim().optional(),
  capacity: z.number().int().positive("ظرفیت باید عدد مثبت باشد").optional(),
  level: z.string().trim().optional(),
  instructor: z.string().trim().optional(),
});

const academyDetailsSchema = z.object({
  addressDetails: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  workingHours: z.string().trim().optional(),
  website: z.string().trim().optional(),
});

const DETAILS_SCHEMAS = {
  post: postDetailsSchema,
  tour: tourDetailsSchema,
  training: trainingDetailsSchema,
  academy: academyDetailsSchema,
};

// ────────────────────────────────────────────────────────────────────────────
// Base Update Listing Schema
// ────────────────────────────────────────────────────────────────────────────

const updateListingBaseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "عنوان باید حداقل ۵ کاراکتر باشد")
    .max(200, "عنوان نباید بیش از ۲۰۰ کاراکتر باشد")
    .optional(),
  description: z
    .string()
    .trim()
    .min(1, "توضیحات الزامی است")
    .max(5000, "توضیحات نباید بیش از ۵۰۰۰ کاراکتر باشد")
    .optional(),
  tags: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
  location: geoPointSchema.optional(),
  revision: z.number().int().nonnegative("نسخه نباید منفی باشد").optional(),
  reason: z.string().trim().max(500).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

// ────────────────────────────────────────────────────────────────────────────
// Type-Specific Detail Schemas (Update)
// ────────────────────────────────────────────────────────────────────────────

const postUpdateDetailsSchema = z.object({
  price: z.number().nonnegative("قیمت نباید منفی باشد").optional(),
  forSale: z.boolean().optional(),
  category: z.string().trim().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
});

const tourUpdateDetailsSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  duration: z.string().trim().optional(),
  durationDays: z.number().int().positive().optional(),
  capacity: z.number().int().positive().optional(),
  itinerary: z.string().trim().optional(),
});

const trainingUpdateDetailsSchema = z.object({
  schedule: z.array(scheduleItemSchema).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  duration: z.string().trim().optional(),
  capacity: z.number().int().positive().optional(),
  level: z.string().trim().optional(),
  instructor: z.string().trim().optional(),
});

const academyUpdateDetailsSchema = z.object({
  addressDetails: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  workingHours: z.string().trim().optional(),
  website: z.string().trim().optional(),
});

const UPDATE_DETAILS_SCHEMAS = {
  post: postUpdateDetailsSchema,
  tour: tourUpdateDetailsSchema,
  training: trainingUpdateDetailsSchema,
  academy: academyUpdateDetailsSchema,
};

// ────────────────────────────────────────────────────────────────────────────
// Geospatial Query Schemas
// ────────────────────────────────────────────────────────────────────────────

const geoQuerySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusKm: z
    .number()
    .min(0.1, "شعاع باید حداقل ۰.۱ کیلومتر باشد")
    .max(50, "شعاع نباید بیش از ۵۰ کیلومتر باشد")
    .optional()
    .default(5),
  limit: z.number().int().min(1).max(500).optional().default(100),
  skip: z.number().int().nonnegative().optional().default(0),
  category: z.string().trim().optional(),
  type: z.enum(["post", "tour", "training", "academy"]).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  minPrice: z.number().nonnegative().optional(),
  maxPrice: z.number().nonnegative().optional(),
  minRating: z.number().min(0).max(5).optional(),
  owner: z.string().optional(),
  query: z.string().trim().optional(),
  verified: z.boolean().optional(),
  useCache: z.boolean().optional().default(true),
});

// ────────────────────────────────────────────────────────────────────────────
// Validation Helper Functions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse and validate data with Zod schema.
 * Returns { ok: true, data } or { ok: false, error, issues }
 *
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {unknown} value - Value to validate
 * @returns {object} Validation result
 */
function validateWithSchema(schema, value) {
  const result = schema.safeParse(value);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const firstIssue = result.error.issues[0];
  return {
    ok: false,
    error: {
      message: firstIssue?.message || "اطلاعات ورودی نامعتبر است",
      issues: result.error.issues.map((issue) => ({
        field: issue.path.join(".") || undefined,
        message: issue.message,
        code: issue.code,
      })),
    },
  };
}

/**
 * Validate base listing creation payload.
 *
 * @param {object} payload - Request body
 * @returns {object} Validation result with { ok, data?, error?, issues? }
 */
function validateCreateListing(payload) {
  return validateWithSchema(createListingBaseSchema, payload);
}

/**
 * Validate type-specific details for creation.
 *
 * @param {string} type - Listing type (post, tour, training, academy)
 * @param {object} details - Type-specific details object
 * @returns {object} Validation result
 */
function validateCreateDetails(type, details) {
  const schema = DETAILS_SCHEMAS[type];
  if (!schema) {
    return { ok: false, error: { message: "نوع آگهی نامعتبر است" } };
  }
  return validateWithSchema(schema, details || {});
}

/**
 * Validate base listing update payload.
 *
 * @param {object} payload - PATCH request body
 * @returns {object} Validation result
 */
function validateUpdateListing(payload) {
  return validateWithSchema(updateListingBaseSchema, payload);
}

/**
 * Validate type-specific details for update.
 *
 * @param {string} type - Listing type
 * @param {object} details - Type-specific details object
 * @returns {object} Validation result
 */
function validateUpdateDetails(type, details) {
  const schema = UPDATE_DETAILS_SCHEMAS[type];
  if (!schema) {
    return { ok: false, error: { message: "نوع آگهی نامعتبر است" } };
  }
  return validateWithSchema(schema, details || {});
}

/**
 * Validate geospatial query parameters.
 *
 * @param {object} params - Query parameters
 * @returns {object} Validation result
 */
function validateGeoQuery(params) {
  return validateWithSchema(geoQuerySchema, params);
}

// ────────────────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Schemas
  createListingBaseSchema,
  DETAILS_SCHEMAS,
  geoPointSchema,
  updateListingBaseSchema,
  UPDATE_DETAILS_SCHEMAS,
  geoQuerySchema,

  // Validation helpers
  validateWithSchema,
  validateCreateListing,
  validateCreateDetails,
  validateUpdateListing,
  validateUpdateDetails,
  validateGeoQuery,
};
