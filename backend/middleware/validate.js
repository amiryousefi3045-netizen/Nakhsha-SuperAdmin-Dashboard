const { z } = require("zod");
const { createErrorResponse } = require("../utils/userDto");

/**
 * Creates a validation middleware using a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {('body'|'query'|'params')} source - Request property to validate
 */
const validate = (schema, source = "body") => {
  return (req, res, next) => {
    const data = req[source];
    const result = schema.safeParse(data);

    if (result.success) {
      // Replace the request data with parsed results
      req[source] = result.data;
      next();
    } else {
      // Extract the first issue for the main message
      const firstIssue = result.error.issues[0];
      const message = firstIssue
        ? firstIssue.message
        : "اطلاعات ورودی نامعتبر است";

      // Format details
      const details = {
        issues: result.error.issues.map((issue) => ({
          field: issue.path.join(".") || undefined,
          message: issue.message,
          code: issue.code,
        })),
      };

      // Add field to details if there's a clear primary field from first issue
      if (firstIssue && firstIssue.path && firstIssue.path.length > 0) {
        details.field = firstIssue.path.join(".");
      }

      return res
        .status(400)
        .json(createErrorResponse("VALIDATION_ERROR", message, details));
    }
  };
};

// Schema for GeoJSON Point
const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([
    z.number().min(-180).max(180), // longitude
    z.number().min(-90).max(90), // latitude
  ]),
});

// Schema for location with optional geometry
const locationSchema = z
  .object({
    city: z.string().optional(),
    neighborhood: z.string().optional(),
    geometry: pointSchema.optional(),
    // Support legacy coordinates array format
    coordinates: z
      .tuple([
        z.number().min(-180).max(180), // longitude
        z.number().min(-90).max(90), // latitude
      ])
      .optional(),
  })
  .optional();

// Schema for creating a new craft
const createCraftSchema = z.object({
  title: z.string().min(3, "عنوان باید حداقل ۳ کاراکتر باشد"),
  description: z.string().min(10, "توضیحات باید حداقل ۱۰ کاراکتر باشد"),
  craftType: z
    .enum(
      [
        "carpet",
        "pottery",
        "metalwork",
        "woodwork",
        "textile",
        "jewelry",
        "leather",
        "other",
      ],
      {
        errorMap: () => ({ message: "دسته‌بندی نامعتبر است" }),
      },
    )
    .optional(),
  price: z.number().nonnegative().optional(),
  images: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  forSale: z.boolean().optional(),
  location: locationSchema,
  isPublished: z.boolean().optional(),
  culturalStory: z.string().optional(),
  sale: z.any().optional(),
  barter: z.any().optional(),
});

// Schema for near query parameters
const nearQuerySchema = z
  .object({
    lng: z.coerce.number().min(-180).max(180).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    radiusKm: z.coerce.number().positive().default(10),
    q: z.string().optional(),
    category: z
      .enum([
        "carpet",
        "pottery",
        "metalwork",
        "woodwork",
        "textile",
        "jewelry",
        "leather",
        "other",
      ])
      .optional(),
    min: z.coerce.number().nonnegative().optional(),
    max: z.coerce.number().nonnegative().optional(),
  })
  .refine((data) => (data.lng === undefined) === (data.lat === undefined), {
    message: "مختصات جغرافیایی باید شامل هر دو مقدار طول و عرض باشد",
    path: ["location"],
  });

// Schema for creating a new post
const createPostSchema = z.object({
  title: z
    .string()
    .min(1, "عنوان الزامی است")
    .max(80, "عنوان نباید بیش از ۸۰ کاراکتر باشد")
    .trim(),
  description: z
    .string()
    .min(1, "توضیحات الزامی است")
    .max(2000, "توضیحات نباید بیش از ۲۰۰۰ کاراکتر باشد")
    .trim(),
  category: z.string().trim().optional(),
  price: z.number().nonnegative().optional(),
  location: z
    .object({
      city: z.string().trim().optional(),
      neighborhood: z.string().trim().optional(),
      geometry: pointSchema.optional(),
      // Support legacy coordinates format for backward compatibility
      coordinates: z
        .tuple([
          z.number().min(-180).max(180), // longitude
          z.number().min(-90).max(90), // latitude
        ])
        .optional(),
    })
    .optional(),
});

module.exports = {
  validate,
  createCraftSchema,
  createPostSchema,
  nearQuerySchema,
};
