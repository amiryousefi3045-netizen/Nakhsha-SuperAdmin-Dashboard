const request = require("supertest");
const mongoose = require("mongoose");
const Draft = require("../models/Draft");
const User = require("../models/User");
const { Listing } = require("../models/Listing");
const DraftService = require("../services/DraftService");
const DraftRepository = require("../repository/DraftRepository");
const jwt = require("jsonwebtoken");

// Mock server setup (adjust path based on your test runner config)
let app;
let testUserId;
let testUser;
let authToken;

describe("Draft Autosave System - Integration Tests", () => {
  beforeAll(async () => {
    // Connect to test database
    const testDbUri =
      process.env.MONGODB_TEST_URI ||
      process.env.MONGODB_URI ||
      "mongodb://127.0.0.1:27017/nakhsha_test";
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(testDbUri, {
        serverSelectionTimeoutMS: 5000,
      });
    }

    // Create test user
    testUser = await User.create({
      name: "Test User",
      phone: "09120000100",
      role: "user",
    });
    testUserId = testUser._id.toString();

    // Import app after DB connection (ensures .env / JWT_SECRET are loaded
    // before the token is signed, so sign and verify use the same secret)
    app = require("../server");

    // Generate auth token
    authToken = jwt.sign(
      { id: testUserId, role: "user" },
      process.env.JWT_SECRET || "test-secret",
    );
  });

  afterAll(async () => {
    // Clean up
    await User.deleteMany({});
    await Draft.deleteMany({});
    await Listing.deleteMany({});
    await mongoose.disconnect();
  });

  describe("POST /api/listings/draft - Create Draft", () => {
    it("should create a new post-type draft", async () => {
      const res = await request(app)
        .post("/api/listings/draft")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          type: "post",
          currentStep: 1,
          title: "Test Craft Product",
          description: "A beautiful handmade product",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.draft).toBeDefined();
      expect(res.body.data.draft._version).toBe(0);
      expect(res.body.data.draft.draftVersion).toBe(0);
      expect(res.body.data.draft.currentStep).toBe(1);
      expect(res.body.data.draft.type).toBe("post");
    });

    it("should create a new tour-type draft", async () => {
      const res = await request(app)
        .post("/api/listings/draft")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          type: "tour",
          currentStep: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.draft.type).toBe("tour");
    });

    it("should return 400 for invalid type", async () => {
      const res = await request(app)
        .post("/api/listings/draft")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          type: "invalid",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("should require authentication", async () => {
      const res = await request(app).post("/api/listings/draft").send({
        type: "post",
      });

      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/listings/:id/draft - Autosave with Optimistic Locking", () => {
    let draftId;

    beforeEach(async () => {
      // Create a draft for testing
      const draft = await DraftService.initializeDraft(testUserId, "post", {
        title: "Initial Title",
        currentStep: 1,
      });
      draftId = draft._id;
    });

    it("should autosave partial updates", async () => {
      const res = await request(app)
        .patch(`/api/listings/${draftId}/draft`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          _version: 0,
          currentStep: 2,
          data: {
            title: "Updated Title",
            price: 50000,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.draft.title).toBe("Updated Title");
      expect(res.body.data.draft.price).toBe(50000);
      expect(res.body.data.draft._version).toBe(1);
      expect(res.body.data.draft.currentStep).toBe(2);
      expect(res.body.data.hasChanges).toBe(true);
    });

    it("should detect no changes and not increment version", async () => {
      const res = await request(app)
        .patch(`/api/listings/${draftId}/draft`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          _version: 0,
          data: {
            // No changes
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.draft._version).toBe(0); // Version should not increment
      expect(res.body.data.hasChanges).toBe(false);
    });

    it("should return 409 on version conflict", async () => {
      // First update
      await request(app)
        .patch(`/api/listings/${draftId}/draft`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          _version: 0,
          data: { title: "Update 1" },
        });

      // Second update with stale version
      const res = await request(app)
        .patch(`/api/listings/${draftId}/draft`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          _version: 0, // Expecting 0, but current is 1
          data: { title: "Update 2" },
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VERSION_CONFLICT");
      expect(res.body.error.currentVersion).toBe(1);
      expect(res.body.error.expectedVersion).toBe(0);
    });

    it("should track changed fields", async () => {
      const res = await request(app)
        .patch(`/api/listings/${draftId}/draft`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          _version: 0,
          data: {
            title: "New Title",
            price: 100,
          },
        });

      expect(res.body.data.changedFields).toContain("title");
      expect(res.body.data.changedFields).toContain("price");
    });

    it("should require _version field", async () => {
      const res = await request(app)
        .patch(`/api/listings/${draftId}/draft`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          // Missing _version
          data: { title: "New Title" },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 404 for non-existent draft", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .patch(`/api/listings/${fakeId}/draft`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          _version: 0,
          data: { title: "Title" },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("DRAFT_NOT_FOUND");
    });

    it("should prevent updating drafts owned by other users", async () => {
      // Create another user's draft
      const otherUser = await User.create({
        name: "Other User",
        phone: "09120000101",
        role: "user",
      });
      const otherDraft = await DraftService.initializeDraft(
        otherUser._id.toString(),
        "post",
        { title: "Other User Draft" },
      );

      // Try to update with first user's token
      const res = await request(app)
        .patch(`/api/listings/${otherDraft._id}/draft`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          _version: 0,
          data: { title: "Hacked" },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("GET /api/listings/draft/latest - Get Latest Draft", () => {
    it("should retrieve latest draft for user", async () => {
      const draft = await DraftService.initializeDraft(testUserId, "post", {
        title: "Latest Draft",
      });

      const res = await request(app)
        .get("/api/listings/draft/latest")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.draft._id).toBe(draft._id.toString());
    });

    it("should filter by type if provided", async () => {
      await DraftService.initializeDraft(testUserId, "post", {
        title: "Post Draft",
      });
      const tourDraft = await DraftService.initializeDraft(testUserId, "tour", {
        title: "Tour Draft",
      });

      const res = await request(app)
        .get("/api/listings/draft/latest?type=tour")
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.draft.type).toBe("tour");
      expect(res.body.data.draft._id).toBe(tourDraft._id.toString());
    });

    it("should return 404 if no draft found", async () => {
      // Create new user with no drafts
      const newUser = await User.create({
        name: "No Drafts User",
        phone: "09120000102",
        role: "user",
      });
      const newToken = jwt.sign(
        { id: newUser._id.toString(), role: "user" },
        process.env.JWT_SECRET || "test-secret",
      );

      const res = await request(app)
        .get("/api/listings/draft/latest")
        .set("Authorization", `Bearer ${newToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("DRAFT_NOT_FOUND");
    });
  });

  describe("GET /api/listings/draft/:id - Get Draft by ID", () => {
    let draftId;

    beforeEach(async () => {
      const draft = await DraftService.initializeDraft(testUserId, "post", {
        title: "Test Draft",
      });
      draftId = draft._id;
    });

    it("should retrieve draft by ID", async () => {
      const res = await request(app)
        .get(`/api/listings/draft/${draftId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.draft._id).toBe(draftId.toString());
    });

    it("should prevent access to other users' drafts", async () => {
      const otherUser = await User.create({
        name: "Other User 2",
        phone: "09120000103",
        role: "user",
      });
      const otherToken = jwt.sign(
        { id: otherUser._id.toString(), role: "user" },
        process.env.JWT_SECRET || "test-secret",
      );

      const res = await request(app)
        .get(`/api/listings/draft/${draftId}`)
        .set("Authorization", `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/listings/:draftId/publish - Publish Draft to Listing", () => {
    it("should promote complete draft to listing", async () => {
      const draft = await DraftService.initializeDraft(testUserId, "post", {
        title: "Complete Product",
        description: "A detailed product description",
        price: 50000,
        category: "pottery",
      });

      const res = await request(app)
        .post(`/api/listings/${draft._id}/publish`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({}); // No final overrides needed

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.listing).toBeDefined();
      expect(res.body.data.listing.title).toBe("Complete Product");
      expect(res.body.data.listing.price).toBe(50000);
    });

    it("should return 422 for incomplete draft (missing required fields)", async () => {
      const draft = await DraftService.initializeDraft(testUserId, "post", {
        title: "Incomplete Product",
        // Missing description and price
      });

      const res = await request(app)
        .post(`/api/listings/${draft._id}/publish`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("INCOMPLETE_DRAFT");
      expect(res.body.error.missingFields).toContain("description");
      expect(res.body.error.missingFields).toContain("price");
    });

    it("should link published listing to draft", async () => {
      const draft = await DraftService.initializeDraft(testUserId, "post", {
        title: "Linked Product",
        description: "Detailed description here",
        price: 30000,
      });

      const res = await request(app)
        .post(`/api/listings/${draft._id}/publish`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      const listingId = res.body.data.listing._id;

      // Verify listing has draftId
      const listing = await Listing.findById(listingId).lean();
      expect(listing.draftId).toEqual(draft._id);
    });
  });

  describe("DELETE /api/listings/draft/:id - Delete Draft", () => {
    let draftId;

    beforeEach(async () => {
      const draft = await DraftService.initializeDraft(testUserId, "post", {
        title: "Draft to Delete",
      });
      draftId = draft._id;
    });

    it("should soft-delete draft", async () => {
      const res = await request(app)
        .delete(`/api/listings/draft/${draftId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify draft is marked as discarded
      const draft = await Draft.findById(draftId).lean();
      expect(draft.status).toBe("discarded");
    });
  });

  describe("Unit Tests - DraftService", () => {
    describe("detectChanges", () => {
      it("should detect field changes", () => {
        const { detectChanges } = require("../utils/draftValidation");

        const oldData = { title: "Old", price: 100 };
        const newData = { title: "New", price: 100 };

        const result = detectChanges(oldData, newData);

        expect(result.changedFields).toContain("title");
        expect(result.changedFields).not.toContain("price");
      });

      it("should detect no changes when data is identical", () => {
        const { detectChanges } = require("../utils/draftValidation");

        const oldData = { title: "Same", price: 100 };
        const newData = { title: "Same", price: 100 };

        const result = detectChanges(oldData, newData);

        expect(result.hasChanges).toBe(false);
      });
    });

    describe("validateDraftForPublish", () => {
      it("should validate post requires price", () => {
        const { validateDraftForPublish } = require("../utils/draftValidation");

        const draft = {
          title: "Product",
          description: "Description",
          // Missing price
        };

        const result = validateDraftForPublish(draft, "post");

        expect(result.valid).toBe(false);
        expect(result.missingFields).toContain("price");
      });

      it("should validate tour requires dates and capacity", () => {
        const { validateDraftForPublish } = require("../utils/draftValidation");

        const draft = {
          title: "Tour",
          description: "Description",
          // Missing startDate, endDate, capacity
        };

        const result = validateDraftForPublish(draft, "tour");

        expect(result.valid).toBe(false);
        expect(result.missingFields).toContain("startDate");
        expect(result.missingFields).toContain("endDate");
        expect(result.missingFields).toContain("capacity");
      });
    });
  });

  describe("Unit Tests - DraftRepository", () => {
    describe("Optimistic Locking", () => {
      it("should prevent updates with stale version", async () => {
        const draft = await DraftRepository.createDraft({
          owner: testUserId,
          type: "post",
          data: { title: "Test Draft" },
        });

        // First update increments version to 1
        await DraftRepository.updateDraftPartial(
          draft._id,
          { title: "Update 1" },
          0,
          true,
        );

        // Second update with stale version should fail
        const result = await DraftRepository.updateDraftPartial(
          draft._id,
          { title: "Update 2" },
          0,
          true,
        );

        expect(result.success).toBe(false);
        expect(result.versionConflict).toBe(true);
        expect(result.currentVersion).toBe(1);
      });

      it("should allow update with correct version", async () => {
        const draft = await DraftRepository.createDraft({
          owner: testUserId,
          type: "post",
          data: { title: "Test Draft" },
        });

        const result = await DraftRepository.updateDraftPartial(
          draft._id,
          { title: "Updated" },
          0,
          true,
        );

        expect(result.success).toBe(true);
        expect(result.draft.title).toBe("Updated");
        expect(result.draft._version).toBe(1);
      });
    });
  });

  describe("TTL Index - Auto Deletion", () => {
    it("should have TTL index on createdAt field", async () => {
      const indexes = await Draft.collection.indexes();
      const ttlIndex = indexes.find(
        (idx) => idx.expireAfterSeconds !== undefined,
      );

      expect(ttlIndex).toBeDefined();
      // 90 days in seconds
      expect(ttlIndex.expireAfterSeconds).toBe(90 * 24 * 60 * 60);
    });
  });

  describe("Discriminator Type Handling", () => {
    it("should handle post discriminator fields", async () => {
      const draft = await DraftService.initializeDraft(testUserId, "post", {
        title: "Post Draft",
        description: "Desc",
        price: 100,
        forSale: true,
        category: "pottery",
      });

      expect(draft.price).toBe(100);
      expect(draft.forSale).toBe(true);
      expect(draft.category).toBe("pottery");
    });

    it("should handle tour discriminator fields", async () => {
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000);

      const draft = await DraftService.initializeDraft(testUserId, "tour", {
        title: "Tour Draft",
        description: "Desc",
        startDate,
        endDate,
        capacity: 20,
        durationDays: 3,
      });

      expect(draft.startDate).toBeDefined();
      expect(draft.capacity).toBe(20);
    });
  });
});
