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
          description: "Enter token as Bearer <token>",
        },
      },
      schemas: {
        HealthResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean", example: true },
            db: { type: "string", example: "up" },
            version: { type: "string", example: "dev" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        OtpStartRequest: {
          type: "object",
          properties: {
            phone: { type: "string", example: "09123456789" },
          },
          required: ["phone"],
        },
        OtpVerifyRequest: {
          type: "object",
          properties: {
            phone: { type: "string", example: "09123456789" },
            code: { type: "string", example: "123456" },
          },
          required: ["phone", "code"],
        },
        RefreshTokenRequest: {
          type: "object",
          properties: {
            refreshToken: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiJ9...",
            },
          },
          required: ["refreshToken"],
        },
        LogoutRequest: {
          type: "object",
          properties: {
            refreshToken: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiJ9...",
            },
          },
          required: ["refreshToken"],
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string", example: "507f1f77bcf86cd799439011" },
            name: { type: "string", example: "علی احمدی" },
            phone: { type: "string", example: "09123456789" },
            handle: { type: "string", example: "ali-ahmadi" },
            role: { type: "string", example: "user" },
            avatar: { type: "string", example: "/uploads/avatar.webp" },
            bio: { type: "string", example: "صنعتگر قالی" },
            creatorType: { type: "string", example: "artisan" },
            isVerified: { type: "boolean", example: true },
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
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        CraftSummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            images: { type: "array", items: { type: "string" } },
            craftType: { type: "string" },
            price: { type: "number" },
            forSale: { type: "boolean" },
            location: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            totalLikes: { type: "number" },
            totalDislikes: { type: "number" },
            commentsCount: { type: "number" },
            distanceMeters: { type: "number" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        CraftDetail: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            images: { type: "array", items: { type: "string" } },
            artisan: { type: "object", additionalProperties: true },
            craftType: { type: "string" },
            price: { type: "number" },
            forSale: { type: "boolean" },
            tags: { type: "array", items: { type: "string" } },
            location: { type: "object", additionalProperties: true },
            views: { type: "number" },
            averageRating: { type: "number" },
            totalLikes: { type: "number" },
            totalDislikes: { type: "number" },
            liked: { type: "boolean" },
            disliked: { type: "boolean" },
            comments: {
              type: "array",
              items: { type: "object", additionalProperties: true },
            },
            commentsCount: { type: "number" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        PostCreateRequest: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            category: { type: "string" },
            price: { type: "number" },
            location: { type: "object", additionalProperties: true },
          },
          required: ["title", "description"],
        },
        PostResponse: {
          type: "object",
          properties: {
            item: { type: "object", additionalProperties: true },
          },
        },
        UploadResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {
              type: "object",
              properties: {
                files: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      url: { type: "string" },
                      path: { type: "string" },
                      width: { type: "number" },
                      height: { type: "number" },
                      size: { type: "number" },
                      mime: { type: "string" },
                    },
                  },
                },
              },
            },
            reqId: { type: "string" },
          },
        },
        DraftCreateRequest: {
          type: "object",
          properties: {
            type: { type: "string", example: "post" },
            currentStep: { type: "number", example: 1 },
            isCompleted: { type: "boolean", example: false },
            data: { type: "object" },
          },
          required: ["type"],
        },
        DraftUpdateRequest: {
          type: "object",
          properties: {
            _version: { type: "number" },
            currentStep: { type: "number" },
            data: { type: "object" },
          },
          required: ["_version"],
        },
        BoundarySearchRequest: {
          type: "object",
          properties: {
            polygon: {
              type: "array",
              items: {
                type: "array",
                items: { type: "number" },
                minItems: 2,
                maxItems: 2,
              },
            },
            filters: {
              type: "object",
              properties: {
                category: { type: "string" },
                type: { type: "string" },
                status: { type: "string" },
                minPrice: { type: "number" },
                maxPrice: { type: "number" },
                minRating: { type: "number" },
              },
            },
            pagination: {
              type: "object",
              properties: {
                limit: { type: "number", example: 100 },
                skip: { type: "number", example: 0 },
              },
            },
          },
          required: ["polygon"],
        },
        GenericListResponse: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: { type: "object", additionalProperties: true },
            },
            total: { type: "integer" },
            page: { type: "integer" },
            limit: { type: "integer" },
          },
        },
      },
    },
    tags: [
      { name: "Health", description: "بررسی سلامت سرویس" },
      { name: "Auth", description: "احراز هویت و مدیریت جلسات" },
      { name: "Users", description: "مدیریت پروفایل کاربران" },
      { name: "Uploads", description: "آپلود فایل‌ها و تصاویر" },
      { name: "Crafts", description: "محصولات صنایع دستی" },
      { name: "Drafts", description: "ذخیره خودکار و پیش‌نویس‌ها" },
      { name: "Listings", description: "جستجو و داده‌های جغرافیایی" },
      { name: "Posts", description: "پست‌ها و محتوا" },
    ],
    paths: {
      "/health": {
        get: {
          summary: "Health check",
          tags: ["Health"],
          responses: {
            200: {
              description: "Health data",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                },
              },
            },
          },
        },
      },
      "/api/health": {
        get: {
          summary: "Health check alias",
          tags: ["Health"],
          responses: {
            200: {
              description: "Health data",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                },
              },
            },
          },
        },
      },
      "/auth/register": {
        post: {
          summary: "Legacy register endpoint",
          tags: ["Auth"],
          deprecated: true,
          responses: {
            410: { description: "Deprecated endpoint" },
          },
        },
      },
      "/auth/login": {
        post: {
          summary: "Legacy login endpoint",
          tags: ["Auth"],
          deprecated: true,
          responses: {
            410: { description: "Deprecated endpoint" },
          },
        },
      },
      "/api/auth/me": {
        get: {
          summary: "Get current authenticated user",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Current user data",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { user: { $ref: "#/components/schemas/User" } },
                  },
                },
              },
            },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/auth/otp/start": {
        post: {
          summary: "Start OTP authentication",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OtpStartRequest" },
              },
            },
          },
          responses: {
            200: { description: "OTP code sent" },
            400: { description: "Bad request" },
            429: { description: "Too many requests" },
          },
        },
      },
      "/api/auth/otp/verify": {
        post: {
          summary: "Verify OTP and sign in",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OtpVerifyRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Authentication result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      accessToken: { type: "string" },
                      refreshToken: { type: "string" },
                      refreshExpiresAt: { type: "string", format: "date-time" },
                      user: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
            400: { description: "Bad request" },
            429: { description: "Too many requests" },
          },
        },
      },
      "/api/auth/refresh": {
        post: {
          summary: "Refresh access token",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RefreshTokenRequest" },
              },
            },
          },
          responses: {
            200: {
              description: "Token refreshed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      accessToken: { type: "string" },
                      refreshToken: { type: "string" },
                      refreshExpiresAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            400: { description: "Bad request" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/auth/logout": {
        post: {
          summary: "Logout from current session",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LogoutRequest" },
              },
            },
          },
          responses: {
            200: { description: "Logged out" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/auth/logout-all": {
        post: {
          summary: "Logout from all devices",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "All sessions revoked" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/auth/sessions": {
        get: {
          summary: "List active authentication sessions",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Session list",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      sessions: {
                        type: "array",
                        items: { type: "object", additionalProperties: true },
                      },
                    },
                  },
                },
              },
            },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/crafts": {
        get: {
          summary: "List crafts",
          tags: ["Crafts"],
          parameters: [
            {
              name: "page",
              in: "query",
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 50 },
            },
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "craftType", in: "query", schema: { type: "string" } },
            { name: "forSale", in: "query", schema: { type: "boolean" } },
          ],
          responses: {
            200: {
              description: "Paged craft summary list",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/GenericListResponse" },
                },
              },
            },
          },
        },
        post: {
          summary: "Create a new craft",
          tags: ["Crafts"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    craftType: { type: "string" },
                    price: { type: "number" },
                    forSale: { type: "boolean" },
                    location: { type: "object", additionalProperties: true },
                    images: { type: "array", items: { type: "string" } },
                    tags: { type: "array", items: { type: "string" } },
                  },
                  required: ["title", "description", "craftType", "price"],
                },
              },
            },
          },
          responses: {
            201: { description: "Craft created" },
            400: { description: "Validation error" },
            403: { description: "Forbidden" },
          },
        },
      },
      "/api/crafts/near": {
        get: {
          summary: "Search crafts by proximity",
          tags: ["Crafts"],
          parameters: [
            {
              name: "lng",
              in: "query",
              schema: { type: "number" },
              required: true,
            },
            {
              name: "lat",
              in: "query",
              schema: { type: "number" },
              required: true,
            },
            {
              name: "radiusKm",
              in: "query",
              schema: { type: "number", default: 10 },
            },
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "min", in: "query", schema: { type: "number" } },
            { name: "max", in: "query", schema: { type: "number" } },
          ],
          responses: {
            200: {
              description: "Nearby crafts",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: { $ref: "#/components/schemas/CraftSummary" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/crafts/seed/dev": {
        get: {
          summary: "Create seed data for development",
          tags: ["Crafts"],
          description:
            "Development-only endpoint to create sample crafts and artisans.",
          responses: {
            200: { description: "Seed created" },
            403: { description: "Forbidden in production" },
          },
        },
      },
      "/api/crafts/{id}": {
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        get: {
          summary: "Get craft detail",
          tags: ["Crafts"],
          responses: {
            200: {
              description: "Craft detail",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CraftDetail" },
                },
              },
            },
            404: { description: "Not found" },
          },
        },
        put: {
          summary: "Update craft",
          tags: ["Crafts"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          responses: {
            200: { description: "Craft updated" },
            403: { description: "Forbidden" },
            404: { description: "Not found" },
          },
        },
        delete: {
          summary: "Delete craft",
          tags: ["Crafts"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Craft deleted" },
            404: { description: "Not found" },
          },
        },
      },
      "/api/crafts/{id}/like": {
        post: {
          summary: "Like or unlike a craft",
          tags: ["Crafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Like toggled" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/crafts/{id}/dislike": {
        post: {
          summary: "Dislike or remove dislike from a craft",
          tags: ["Crafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Dislike toggled" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/crafts/{id}/comments": {
        post: {
          summary: "Add a comment to a craft",
          tags: ["Crafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    rating: { type: "number", minimum: 1, maximum: 5 },
                  },
                  required: ["text"],
                },
              },
            },
          },
          responses: {
            201: { description: "Comment created" },
            400: { description: "Validation error" },
          },
        },
      },
      "/api/crafts/{id}/comments/{commentId}": {
        delete: {
          summary: "Delete a craft comment",
          tags: ["Crafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "commentId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Comment deleted" },
            404: { description: "Not found" },
          },
        },
      },
      "/api/crafts/{id}/barter/propose": {
        post: {
          summary: "Propose a barter for a craft",
          tags: ["Crafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    itemsOffered: { type: "array", items: { type: "string" } },
                    message: { type: "string" },
                  },
                  required: ["itemsOffered"],
                },
              },
            },
          },
          responses: {
            201: { description: "Barter proposal sent" },
            400: { description: "Validation error" },
          },
        },
      },
      "/api/crafts/{id}/barter/{proposalId}/status": {
        patch: {
          summary: "Update barter proposal status",
          tags: ["Crafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "proposalId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "approved" },
                  },
                  required: ["status"],
                },
              },
            },
          },
          responses: {
            200: { description: "Proposal status updated" },
            400: { description: "Invalid status" },
          },
        },
      },
      "/api/posts": {
        post: {
          summary: "Create a new post",
          tags: ["Posts"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PostCreateRequest" },
              },
            },
          },
          responses: {
            201: {
              description: "Post created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PostResponse" },
                },
              },
            },
            400: { description: "Validation error" },
          },
        },
      },
      "/api/posts/{id}/images": {
        post: {
          summary: "Upload images to a post",
          tags: ["Posts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    images: {
                      type: "array",
                      items: { type: "string", format: "binary" },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Images uploaded",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PostResponse" },
                },
              },
            },
            400: { description: "Upload error" },
          },
        },
      },
      "/api/users/me/avatar": {
        post: {
          summary: "Upload current user's avatar",
          tags: ["Users"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    avatar: { type: "string", format: "binary" },
                  },
                  required: ["avatar"],
                },
              },
            },
          },
          responses: {
            200: { description: "Avatar uploaded" },
            400: { description: "Validation error" },
          },
        },
      },
      "/api/users/me": {
        patch: {
          summary: "Update current user profile",
          tags: ["Users"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    bio: { type: "string" },
                    avatar: { type: ["string", "null"] },
                    location: { type: "object", additionalProperties: true },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Profile updated" },
            400: { description: "Validation error" },
          },
        },
      },
      "/api/users/handle/{handle}": {
        get: {
          summary: "Get user profile by handle",
          tags: ["Users"],
          parameters: [
            {
              name: "handle",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "User profile",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/User" },
                },
              },
            },
            404: { description: "Not found" },
          },
        },
      },
      "/api/users/handle/{handle}/content": {
        get: {
          summary: "Get published content for a user handle",
          tags: ["Users"],
          parameters: [
            {
              name: "handle",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "type",
              in: "query",
              required: true,
              schema: { type: "string", example: "posts" },
            },
          ],
          responses: {
            200: {
              description: "Content items",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: { type: "object", additionalProperties: true },
                      },
                    },
                  },
                },
              },
            },
            400: { description: "Invalid request" },
            404: { description: "Not found" },
          },
        },
      },
      "/api/uploads": {
        post: {
          summary: "Upload a file",
          tags: ["Uploads"],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: { file: { type: "string", format: "binary" } },
                  required: ["file"],
                },
              },
            },
          },
          responses: {
            201: {
              description: "File uploaded",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UploadResponse" },
                },
              },
            },
            400: { description: "Bad request" },
          },
        },
      },
      "/api/listings/draft": {
        post: {
          summary: "Create a new listing draft",
          tags: ["Drafts"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DraftCreateRequest" },
              },
            },
          },
          responses: {
            201: { description: "Draft created" },
            400: { description: "Validation error" },
          },
        },
        get: {
          summary: "List active drafts for current user",
          tags: ["Drafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 10 },
            },
            {
              name: "skip",
              in: "query",
              schema: { type: "integer", default: 0 },
            },
          ],
          responses: {
            200: {
              description: "Draft list",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/GenericListResponse" },
                },
              },
            },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/listings/{id}/draft": {
        patch: {
          summary: "Update a draft",
          tags: ["Drafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DraftUpdateRequest" },
              },
            },
          },
          responses: {
            200: { description: "Draft updated" },
            400: { description: "Validation error" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/listings/draft/latest": {
        get: {
          summary: "Get the latest draft for the current user",
          tags: ["Drafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "type",
              in: "query",
              schema: { type: "string", example: "post" },
            },
          ],
          responses: {
            200: { description: "Latest draft" },
            404: { description: "Not found" },
          },
        },
      },
      "/api/listings/draft/{id}": {
        get: {
          summary: "Get a draft by ID",
          tags: ["Drafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Draft retrieved" },
            404: { description: "Not found" },
          },
        },
        delete: {
          summary: "Delete a draft",
          tags: ["Drafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Draft deleted" },
            404: { description: "Not found" },
          },
        },
      },
      "/api/listings/{draftId}/publish": {
        post: {
          summary: "Publish a draft into a listing",
          tags: ["Drafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "draftId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          responses: {
            201: { description: "Draft published" },
            400: { description: "Validation error" },
          },
        },
      },
      "/api/listings/draft/stats/{userId}": {
        get: {
          summary: "Get listing draft statistics for a user",
          tags: ["Drafts"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Draft statistics" },
            401: { description: "Unauthorized" },
          },
        },
      },
      "/api/listings/near": {
        get: {
          summary: "Find nearby listings",
          tags: ["Listings"],
          parameters: [
            {
              name: "lat",
              in: "query",
              schema: { type: "number" },
              required: true,
            },
            {
              name: "lng",
              in: "query",
              schema: { type: "number" },
              required: true,
            },
            {
              name: "radiusKm",
              in: "query",
              schema: { type: "number", default: 5 },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 100 },
            },
            {
              name: "skip",
              in: "query",
              schema: { type: "integer", default: 0 },
            },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "type", in: "query", schema: { type: "string" } },
            {
              name: "status",
              in: "query",
              schema: { type: "string", example: "published" },
            },
            { name: "minPrice", in: "query", schema: { type: "number" } },
            { name: "maxPrice", in: "query", schema: { type: "number" } },
            { name: "minRating", in: "query", schema: { type: "number" } },
            { name: "query", in: "query", schema: { type: "string" } },
          ],
          responses: { 200: { description: "Nearby listing markers" } },
        },
      },
      "/api/listings/near/stats": {
        get: {
          summary: "Get nearby listing statistics",
          tags: ["Listings"],
          parameters: [
            {
              name: "lat",
              in: "query",
              schema: { type: "number" },
              required: true,
            },
            {
              name: "lng",
              in: "query",
              schema: { type: "number" },
              required: true,
            },
            {
              name: "radiusKm",
              in: "query",
              schema: { type: "number", default: 5 },
            },
          ],
          responses: { 200: { description: "Nearby listing statistics" } },
        },
      },
      "/api/listings/heatmap": {
        get: {
          summary: "Get heatmap aggregation for listings",
          tags: ["Listings"],
          parameters: [
            {
              name: "lat",
              in: "query",
              schema: { type: "number" },
              required: true,
            },
            {
              name: "lng",
              in: "query",
              schema: { type: "number" },
              required: true,
            },
            {
              name: "radiusKm",
              in: "query",
              schema: { type: "number", default: 5 },
            },
            {
              name: "gridSize",
              in: "query",
              schema: { type: "integer", default: 10 },
            },
            {
              name: "aggregateBy",
              in: "query",
              schema: { type: "string", default: "count" },
            },
          ],
          responses: { 200: { description: "Heatmap data" } },
        },
      },
      "/api/listings/clusters": {
        get: {
          summary: "Get listing clusters for map visualization",
          tags: ["Listings"],
          parameters: [
            {
              name: "lat",
              in: "query",
              schema: { type: "number" },
              required: true,
            },
            {
              name: "lng",
              in: "query",
              schema: { type: "number" },
              required: true,
            },
            {
              name: "radiusKm",
              in: "query",
              schema: { type: "number", default: 5 },
            },
            {
              name: "zoomLevel",
              in: "query",
              schema: { type: "integer", default: 12 },
            },
          ],
          responses: { 200: { description: "Cluster data" } },
        },
      },
      "/api/listings/within-boundary": {
        post: {
          summary: "Search listings within a geographic polygon",
          tags: ["Listings"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BoundarySearchRequest" },
              },
            },
          },
          responses: {
            200: { description: "Boundary search results" },
            400: { description: "Validation error" },
          },
        },
      },
    },
  },
  apis: [],
};

module.exports = swaggerJsdoc(swaggerOptions);
