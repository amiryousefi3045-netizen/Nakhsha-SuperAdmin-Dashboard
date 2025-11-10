const { z } = require('zod');

/**
 * Creates a validation middleware using a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {('body'|'query'|'params')} source - Request property to validate
 */
const validate = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      // Parse and transform the data
      const parsed = await schema.parseAsync(req[source]);
      
      // Replace the request data with parsed results
      req[source] = parsed;
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Flatten and format Zod errors
        const errors = error.flatten();
        return res.status(400).json({
          message: 'اطلاعات ورودی نامعتبر است',
          errors: {
            fieldErrors: errors.fieldErrors,
            formErrors: errors.formErrors
          }
        });
      }
      next(error);
    }
  };
};

// Schema for GeoJSON Point
const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([
    z.number().min(-180).max(180), // longitude
    z.number().min(-90).max(90)    // latitude
  ])
});

// Schema for creating a new craft
const createCraftSchema = z.object({
  title: z.string().min(3, 'عنوان باید حداقل ۳ کاراکتر باشد'),
  description: z.string().min(10, 'توضیحات باید حداقل ۱۰ کاراکتر باشد'),
  category: z.enum([
    'carpet', 'pottery', 'metalwork', 'woodwork', 
    'textile', 'jewelry', 'leather', 'other'
  ], {
    errorMap: () => ({ message: 'دسته‌بندی نامعتبر است' })
  }),
  price: z.number().nonnegative().optional(),
  images: z.array(z.string()).optional(),
  city: z.string().optional(),
  location: pointSchema.optional()
});

// Schema for near query parameters
const nearQuerySchema = z.object({
  lng: z.coerce.number()
    .min(-180).max(180)
    .optional(),
  lat: z.coerce.number()
    .min(-90).max(90)
    .optional(),
  radiusKm: z.coerce.number()
    .positive()
    .default(10),
  q: z.string().optional(),
  category: z.enum([
    'carpet', 'pottery', 'metalwork', 'woodwork', 
    'textile', 'jewelry', 'leather', 'other'
  ]).optional(),
  min: z.coerce.number().nonnegative().optional(),
  max: z.coerce.number().nonnegative().optional()
}).refine(
  data => (data.lng === undefined) === (data.lat === undefined),
  {
    message: 'مختصات جغرافیایی باید شامل هر دو مقدار طول و عرض باشد',
    path: ['location']
  }
);

module.exports = {
  validate,
  createCraftSchema,
  nearQuerySchema
};