const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");

/**
 * Regression guard for the AuditLog `resource` sub-schema.
 *
 * The `resource` path must be OPTIONAL: a log without a resource is valid.
 * It must only be validated (type required) when a resource object is
 * actually provided. Previously, the inline definition made `resource.type`
 * implicitly required even when `resource` was missing, so every audit entry
 * without a resource was silently dropped by AuditService.
 */

let actorId;

beforeAll(async () => {
  const mongoUri =
    process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  actorId = new mongoose.Types.ObjectId();
  process.env.NODE_ENV = "test";
});

beforeEach(async () => {
  await AuditLog.deleteMany({ userId: actorId });
});

afterAll(async () => {
  await AuditLog.deleteMany({ userId: actorId });
  await mongoose.connection.close();
});

function baseData(extra = {}) {
  return {
    userId: actorId,
    action: "LOGIN",
    riskLevel: "LOW",
    ...extra,
  };
}

describe("AuditLog schema — optional resource", () => {
  it("saves a log without a resource field", async () => {
    const doc = await AuditLog.create(baseData());
    const plain = doc.toObject();
    expect(plain.resource).toBeUndefined();
  });

  it("saves a log whose resource is explicitly undefined", async () => {
    const doc = await AuditLog.create(baseData({ resource: undefined }));
    expect(doc.toObject().resource).toBeUndefined();
  });

  it("rejects an empty resource object (type required if present)", async () => {
    await expect(AuditLog.create(baseData({ resource: {} }))).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("saves a log with a valid resource type", async () => {
    const doc = await AuditLog.create(baseData({ resource: { type: "USER" } }));
    const plain = doc.toObject();
    expect(plain.resource).toMatchObject({ type: "USER" });
  });
});