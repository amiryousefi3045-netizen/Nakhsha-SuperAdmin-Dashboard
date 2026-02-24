/**
 * listingValidation.js
 *
 * Zod schemas for validating POST /api/listings request bodies.
 *
 * Strategy:
 *   1. Validate the common base fields (type, title, description, …).
 *   2. Let the route handler pick the right per-type "details" schema and
 *      validate details separately so error messages are more precise.
 */
const { z } = require("zod");

// ── GeoJSON Point ─────────────────────────────────────────────────────────────

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

// ── Base body schema ──────────────────────────────────────────────────────────

/**
 * Validates the fields common to all listing types.
 * The `details` field is left as a loose object here; type-specific
 * validation is applied afterwards in the route handler.
 */
const createListingBaseSchema = z.object({
  type: z.enum(["post", "tour", "training", "academy"], {
    error: "نوع آگهی باید یکی از: post, tour, training, academy باشد",
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
  /** Optional GeoJSON Point {type:'Point', coordinates:[lng,lat]} */
  location: geoPointSchema.optional(),
  status: z.enum(["draft", "published"]).optional().default("draft"),
  /**
   * Loose container for type-specific fields.
   * The per-type schemas below are applied in the route handler after the
   * base schema passes.
   */
  details: z.record(z.string(), z.unknown()).optional().default({}),
});

// ── Per-type details schemas ──────────────────────────────────────────────────

const TIME_HHmm = /^([01]\d|2[0-3]):([0-5]\d)$/;

const postDetailsSchema = z.object({
  price: z.number().nonnegative("قیمت نباید منفی باشد").optional(),
  forSale: z.boolean().optional(),
  category: z.string().trim().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
});

const tourDetailsSchema = z.object({
  /** ISO date string, e.g. "2026-05-10" or "2026-05-10T09:00:00Z" */
  startDate: z.string().optional(),
  durationDays: z
    .number()
    .int()
    .positive("تعداد روزها باید عدد مثبت باشد")
    .optional(),
  capacity: z.number().int().positive("ظرفیت باید عدد مثبت باشد").optional(),
  itinerary: z.string().trim().optional(),
});

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

const trainingDetailsSchema = z.object({
  schedule: z
    .array(scheduleItemSchema)
    .min(1, "حداقل یک زمان‌بندی در برنامه الزامی است"),
  level: z.string().trim().optional(),
  instructor: z.string().trim().optional(),
});

const academyDetailsSchema = z.object({
  addressDetails: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  workingHours: z.string().trim().optional(),
  website: z.string().trim().optional(),
});

/** Map from listing type to its details validation schema. */
const DETAILS_SCHEMAS = {
  post: postDetailsSchema,
  tour: tourDetailsSchema,
  training: trainingDetailsSchema,
  academy: academyDetailsSchema,
};

// ── Exported helpers ──────────────────────────────────────────────────────────

module.exports = {
  createListingBaseSchema,
  DETAILS_SCHEMAS,
  geoPointSchema,
};
