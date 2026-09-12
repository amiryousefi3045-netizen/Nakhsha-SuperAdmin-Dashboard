/*
 End-to-end API smoke test for نخشا backend
 Steps: health -> auth(OTP dev) -> artisan setup -> upload -> create -> read -> update -> read -> delete
 Requires a server running with NODE_ENV != "production" (to receive devCode) and SMS_MOCK=true.
*/

const fs = require("fs");
const path = require("path");
const axios = require("axios").default;
const FormData = require("form-data");

const BASE = process.env.API_BASE || "http://localhost:5000/api";
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nakhsha";
const SMOKE_PHONE =
  process.env.SMOKE_PHONE ||
  `0919${String(Math.floor(1000000 + Math.random() * 9000000))}`;

async function authenticate() {
  const start = await axios
    .post(`${BASE}/auth/otp/start`, { phone: SMOKE_PHONE })
    .then((r) => r.data);
  if (!start?.devCode) {
    throw new Error(
      "otp/start did not return devCode. `test:api` must be run against a " +
        "development server (NODE_ENV != production, SMS_MOCK=true).",
    );
  }
  const verified = await axios
    .post(`${BASE}/auth/otp/verify`, {
      phone: SMOKE_PHONE,
      code: String(start.devCode).trim(),
    })
    .then((r) => r.data);
  const token = verified?.accessToken || verified?.token;
  if (!token) throw new Error("otp/verify returned no token");
  return token;
}

async function ensureArtisan() {
  const mongoose = require("mongoose");
  const User = require("../models/User");
  const Artisan = require("../models/Artisan");
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const user = await User.findOne({ phone: SMOKE_PHONE });
  if (!user) throw new Error("Authed user not found in DB for artisan setup");
  await Artisan.findOneAndUpdate(
    { userId: user._id },
    {
      userId: user._id,
      name: "کارگاه اسموک",
      bio: "کارگاه تولیدی اسموک",
      craftType: "سفالگری",
      location: {
        city: "تهران",
        geometry: { type: "Point", coordinates: [51.4, 35.7] },
      },
      verified: true,
    },
    { upsert: true },
  );
  await mongoose.disconnect();
}

async function uploadSample() {
  const samplePath = path.resolve(__dirname, "..", "uploads", "kebab.jpg");
  if (!fs.existsSync(samplePath)) {
    throw new Error("Sample file not found: " + samplePath);
  }
  const form = new FormData();
  form.append("file", fs.createReadStream(samplePath));
  const body = await axios.post(`${BASE}/uploads`, form, {
    headers: form.getHeaders(),
    maxBodyLength: 10 * 1024 * 1024,
  }).then((r) => r.data);
  const url = body?.data?.url;
  if (!url) throw new Error("Upload failed: no url in response envelope");
  return url;
}

async function main() {
  const out = { steps: [] };
  try {
    const health = await axios
      .get(`${BASE}/health`)
      .then((r) => r.data)
      .catch(() => null);
    out.steps.push({ step: "health", ok: !!health, data: health });

    const token = await authenticate();
    out.steps.push({ step: "auth", ok: !!token, phone: SMOKE_PHONE });
    const AUTH = { Authorization: `Bearer ${token}` };

    await ensureArtisan();
    out.steps.push({ step: "artisan", ok: true, phone: SMOKE_PHONE });

    const img1 = await uploadSample();
    out.steps.push({ step: "upload", ok: true, url: img1 });

    const img2 = "/uploads/ash-1755524553412.jpg";

    const payload = {
      title: "تست نخشا (smoke)",
      description: "رکورد تستی توسط اسکریپت",
      images: [img1, img2],
      craftType: "pottery",
      price: 100000,
      forSale: true,
      tags: ["تست"],
      location: { city: "تهران", neighborhood: "تست", lat: 35.735, lng: 51.41 },
    };
    const created = await axios
      .post(`${BASE}/crafts`, payload, { headers: AUTH })
      .then((r) => r.data);
    if (!created?.id) throw new Error("Create failed");
    const id = created.id;
    out.steps.push({ step: "create", ok: true, id });

    const detail1 = await axios.get(`${BASE}/crafts/${id}`).then((r) => r.data);
    out.steps.push({
      step: "read1",
      ok: Array.isArray(detail1?.images),
      images: detail1?.images,
    });

    const updateRes = await axios
      .put(`${BASE}/crafts/${id}`, { images: [img2, img1] }, { headers: AUTH })
      .then((r) => r.data);
    out.steps.push({ step: "update", ok: updateRes?.ok === true });

    const detail2 = await axios.get(`${BASE}/crafts/${id}`).then((r) => r.data);
    out.steps.push({
      step: "read2",
      ok: Array.isArray(detail2?.images),
      images: detail2?.images,
    });

    const del = await axios
      .delete(`${BASE}/crafts/${id}`, { headers: AUTH })
      .then((r) => r.data);
    out.steps.push({ step: "delete", ok: del?.ok === true });

    console.log(JSON.stringify({ ok: true, ...out }, null, 2));
    process.exit(0);
  } catch (e) {
    out.error = e?.message || String(e);
    console.log(JSON.stringify({ ok: false, ...out }, null, 2));
    process.exit(1);
  }
}

main();
