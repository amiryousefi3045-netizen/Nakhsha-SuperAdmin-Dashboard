const request = require("supertest");
const http = require("http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../server");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const AuditService = require("../services/AuditService");

// ── Helpers ────────────────────────────────────────────────────────────────

function accessTokenOf(user) {
  return jwt.sign(
    { id: String(user._id), role: user.role, type: "access", ver: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: "15m", algorithm: "HS256" },
  );
}

const AUTH = (token) => `Bearer ${token}`;

function waitFor(fn, timeout = 4000, interval = 40) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (fn()) return resolve();
      if (Date.now() - started > timeout) return reject(new Error("Timeout waiting for condition"));
      setTimeout(tick, interval);
    };
    tick();
  });
}

const PHONES = {
  sa: "09149000001",
  userA: "09149000002",
};

let httpServer;
let port;
let saUser;
let saToken;
let userAToken;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
  process.env.SUPER_ADMIN_PHONE = PHONES.sa;

  const mongoUri = process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }
  app.locals.dbReady = true;

  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  await User.deleteMany({ role: "super_admin" });
  await AuditLog.deleteMany({
    action: { $in: ["USER_VERIFIED", "USER_UPDATED"] },
  });

  saUser = await User.create({
    name: "سوپرادمین SSE",
    phone: PHONES.sa,
    handle: "sa_sse",
    role: "super_admin",
    isVerified: true,
  });
  saToken = accessTokenOf(saUser);

  const userA = await User.create({
    name: "کاربر بدون دسترسی",
    phone: PHONES.userA,
    handle: "u_no_access",
    role: "user",
    isVerified: true,
  });
  userAToken = accessTokenOf(userA);

  httpServer = app.listen(0);
  await new Promise((resolve) => httpServer.once("listening", resolve));
  port = httpServer.address().port;
});

afterAll(async () => {
  await AuditLog.deleteMany({
    action: { $in: ["USER_VERIFIED", "USER_UPDATED"] },
  });
  await User.deleteMany({ phone: { $in: Object.values(PHONES) } });
  delete process.env.SUPER_ADMIN_PHONE;
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await mongoose.connection.close();
});

function openLiveStream(token) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const streamReq = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/api/admin/events/live",
        method: "GET",
        headers: { Authorization: AUTH(token) },
      },
      (res) => {
        res.on("data", (chunk) => chunks.push(chunk.toString()));
        resolve({
          streamReq,
          res,
          chunks,
          text: () => chunks.join(""),
        });
      },
    );
    streamReq.on("error", reject);
    streamReq.end();
  });
}

describe("Live events SSE — protection", () => {
  it("rejects unauthenticated requests with 401", async () => {
    await request(app).get("/api/admin/events/live").expect(401);
  });

  it("rejects non-super_admin with 403", async () => {
    const denied = await request(app)
      .get("/api/admin/events/live")
      .set("Authorization", AUTH(userAToken))
      .expect(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });
});

describe("Live events SSE — streaming", () => {
  it("emits an initial event and streams audit events to connected admins", async () => {
    let stream;
    try {
      stream = await openLiveStream(saToken);

      await waitFor(() =>
        stream.text().includes("event: initial"),
      );

      await AuditService.log({
        userId: String(saUser._id),
        action: "USER_VERIFIED",
        resource: { type: "USER", id: String(saUser._id) },
        requestContext: { ip: "127.0.0.1" },
        riskLevel: "HIGH",
      });

      await waitFor(() =>
        stream
          .text()
          .includes('event: audit')
          && stream.text().includes('"action":"USER_VERIFIED"'),
      );

      const eventText = stream.text();
      expect(eventText).toContain("event: audit");
      expect(eventText).toContain('"id"');
      expect(eventText).toContain('"riskLevel":"HIGH"');
      expect(eventText).toContain('"resourceType":"USER"');
    } finally {
      if (stream) stream.streamReq.destroy();
    }
  });

  it("per-client broadcast reaches multiple connected admins", async () => {
    const a = await openLiveStream(saToken);
    const b = await openLiveStream(saToken);
    try {
      await waitFor(() =>
        a.text().includes("event: initial"),
      );
      await waitFor(() =>
        b.text().includes("event: initial"),
      );

      await AuditService.log({
        userId: String(saUser._id),
        action: "USER_UPDATED",
        resource: { type: "USER", id: String(saUser._id) },
        requestContext: { ip: "127.0.0.1" },
      });

      const seesEvent = async (stream) =>
        waitFor(() =>
          stream
            .text()
            .includes('event: audit')
            && stream.text().includes('"action":"USER_UPDATED"'),
        );
      await Promise.all([seesEvent(a), seesEvent(b)]);
    } finally {
      a.streamReq.destroy();
      b.streamReq.destroy();
    }
  });

  it("writes an AuditLog doc for every broadcast source", async () => {
    const doc = await AuditLog.findOne({ action: "USER_UPDATED" }).lean();
    expect(doc).toBeTruthy();
    expect(doc.result).toBe("SUCCESS");
  });
});