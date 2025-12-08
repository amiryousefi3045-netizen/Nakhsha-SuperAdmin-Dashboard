const swaggerJsdoc = require("swagger-jsdoc");

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Nakhsha API",
      version: "1.0.0",
      description: "نخشا - API پلتفرم صنایع دستی و فرهنگی ایران",
      contact: {
        name: "Nakhsha Team",
        url: "https://nakhsha.ir",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Development server",
      },
      {
        url: "https://api.nakhsha.ir",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            name: { type: "string", example: "علی احمدی" },
            email: { type: "string", example: "ali@example.com" },
            phone: { type: "string", example: "09123456789" },
            role: {
              type: "string",
              enum: ["user", "artisan", "admin"],
              example: "user",
            },
            isVerified: { type: "boolean", example: false },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Craft: {
          type: "object",
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            title: { type: "string", example: "قالی دستباف کاشان" },
            description: {
              type: "string",
              example: "قالی دستباف با نقوش سنتی کاشانی",
            },
            kind: {
              type: "string",
              enum: ["artwork", "class", "service"],
              example: "artwork",
            },
            craftType: {
              type: "string",
              enum: [
                "carpet",
                "pottery",
                "metalwork",
                "woodwork",
                "textile",
                "jewelry",
                "leather",
                "other",
              ],
              example: "carpet",
            },
            price: { type: "number", example: 50000000 },
            currency: { type: "string", example: "IRR" },
            forSale: { type: "boolean", example: true },
            location: {
              type: "object",
              properties: {
                city: { type: "string", example: "اصفهان" },
                neighborhood: { type: "string", example: "نقش جهان" },
                geometry: {
                  type: "object",
                  properties: {
                    type: { type: "string", example: "Point" },
                    coordinates: {
                      type: "array",
                      items: { type: "number" },
                      example: [51.6746, 32.6546],
                    },
                  },
                },
              },
            },
            images: {
              type: "array",
              items: { type: "string" },
              example: ["/uploads/image1.jpg"],
            },
            tags: {
              type: "array",
              items: { type: "string" },
              example: ["قالی", "دستباف", "کاشان"],
            },
            author: { type: "string", example: "507f1f77bcf86cd799439011" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["fail", "error"],
              example: "fail",
            },
            message: { type: "string", example: "خطایی رخ داده است" },
            errors: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
    },
    tags: [
      {
        name: "Auth",
        description: "عملیات احراز هویت و مدیریت کاربران",
      },
      {
        name: "Crafts",
        description: "مدیریت محصولات صنایع دستی",
      },
      {
        name: "Users",
        description: "مدیریت پروفایل کاربران",
      },
      {
        name: "Uploads",
        description: "آپلود فایل‌ها و تصاویر",
      },
      {
        name: "Health",
        description: "بررسی سلامت سرویس",
      },
    ],
  },
  apis: ["./routes/*.js", "./models/*.js"],
};

module.exports = swaggerJsdoc(swaggerOptions);
