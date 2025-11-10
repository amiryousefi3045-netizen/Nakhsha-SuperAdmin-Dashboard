/*
 End-to-end API smoke test for نخشا backend
 Steps: upload -> create -> read -> update -> read -> delete
*/

const fs = require("fs");
const path = require("path");
const axios = require("axios").default;
const FormData = require("form-data");

const BASE = process.env.API_BASE || "http://localhost:5000/api";

async function uploadSample() {
  const samplePath = path.resolve(__dirname, "..", "uploads", "kebab.jpg");
  if (!fs.existsSync(samplePath)) {
    throw new Error("Sample file not found: " + samplePath);
  }
  const form = new FormData();
  form.append("file", fs.createReadStream(samplePath));
  const { data } = await axios.post(`${BASE}/uploads`, form, {
    headers: form.getHeaders(),
    maxBodyLength: 10 * 1024 * 1024,
  });
  if (!data?.url) throw new Error("Upload failed: no url");
  return data.url;
}

async function main() {
  const out = { steps: [] };
  try {
    // 0) Health
    const health = await axios
      .get(`${BASE}/health`)
      .then((r) => r.data)
      .catch(() => null);
    out.steps.push({ step: "health", ok: !!health, data: health });

    // 1) Upload
    const img1 = await uploadSample();
    out.steps.push({ step: "upload", ok: true, url: img1 });

    const img2 = "/uploads/ash-1755524553412.jpg";

    // 2) Create
    const payload = {
      title: "تست نخشا (smoke)",
      description: "رکورد تستی توسط اسکریپت",
      images: [img1, img2],
      craftType: "سفالگری",
      price: 100000,
      forSale: true,
      tags: ["تست"],
      location: { city: "تهران", neighborhood: "تست", lat: 35.735, lng: 51.41 },
    };
    const created = await axios
      .post(`${BASE}/crafts`, payload)
      .then((r) => r.data);
    if (!created?.id) throw new Error("Create failed");
    const id = created.id;
    out.steps.push({ step: "create", ok: true, id });

    // 3) Read
    const detail1 = await axios.get(`${BASE}/crafts/${id}`).then((r) => r.data);
    out.steps.push({
      step: "read1",
      ok: Array.isArray(detail1?.images),
      images: detail1?.images,
    });

    // 4) Update order (swap)
    const updateRes = await axios
      .put(`${BASE}/crafts/${id}`, { images: [img2, img1] })
      .then((r) => r.data);
    out.steps.push({ step: "update", ok: !!updateRes?.ok });

    // 5) Read again
    const detail2 = await axios.get(`${BASE}/crafts/${id}`).then((r) => r.data);
    out.steps.push({
      step: "read2",
      ok: Array.isArray(detail2?.images),
      images: detail2?.images,
    });

    // 6) Delete
    const del = await axios.delete(`${BASE}/crafts/${id}`).then((r) => r.data);
    out.steps.push({ step: "delete", ok: !!del?.ok });

    console.log(JSON.stringify({ ok: true, ...out }, null, 2));
    process.exit(0);
  } catch (e) {
    out.error = e?.message || String(e);
    console.log(JSON.stringify({ ok: false, ...out }, null, 2));
    process.exit(1);
  }
}

main();
