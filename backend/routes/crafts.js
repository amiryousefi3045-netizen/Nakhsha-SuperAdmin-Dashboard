const express = require("express");
const mongoose = require("mongoose");
const Craft = require("../models/Craft");
const Artisan = require("../models/Artisan");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const {
  validate,
  createCraftSchema,
  nearQuerySchema,
} = require("../middlewares/validate");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

// Auth middleware
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

// Load craft and check ownership
async function loadCraft(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Not found" });
    }
    const craft = await Craft.findById(id).populate("artisanId", "userId");
    if (!craft) return res.status(404).json({ message: "Not found" });
    req.craft = craft;
    next();
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
}

function ownerOrAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  if (!req.craft?.artisanId?.userId) {
    return res.status(403).json({ message: "Forbidden" });
  }
  if (String(req.craft.artisanId.userId) !== String(req.user?.id)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

// GET /api/crafts
// Query: bounds, filters (city, craftType, priceRange), page, limit, q, sort
router.get("/", async (req, res) => {
  try {
    // Avoid stale caches during active development
    res.set("Cache-Control", "no-store");

    // Support both flat and nested query params
    const rawQuery = req.query || {};
    const getBound = (k) => {
      if (rawQuery[k] !== undefined) return rawQuery[k];
      if (rawQuery.bounds && rawQuery.bounds[k] !== undefined)
        return rawQuery.bounds[k];
      const bracket = `bounds[${k}]`;
      if (rawQuery[bracket] !== undefined) return rawQuery[bracket];
      return undefined;
    };
    const getFilter = (k) => {
      if (rawQuery[k] !== undefined) return rawQuery[k];
      if (rawQuery.filters && rawQuery.filters[k] !== undefined)
        return rawQuery.filters[k];
      const bracket = `filters[${k}]`;
      if (rawQuery[bracket] !== undefined) return rawQuery[bracket];
      return undefined;
    };

    const filter = { isPublished: true };

    // Text search
    const q = rawQuery.q;
    if (q) filter.$text = { $search: q };

    // Location bounds
    const n = parseFloat(getBound("north"));
    const s = parseFloat(getBound("south"));
    const e = parseFloat(getBound("east"));
    const w = parseFloat(getBound("west"));
    if ([n, s, e, w].every((v) => Number.isFinite(v))) {
      console.log("Searching in bounds:", { n, s, e, w });
      // Use GeoJSON polygon for $geoWithin against location.geometry
      filter["location.geometry"] = {
        $geoWithin: {
          $geometry: {
            type: "Polygon",
            coordinates: [
              [
                [w, s],
                [e, s],
                [e, n],
                [w, n],
                [w, s],
              ],
            ],
          },
        },
      };
    }

    // Basic filters
    const city = getFilter("city");
    if (city) filter["location.city"] = city;

    const craftType = getFilter("craftType");
    if (craftType) filter.craftType = craftType;

    const forSale = getFilter("forSale");
    if (forSale === "true") filter.forSale = true;

    // Price range filter (format: "min-max" or "min+" for open-ended)
    const priceRange = getFilter("priceRange");
    if (priceRange) {
      const [min, max] = priceRange.split("-");
      if (min && !isNaN(min)) {
        filter.price = filter.price || {};
        filter.price.$gte = parseFloat(min);
      }
      if (max && !isNaN(max)) {
        filter.price = filter.price || {};
        filter.price.$lte = parseFloat(max);
      }
    }

    // Pagination
    const pageSize = Math.min(parseInt(rawQuery.limit, 10) || 50, 100);
    const pageNum = Math.max(parseInt(rawQuery.page, 10) || 1, 1);

    // Sort options
    const rawSort = rawQuery.sort;
    let sortSpec = { createdAt: -1 };
    switch (rawSort) {
      case "oldest":
        sortSpec = { createdAt: 1 };
        break;
      case "priceAsc":
        sortSpec = { price: 1, createdAt: -1 };
        break;
      case "priceDesc":
        sortSpec = { price: -1, createdAt: -1 };
        break;
      case "popular":
        sortSpec = { views: -1, createdAt: -1 };
        break;
      default:
        sortSpec = { createdAt: -1 };
    }

    // Support distance-based sorting if user coordinates provided
    const userLng = parseFloat(rawQuery.lng);
    const userLat = parseFloat(rawQuery.lat);
    const wantDistance =
      (!rawSort || rawSort === "distance") &&
      Number.isFinite(userLng) &&
      Number.isFinite(userLat);

    let items, total;
    if (wantDistance) {
      const geoPipeline = [
        {
          $geoNear: {
            near: { type: "Point", coordinates: [userLng, userLat] },
            key: "location.geometry",
            distanceField: "_distance",
            spherical: true,
            query: filter,
          },
        },
        { $sort: { _distance: 1 } },
        { $skip: (pageNum - 1) * pageSize },
        { $limit: pageSize },
      ];
      const countPromise = Craft.countDocuments(filter);
      const agg = await Craft.aggregate(geoPipeline);
      total = await countPromise;
      items = agg.map((doc) => Object.assign(new Craft(doc), doc));
    } else {
      const results = await Promise.all([
        Craft.find(filter)
          .sort(sortSpec)
          .skip((pageNum - 1) * pageSize)
          .limit(pageSize),
        Craft.countDocuments(filter),
      ]);
      items = results[0];
      total = results[1];
    }

    // Transform to API response format
    const mapCraft = (c) => {
      const base = {
        id: c._id,
        title: c.title,
        description: c.description,
        images: c.images || [],
        craftType: c.craftType,
        price: c.price,
        forSale: c.forSale,
        location: c.location?.city
          ? `${c.location.city}${
              c.location.neighborhood ? "، " + c.location.neighborhood : ""
            }`
          : "",
        lat: c.location?.coordinates?.[1],
        lng: c.location?.coordinates?.[0],
        tags: c.tags || [],
        totalLikes: c.totalLikes || 0,
        totalDislikes: c.totalDislikes || 0,
        commentsCount: (c.comments || []).length,
        createdAt: c.createdAt,
      };
      if (c._doc?._distance !== undefined) {
        base.distanceMeters = Math.round(c._doc._distance);
      }
      return base;
    };

    res.json({
      items: items.map(mapCraft),
      total,
      page: pageNum,
      limit: pageSize,
    });
  } catch (err) {
    console.error("GET /api/crafts error", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/crafts/near
// Query: lng, lat, radiusKm, q, category, min, max
router.get("/near", validate(nearQuerySchema, "query"), async (req, res) => {
  try {
    const { lng, lat, radiusKm = 10, q, category, min, max } = req.query;
    const start = Date.now();
    console.log("[crafts:near] incoming params", {
      lng,
      lat,
      radiusKm,
      q: q ? (q.length > 100 ? q.slice(0, 100) + "..." : q) : q,
      category,
      min,
      max,
    });

    // Build base query (same semantics as main listing endpoint)
    const query = { isPublished: true };

    // Category -> craftType
    if (category) query.craftType = category;

    // Price range
    if (min !== undefined || max !== undefined) {
      query.price = {};
      if (min !== undefined && String(min).trim() !== "")
        query.price.$gte = parseFloat(min);
      if (max !== undefined && String(max).trim() !== "")
        query.price.$lte = parseFloat(max);
    }

    // Text search: prefer $text if a text index exists, otherwise fallback to regex
    if (q) {
      try {
        const indexes = await Craft.collection.indexes();
        const hasText = indexes.some((ix) =>
          Object.values(ix.key || {}).some((v) => v === "text")
        );
        console.log("[crafts:near] text index present:", !!hasText);
        if (hasText) {
          query.$text = { $search: q };
        } else {
          query.$or = [
            { title: { $regex: q, $options: "i" } },
            { description: { $regex: q, $options: "i" } },
          ];
        }
      } catch (e) {
        console.warn(
          "[crafts:near] index check failed, falling back to regex",
          e && e.message
        );
        // If index check fails, fall back to safe regex behavior
        query.$or = [
          { title: { $regex: q, $options: "i" } },
          { description: { $regex: q, $options: "i" } },
        ];
      }
    }

    // Parse coordinates and radius
    const longitude = parseFloat(lng);
    const latitude = parseFloat(lat);
    const radius = Math.min(Math.max(1, parseFloat(radiusKm) || 10), 100); // clamp between 1 and 100 km

    // If coordinates valid, run aggregation with $geoNear
    if (
      Number.isFinite(longitude) &&
      Number.isFinite(latitude) &&
      longitude >= -180 &&
      longitude <= 180 &&
      latitude >= -90 &&
      latitude <= 90
    ) {
      console.log(
        "[crafts:near] using geo search near=[%d,%d] radiusKm=%d",
        longitude,
        latitude,
        radius
      );
      const pipeline = [
        {
          $geoNear: {
            near: { type: "Point", coordinates: [longitude, latitude] },
            key: "location.geometry",
            distanceField: "distanceMeters",
            spherical: true,
            maxDistance: radius * 1000,
            query,
          },
        },
        // Ensure results are sorted by distance when using geo search
        { $sort: { distanceMeters: 1 } },
        // Cap results to 100 as requested
        { $limit: 100 },
        {
          $project: {
            _id: 1,
            title: 1,
            description: 1,
            images: 1,
            craftType: 1,
            price: 1,
            forSale: 1,
            location: 1,
            tags: 1,
            distanceMeters: 1,
            createdAt: 1,
          },
        },
      ];

      const agg = await Craft.aggregate(pipeline);
      console.log(
        "[crafts:near] geo aggregation returned",
        agg.length,
        "items in",
        Date.now() - start,
        "ms"
      );
      const results = agg.map((doc) => ({
        id: doc._id,
        title: doc.title,
        description: doc.description,
        images: doc.images || [],
        craftType: doc.craftType,
        price: doc.price,
        forSale: doc.forSale,
        location: doc.location,
        tags: doc.tags || [],
        distanceMeters:
          typeof doc.distanceMeters === "number"
            ? Math.round(doc.distanceMeters)
            : undefined,
        distanceKm:
          typeof doc.distanceMeters === "number"
            ? (doc.distanceMeters / 1000).toFixed(1)
            : undefined,
        createdAt: doc.createdAt,
      }));

      return res.json({ items: results });
    }

    // No valid coordinates: fallback to same filters used above and sort by createdAt
    const docs = await Craft.find(query)
      .select(
        "title description images craftType price forSale location tags createdAt"
      )
      .limit(100)
      .sort({ createdAt: -1 });

    console.log(
      "[crafts:near] fallback non-geo query, docsReturned=%d, elapsed=%dms",
      docs.length,
      Date.now() - start
    );
    const formatted = docs.map((doc) => ({
      id: doc._id,
      title: doc.title,
      description: doc.description,
      images: doc.images || [],
      craftType: doc.craftType,
      price: doc.price,
      forSale: doc.forSale,
      location: doc.location,
      tags: doc.tags || [],
      createdAt: doc.createdAt,
    }));

    res.json({ items: formatted });
  } catch (err) {
    console.error("GET /api/crafts/near error:", err);
    res.status(500).json({
      message: "خطا در جستجوی نزدیک‌ترین موارد",
      error: err.message,
    });
  }
});

// Development seed endpoint
router.get("/seed/dev", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ message: "Not available in production" });
  }

  try {
    // Delete existing test data first
    await Promise.all([
      User.deleteMany({ email: "artisan@test.com" }),
      Artisan.deleteMany({ craftType: "سفالگری" }),
      Craft.deleteMany({}),
    ]);

    // Create a test artisan if none exists
    let artisan = await Artisan.findOne();
    if (!artisan) {
      const hashedPassword = await bcrypt.hash("test123", 10);
      let user;
      try {
        user = await User.create({
          name: "استاد حسین",
          email: "artisan@test.com",
          password: hashedPassword,
          role: "artisan",
          phone: "09123456789", // اضافه کردن شماره تلفن
          location: {
            city: "یزد",
            province: "یزد",
            coordinates: [54.3675, 31.8974], // Yazd coordinates
          },
          isVerified: true,
        });
      } catch (e) {
        // If another process created the user concurrently, fall back to existing
        if (e && e.code === 11000) {
          user = await User.findOne({ email: "artisan@test.com" });
        } else {
          throw e;
        }
      }

      try {
        artisan = await Artisan.create({
          userId: user._id,
          craftType: "سفالگری",
          bio: "استاد سفالگری با بیش از ۳۰ سال تجربه در ساخت ظروف سنتی یزد",
          stars: 4.5,
          verified: true,
        });
      } catch (e) {
        if (e && e.code === 11000) {
          artisan = await Artisan.findOne({ userId: user._id });
        } else {
          throw e;
        }
      }
    }

    // Sample craft data
    const sampleCrafts = [
      {
        title: "کوزه سفالی دست‌ساز",
        description:
          "کوزه سفالی سنتی با نقوش اسلیمی، مناسب برای تزئین و استفاده",
        artisanId: artisan._id,
        craftType: "سفالگری",
        price: 850000, // 850,000 Tomans
        forSale: true,
        images: ["https://source.unsplash.com/featured/?pottery,vase"],
        location: {
          city: "یزد",
          neighborhood: "فهادان",
          coordinates: [54.3675, 31.8974],
        },
        tags: ["سفال", "دست‌ساز", "تزئینی"],
        culturalStory: "این طرح برگرفته از نقوش تاریخی مسجد جامع یزد است",
        isPublished: true,
      },
      {
        title: "گلدان سفالی مینیاتوری",
        description: "گلدان ظریف با تزئینات سنتی، مناسب برای گل‌های آپارتمانی",
        artisanId: artisan._id,
        craftType: "سفالگری",
        price: 450000,
        forSale: true,
        location: {
          city: "یزد",
          neighborhood: "فهادان",
          coordinates: [54.3675, 31.8974],
        },
        tags: ["سفال", "گلدان", "تزئینی", "مینیاتوری"],
        isPublished: true,
      },
    ];

    // Clear existing crafts and insert samples
    const crafts = await Craft.create(sampleCrafts);

    res.json({
      message: "Development seed data created",
      artisan: { id: artisan._id },
      crafts: crafts.map((c) => ({ id: c._id })),
    });
  } catch (err) {
    console.error("Seed error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// GET /api/crafts/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Not found" });
    }

    const craft = await Craft.findById(id).populate("artisanId", "name");
    if (!craft) return res.status(404).json({ message: "Not found" });

    // Increment view counter
    try {
      craft.views = (craft.views || 0) + 1;
      await craft.save();
    } catch {}

    // Check if user has liked/disliked
    let liked = false;
    let disliked = false;
    try {
      const h = req.headers.authorization || "";
      const token = h.startsWith("Bearer ") ? h.slice(7) : null;
      if (token) {
        const u = jwt.verify(token, JWT_SECRET);
        if (u?.id) {
          liked = craft.likes.some((l) => String(l.user) === String(u.id));
          disliked = craft.dislikes.some(
            (d) => String(d.user) === String(u.id)
          );
        }
      }
    } catch {
      // ignore invalid token for public view
    }

    res.json({
      id: craft._id,
      title: craft.title,
      description: craft.description,
      images: craft.images || [],
      artisan: craft.artisanId
        ? { id: craft.artisanId._id, name: craft.artisanId.name }
        : undefined,
      craftType: craft.craftType,
      price: craft.price,
      forSale: craft.forSale,
      tags: craft.tags || [],
      location: craft.location || {},
      views: craft.views || 0,
      averageRating: craft.averageRating,
      totalLikes: craft.totalLikes,
      totalDislikes: craft.totalDislikes,
      liked,
      disliked,
      createdAt: craft.createdAt,
      culturalStory: craft.culturalStory,
      sale: craft.sale || {},
      barter: craft.barter || {},
      comments: (craft.comments || []).map((c) => ({
        id: c._id,
        user: c.user,
        text: c.text,
        rating: c.rating,
        createdAt: c.createdAt,
      })),
      commentsCount: (craft.comments || []).length,
    });
  } catch (err) {
    console.error("GET /api/crafts/:id error", err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/crafts - create new craft
router.post("/", auth, validate(createCraftSchema), async (req, res) => {
  try {
    const b = req.body || {};

    // Ensure user is an artisan
    const artisan = await Artisan.findOne({ userId: req.user.id });
    if (!artisan) {
      return res.status(403).json({
        message: "Only artisans can create crafts",
        code: "NOT_ARTISAN",
      });
    }

    // Note: Basic validation already done by Zod middleware
    // Coordinates already validated and transformed by createCraftSchema

    const doc = await Craft.create({
      title: b.title,
      description: b.description,
      artisanId: artisan._id,
      images: b.images || [],
      craftType: b.craftType,
      price: b.price,
      forSale: b.forSale !== false,
      tags: b.tags || [],
      location: {
        city: b.location?.city || "",
        neighborhood: b.location?.neighborhood || "",
        coordinates,
      },
      isPublished: b.isPublished !== false,
      culturalStory: b.culturalStory,
      sale: b.sale || undefined,
      barter: b.barter || undefined,
    });

    res.status(201).json({ id: doc._id });
  } catch (e) {
    if (e?.name === "ValidationError") {
      const details = Object.values(e.errors || {}).map((er) => er.message);
      return res.status(400).json({ message: "Validation error", details });
    }
    console.error("POST /api/crafts error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT /api/crafts/:id - update craft
router.put("/:id", auth, loadCraft, ownerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
    const update = {};

    // Basic field updates
    if (b.title !== undefined)
      update.title = String(b.title).trim().slice(0, 200);
    if (b.description !== undefined)
      update.description = String(b.description).trim().slice(0, 5000);
    if (b.craftType !== undefined) update.craftType = b.craftType;
    if (b.price !== undefined) update.price = b.price;
    if (b.forSale !== undefined) update.forSale = !!b.forSale;
    if (b.culturalStory !== undefined)
      update.culturalStory = String(b.culturalStory).trim().slice(0, 6000);

    // Array updates
    if (b.images !== undefined) {
      update.images = Array.isArray(b.images)
        ? b.images.filter((u) => typeof u === "string")
        : [];
    }
    if (b.tags !== undefined) {
      update.tags = Array.isArray(b.tags)
        ? b.tags
            .map((t) => String(t).trim())
            .filter(Boolean)
            .slice(0, 100)
        : [];
    }

    // Location update
    if (b.location) {
      const loc = b.location;
      if (loc.city !== undefined) update["location.city"] = loc.city;
      if (loc.neighborhood !== undefined)
        update["location.neighborhood"] = loc.neighborhood;
      let coordinates = loc.coordinates;
      if (
        !coordinates &&
        typeof loc.lat === "number" &&
        typeof loc.lng === "number"
      ) {
        coordinates = [loc.lng, loc.lat];
      }
      if (Array.isArray(coordinates) && coordinates.length === 2) {
        // Use GeoJSON geometry for updates (findByIdAndUpdate bypasses save hooks)
        update["location.geometry"] = { type: "Point", coordinates };
      }
    }

    // Business feature updates
    if (b.sale !== undefined) update.sale = b.sale;
    if (b.barter !== undefined) update.barter = b.barter;
    if (b.isPublished !== undefined) update.isPublished = !!b.isPublished;

    const doc = await Craft.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json({ id: doc._id, ok: true });
  } catch (e) {
    if (e?.name === "ValidationError") {
      const details = Object.values(e.errors || {}).map((er) => er.message);
      return res.status(400).json({ message: "Validation error", details });
    }
    console.error("PUT /api/crafts/:id error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/crafts/:id
router.delete("/:id", auth, loadCraft, ownerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Craft.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/crafts/:id error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Social interactions...

// POST /api/crafts/:id/like - toggle like
router.post("/:id/like", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Not found" });
    }

    const craft = await Craft.findById(id).select("likes dislikes");
    if (!craft) {
      return res.status(404).json({ message: "Not found" });
    }

    const userId = req.user.id;
    const already = craft.likes.find((l) => String(l.user) === userId);
    if (already) {
      craft.likes = craft.likes.filter((l) => String(l.user) !== userId);
    } else {
      craft.likes.push({ user: userId });
      craft.dislikes = craft.dislikes.filter((d) => String(d.user) !== userId);
    }

    await craft.save();
    res.json({
      liked: !already,
      totalLikes: craft.likes.length,
      totalDislikes: craft.dislikes.length,
    });
  } catch (e) {
    console.error("POST /api/crafts/:id/like error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/crafts/:id/dislike - toggle dislike
router.post("/:id/dislike", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Not found" });
    }

    const craft = await Craft.findById(id).select("likes dislikes");
    if (!craft) {
      return res.status(404).json({ message: "Not found" });
    }

    const userId = req.user.id;
    const already = craft.dislikes.find((d) => String(d.user) === userId);
    if (already) {
      craft.dislikes = craft.dislikes.filter((d) => String(d.user) !== userId);
    } else {
      craft.dislikes.push({ user: userId });
      craft.likes = craft.likes.filter((l) => String(l.user) !== userId);
    }

    await craft.save();
    res.json({
      disliked: !already,
      totalLikes: craft.likes.length,
      totalDislikes: craft.dislikes.length,
    });
  } catch (e) {
    console.error("POST /api/crafts/:id/dislike error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Comments...

// POST /api/crafts/:id/comments
router.post("/:id/comments", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Not found" });
    }

    const textRaw = req.body?.text;
    const ratingRaw = req.body?.rating;
    if (!textRaw || !String(textRaw).trim()) {
      return res.status(400).json({ message: "Comment text required" });
    }

    const text = String(textRaw).trim().slice(0, 2000);
    let rating = undefined;
    if (ratingRaw !== undefined && ratingRaw !== null && ratingRaw !== "") {
      const num = Number(ratingRaw);
      if (!Number.isFinite(num) || num < 1 || num > 5) {
        return res.status(400).json({ message: "Invalid rating" });
      }
      rating = num;
    }

    const craft = await Craft.findById(id).select("comments artisanId");
    if (!craft) {
      return res.status(404).json({ message: "Not found" });
    }

    craft.comments.push({ user: req.user.id, text, rating });
    await craft.save();

    // If rating provided, update artisan's rating too
    if (rating !== undefined && craft.artisanId) {
      const artisan = await Artisan.findById(craft.artisanId);
      if (artisan) {
        await artisan.addReview(req.user.id, rating, text);
      }
    }

    const c = craft.comments[craft.comments.length - 1];
    res.status(201).json({
      id: c._id,
      user: c.user,
      text: c.text,
      rating: c.rating,
      createdAt: c.createdAt,
    });
  } catch (e) {
    console.error("POST comment error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/crafts/:id/comments/:commentId
router.delete("/:id/comments/:commentId", auth, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(commentId)
    ) {
      return res.status(404).json({ message: "Not found" });
    }

    const craft = await Craft.findById(id).populate("artisanId", "userId");
    if (!craft) {
      return res.status(404).json({ message: "Not found" });
    }

    const idx = craft.comments.findIndex((c) => String(c._id) === commentId);
    if (idx === -1) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const comment = craft.comments[idx];
    const isCommenter = String(comment.user) === String(req.user.id);
    const isArtisan =
      craft.artisanId?.userId &&
      String(craft.artisanId.userId) === String(req.user.id);
    const isAdmin = req.user.role === "admin";

    if (!isCommenter && !isArtisan && !isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // If comment had rating, update artisan's rating
    if (comment.rating !== undefined && craft.artisanId) {
      const artisan = await Artisan.findById(craft.artisanId);
      if (artisan) {
        await artisan.removeReview(comment.user);
      }
    }

    craft.comments.splice(idx, 1);
    await craft.save();
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE comment error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Business interaction endpoints...

// POST /api/crafts/:id/barter/propose
router.post("/:id/barter/propose", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Not found" });
    }

    const craft = await Craft.findById(id).select("barter artisanId");
    if (!craft || !craft.barter?.available) {
      return res.status(400).json({ message: "Barter not available" });
    }

    if (String(craft.artisanId) === req.user.id) {
      return res.status(400).json({ message: "Cannot propose on own listing" });
    }

    const items = Array.isArray(req.body.itemsOffered)
      ? req.body.itemsOffered
          .slice(0, 10)
          .map((s) => String(s).trim().slice(0, 200))
          .filter(Boolean)
      : [];

    if (!items.length) {
      return res.status(400).json({ message: "At least one item required" });
    }

    const message = req.body.message
      ? String(req.body.message).trim().slice(0, 1000)
      : undefined;

    craft.barter.proposals.push({
      user: req.user.id,
      itemsOffered: items,
      message,
    });

    await craft.save();
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error("propose barter error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/crafts/:id/barter/status/:proposalId
router.patch(
  "/:id/barter/:proposalId/status",
  auth,
  loadCraft,
  ownerOrAdmin,
  async (req, res) => {
    try {
      const { id, proposalId } = req.params;
      const { status } = req.body || {};

      if (!["pending", "approved", "declined", "canceled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const proposal = req.craft.barter?.proposals?.find(
        (p) => String(p._id) === proposalId
      );
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }

      proposal.status = status;
      proposal.updatedAt = new Date();
      await req.craft.save();

      res.json({ ok: true });
    } catch (e) {
      console.error("barter status error", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
