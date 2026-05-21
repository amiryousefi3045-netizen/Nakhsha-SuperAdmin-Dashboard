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
} = require("../middleware/validate");
const {
  isValidCoordinates,
  normalizeLocation,
} = require("../utils/geospatial");

const { requireAuth } = require("../middleware/auth");
const { createErrorResponse } = require("../utils/userDto");
const { heavyLimiter } = require("../middleware/rateLimiter");
const { toAbsoluteUrl } = require("../utils/urls");

/** Convert every stored image path in an array to an absolute URL. */
function mapImages(images, req) {
  if (!Array.isArray(images)) return [];
  return images.map((img) => toAbsoluteUrl(img, req));
}

const router = express.Router();

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

/**
 * Ownership/admin gate — must run after requireAuth and loadCraft.
 * Uses the standardized req.user shape { id, role } set by requireAuth.
 */
function ownerOrAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  if (!req.craft?.artisanId?.userId) {
    return res
      .status(403)
      .json(createErrorResponse("FORBIDDEN", "Access denied"));
  }
  if (String(req.craft.artisanId.userId) !== String(req.user?.id)) {
    return res
      .status(403)
      .json(createErrorResponse("FORBIDDEN", "Access denied"));
  }
  next();
}

// GET /api/crafts
// Query: bounds, filters (city, craftType, priceRange), page, limit, q, sort
// Applies the heavy-endpoint rate limiter (30 req/min per IP) because this
// route runs $text search and geospatial bounds queries.
router.get("/", heavyLimiter, async (req, res) => {
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
      // Basic sanity checks: ensure bounds make sense (north > south, east > west)
      if (!(n > s && e > w)) {
        console.warn(
          "Ignoring invalid bounds (north/south or east/west inverted)",
          {
            n,
            s,
            e,
            w,
            rawQuery,
          },
        );
      } else {
        try {
          // Support both new GeoJSON format (`location.geometry`) and legacy
          // coordinate arrays (`location.coordinates`). Many older documents may
          // not have geometry yet, which would otherwise make the map show only
          // a tiny subset of listings.
          const polygon = {
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
          };

          const boundsOr = {
            $or: [
              {
                "location.geometry": {
                  $geoWithin: {
                    $geometry: polygon,
                  },
                },
              },
              {
                // Legacy numeric bounds check (lng/lat stored as [lng, lat])
                "location.coordinates.0": { $gte: w, $lte: e },
                "location.coordinates.1": { $gte: s, $lte: n },
              },
            ],
          };

          filter.$and = Array.isArray(filter.$and) ? filter.$and : [];
          filter.$and.push(boundsOr);
        } catch (ex) {
          // Defensive: if Polygon creation or value causes a runtime error, log and skip geo filter
          console.error("Failed to build geo polygon from bounds", {
            n,
            s,
            e,
            w,
            err: ex && ex.message,
            rawQuery,
          });
        }
      }
    }

    // Basic filters
    const city = getFilter("city");
    if (city) filter["location.city"] = city;

    const craftType = getFilter("craftType");
    if (craftType) filter.craftType = craftType;

    const forSale = getFilter("forSale");
    if (forSale === "true") filter.forSale = true;

    // Price range filter (format: "min-max" or "min+" for open-ended)
    let priceRange = getFilter("priceRange");
    if (Array.isArray(priceRange)) {
      priceRange = priceRange.join("-");
    }
    if (priceRange) {
      const [min, max] = String(priceRange).split("-");
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
      // Handle both legacy (location.coordinates) and new (location.geometry.coordinates) formats
      let lng, lat;
      if (c.location?.coordinates && Array.isArray(c.location.coordinates)) {
        [lng, lat] = c.location.coordinates;
      } else if (
        c.location?.geometry?.coordinates &&
        Array.isArray(c.location.geometry.coordinates)
      ) {
        [lng, lat] = c.location.geometry.coordinates;
      }

      const base = {
        id: c._id,
        title: c.title,
        description: c.description,
        images: mapImages(c.images, req),
        craftType: c.craftType,
        price: c.price,
        forSale: c.forSale,
        location: c.location?.city
          ? `${c.location.city}${
              c.location.neighborhood ? "، " + c.location.neighborhood : ""
            }`
          : "",
        lat,
        lng,
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
// Applies the heavy-endpoint rate limiter (30 req/min per IP)
router.get(
  "/near",
  heavyLimiter,
  validate(nearQuerySchema, "query"),
  async (req, res) => {
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
            Object.values(ix.key || {}).some((v) => v === "text"),
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
            e && e.message,
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
          radius,
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
          "ms",
        );
        const results = agg.map((doc) => ({
          id: doc._id,
          title: doc.title,
          description: doc.description,
          images: mapImages(doc.images, req),
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
          "title description images craftType price forSale location tags createdAt",
        )
        .limit(100)
        .sort({ createdAt: -1 });

      console.log(
        "[crafts:near] fallback non-geo query, docsReturned=%d, elapsed=%dms",
        docs.length,
        Date.now() - start,
      );
      const formatted = docs.map((doc) => ({
        id: doc._id,
        title: doc.title,
        description: doc.description,
        images: mapImages(doc.images, req),
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
  },
);

// Development seed endpoint (enhanced): supports `count` query param
router.get("/seed/dev", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ message: "Not available in production" });
  }
  console.log("[seed] /seed/dev called with query:", req.query);

  const count = Math.min(
    Math.max(parseInt(req.query.count || "2", 10) || 2, 1),
    1000,
  );

  try {
    // Delete small set of test data first to avoid large accidental wipes
    await Promise.all([
      User.deleteMany({ phone: "09123456789" }),
      Artisan.deleteMany({}),
      Craft.deleteMany({}),
    ]);

    // Create a test artisan if none exists
    let artisan = await Artisan.findOne();
    let user = null; // Initialize user outside the scope
    if (!artisan) {
      const hashedPassword = await bcrypt.hash("test123", 10);
      try {
        user = await User.create({
          name: "استاد حسین",
          phone: "09123456789",
          role: "user",
          location: {
            city: "یزد",
            province: "یزد",
            coordinates: [54.3675, 31.8974],
          },
          isVerified: true,
        });
      } catch (e) {
        if (e && e.code === 11000) {
          user = await User.findOne({ phone: "09123456789" });
        } else {
          throw e;
        }
      }

      try {
        const artisanPayload = {
          userId: user._id,
          name: "کارگاه استاد حسین",
          craftType: "سفال و سرامیک",
          otherCraftTypes: ["سفال و سرامیک"],
          bio: "استاد سفالگری با بیش از ۳۰ سال تجربه",
          stars: 4.5,
          verified: true,
          location: {
            city: "یزد",
            neighborhood: "فهادان",
            coordinates: [54.3675, 31.8974],
          },
          contactInfo: { phone: "09123456789" },
        };
        console.log("[seed] Creating artisan with payload:", artisanPayload);
        artisan = await Artisan.create(artisanPayload);
      } catch (e) {
        if (e && e.code === 11000) {
          artisan = await Artisan.findOne({ userId: user._id });
        } else {
          throw e;
        }
      }
    }

    // If artisan already existed, get the related user
    if (!user && artisan) {
      user = await User.findOne({ _id: artisan.userId });
    }

    // Helper pools
    const titles = [
      "گلدان سنتی",
      "کوزه سفالی",
      "جاشمعی مسی",
      "تابلو مینیاتور",
      "گلیم کوچک",
      "پیش‌بند دست‌باف",
      "سینی قلم‌زنی",
      "جقه چوبی",
      "لیوان سفالی",
      "گوشواره ملیله",
    ];
    // Use backend canonical craftType keys
    const craftTypes = [
      "pottery",
      "carpet",
      "metalwork",
      "woodwork",
      "textile",
      "leather",
      "other",
    ];
    const cities = [
      { city: "تهران", coords: [51.41, 35.69] },
      { city: "شیراز", coords: [52.54, 29.61] },
      { city: "اصفهان", coords: [51.67, 32.64] },
      { city: "تبریز", coords: [46.29, 38.08] },
      { city: "یزد", coords: [54.36, 31.89] },
      { city: "مشهد", coords: [59.6, 36.31] },
    ];

    const sampleCrafts = [];
    for (let i = 0; i < count; i++) {
      const isEducational = i < 20; // first 20 educational
      const title = `${titles[i % titles.length]} ${i + 1}`;
      const type = craftTypes[i % craftTypes.length];
      const cityInfo = cities[i % cities.length];
      const price = isEducational
        ? 0
        : Math.floor(200000 + Math.random() * 5000000);
      const images = [
        `https://source.unsplash.com/collection/190727/800x600?sig=${i}`,
      ];

      sampleCrafts.push({
        title,
        description: isEducational
          ? `دوره آموزشی ${title} — مناسب برای علاقه‌مندان و هنرجویان.`
          : `محصول ${title} ساخته شده توسط هنرمند محلی، مناسب برای خرید.`,
        artisanId: artisan._id,
        craftType: type,
        kind: isEducational ? "class" : "artwork",
        author: user ? user._id : artisan._id,
        price: price,
        forSale: !isEducational,
        images,
        location: {
          city: cityInfo.city,
          neighborhood: "بازار سنتی",
          geometry: { type: "Point", coordinates: cityInfo.coords },
        },
        tags: isEducational ? ["آموزشی", "دوره"] : ["فروش", type],
        culturalStory: isEducational
          ? "دوره آموزشی با تمرکز بر تکنیک‌های سنتی"
          : "محصولی با پیشینه محلی",
        isPublished: true,
        createdAt: new Date(),
      });
    }

    const crafts = await Craft.create(sampleCrafts);

    res.json({
      message: `Created ${crafts.length} sample crafts`,
      crafted: crafts.slice(0, 50).map((c) => ({ id: c._id })),
      count: crafts.length,
    });
  } catch (err) {
    console.error("Seed mass error:", err);
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
        const u = jwt.verify(token, process.env.JWT_SECRET);
        if (u?.id) {
          liked = craft.likes.some((l) => String(l.user) === String(u.id));
          disliked = craft.dislikes.some(
            (d) => String(d.user) === String(u.id),
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
      images: mapImages(craft.images, req),
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
router.post("/", requireAuth, validate(createCraftSchema), async (req, res) => {
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

    // Extract and validate coordinates from request body
    // Validation schema ensures proper GeoJSON format if location is provided
    let locationData = {
      city: b.location?.city || "",
      neighborhood: b.location?.neighborhood || "",
    };

    // If location geometry is provided, use it
    if (b.location?.geometry?.coordinates) {
      locationData.geometry = {
        type: "Point",
        coordinates: b.location.geometry.coordinates,
      };
    }
    // Support legacy coordinates format [lng, lat]
    else if (
      Array.isArray(b.location?.coordinates) &&
      b.location.coordinates.length === 2
    ) {
      const [lng, lat] = b.location.coordinates;
      if (lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
        locationData.geometry = {
          type: "Point",
          coordinates: [lng, lat],
        };
      }
    }

    const doc = await Craft.create({
      title: b.title,
      description: b.description,
      author: req.user.id,
      artisanId: artisan._id,
      kind: b.kind || "artwork",
      images: b.images || [],
      craftType: b.craftType,
      price: b.price,
      forSale: b.forSale !== false,
      tags: b.tags || [],
      location: locationData,
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
router.put("/:id", requireAuth, loadCraft, ownerOrAdmin, async (req, res) => {
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

    // Location update with proper validation
    if (b.location) {
      const loc = b.location;
      if (loc.city !== undefined) update["location.city"] = loc.city;
      if (loc.neighborhood !== undefined)
        update["location.neighborhood"] = loc.neighborhood;

      // Extract coordinates from various formats
      let coordinates = null;

      // GeoJSON geometry
      if (loc.geometry && Array.isArray(loc.geometry.coordinates)) {
        coordinates = loc.geometry.coordinates;
      }
      // Array format [lng, lat]
      else if (Array.isArray(loc.coordinates) && loc.coordinates.length === 2) {
        coordinates = loc.coordinates;
      }
      // Object format {lng, lat}
      else if (typeof loc.lng === "number" && typeof loc.lat === "number") {
        coordinates = [loc.lng, loc.lat];
      }

      // Validate and update coordinates
      if (coordinates && coordinates.length === 2) {
        const [lng, lat] = coordinates;
        if (isValidCoordinates(lng, lat)) {
          // Use GeoJSON geometry for updates (findByIdAndUpdate bypasses save hooks)
          update["location.geometry"] = {
            type: "Point",
            coordinates: [lng, lat],
          };
        } else {
          return res.status(400).json({
            message: "مختصات جغرافیایی نامعتبر است",
            details: { lng, lat },
          });
        }
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
router.delete(
  "/:id",
  requireAuth,
  loadCraft,
  ownerOrAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const doc = await Craft.findByIdAndDelete(id);
      if (!doc) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      console.error("DELETE /api/crafts/:id error", e);
      res.status(500).json({ message: "Server error" });
    }
  },
);

// Social interactions...

// POST /api/crafts/:id/like - toggle like
router.post("/:id/like", requireAuth, async (req, res) => {
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
router.post("/:id/dislike", requireAuth, async (req, res) => {
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
router.post("/:id/comments", requireAuth, async (req, res) => {
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
router.delete("/:id/comments/:commentId", requireAuth, async (req, res) => {
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
router.post("/:id/barter/propose", requireAuth, async (req, res) => {
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
  requireAuth,
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
        (p) => String(p._id) === proposalId,
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
  },
);

module.exports = router;
