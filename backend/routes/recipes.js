const express = require("express");
const Recipe = require("../models/Recipe");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const router = express.Router();
// In-memory fallback store for dev mode when DB is unavailable or recipe missing
const memoryReactions = {
  likes: new Map(), // recipeId -> Set(userId)
  dislikes: new Map(),
};
function ensureSet(map, key) {
  if (!map.has(key)) map.set(key, new Set());
  return map.get(key);
}
function toggleMem(primaryMap, oppositeMap, recipeId, userId) {
  const p = ensureSet(primaryMap, recipeId);
  const o = ensureSet(oppositeMap, recipeId);
  let active;
  if (p.has(userId)) {
    p.delete(userId);
    active = false;
  } else {
    p.add(userId);
    o.delete(userId);
    active = true;
  }
  return {
    active,
    totalLikes: memoryReactions.likes.get(recipeId)?.size || 0,
    totalDislikes: memoryReactions.dislikes.get(recipeId)?.size || 0,
  };
}
// Simple JWT auth middleware reused from auth route
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
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
function adminOnly(req, res, next) {
  if (req.user?.role !== "admin")
    return res.status(403).json({ message: "Forbidden" });
  next();
}

async function loadRecipe(req, res, next) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: "Not found" });
  }
  const r = await Recipe.findById(id).select("author");
  if (!r) return res.status(404).json({ message: "Not found" });
  req.recipe = r;
  next();
}

function ownerOrAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  if (!req.recipe?.author)
    return res.status(403).json({ message: "Forbidden" });
  if (String(req.recipe.author) !== String(req.user?.id))
    return res.status(403).json({ message: "Forbidden" });
  next();
}

// Provide category-based fallback images so items without images still look relevant
const uploadsDir = path.join(__dirname, "..", "uploads");
const firstExistingUpload = (prefix) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const match = files.find((f) => {
      const low = f.toLowerCase();
      return (
        (low.startsWith(prefix + ".") || low.startsWith(prefix + "-")) &&
        (low.endsWith(".jpg") || low.endsWith(".jpeg") || low.endsWith(".png"))
      );
    });
    return match ? "/uploads/" + match : null;
  } catch {
    return null;
  }
};

const fallbackForCategory = (cat) => {
  if (cat === "کباب") {
    return (
      process.env.FALLBACK_KEBAB_URL ||
      firstExistingUpload("kebab") ||
      "https://images.unsplash.com/photo-1604908554200-4d8f8d9ba4b3?w=800&q=60"
    );
  }
  if (cat === "سوپ") {
    // treat ash as soup
    return (
      process.env.FALLBACK_ASH_URL ||
      firstExistingUpload("ash") ||
      "https://images.unsplash.com/photo-1617191517009-bb4d9c504761?w=800&q=60"
    );
  }
  const defaults = {
    خورش: "https://images.unsplash.com/photo-1604908176997-431c3a7280e5?w=800&q=60",
    سالاد:
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=60",
    دسر: "https://images.unsplash.com/photo-1551024709-8f23befc6cf7?w=800&q=60",
    برنج: "https://images.unsplash.com/photo-1604908207268-1a2fba9b5d7f?w=800&q=60",
    نان: "https://images.unsplash.com/photo-1549931319-420c83f9b21d?w=800&q=60",
    "پیش غذا":
      "https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=60",
    نوشیدنی:
      "https://images.unsplash.com/photo-1541976076758-347942db197b?w=800&q=60",
  };
  return (
    defaults[cat] ||
    "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?w=800&q=60"
  );
};
const getCategoryImage = fallbackForCategory;

// Helpers to validate/choose image URLs
const looksLikeFile = (u) => {
  if (!u || typeof u !== "string") return false;
  const s = u.trim();
  // Accept any http(s) image URL (server will serve appropriate content-type)
  if (/^https?:\/\//i.test(s)) return true;
  // Accept local uploads served by this backend
  if (/^\/uploads\//.test(s) || /\/uploads\//.test(s)) return true;
  // Fallback: check extension ignoring query/hash
  const pathPart = s.split("?")[0].split("#")[0];
  const last = pathPart.split("/").pop() || "";
  return /\.(jpg|jpeg|png|webp)$/i.test(last);
};
const isUploadsPath = (u) =>
  typeof u === "string" && (/^\/uploads\//.test(u) || /\/uploads\//.test(u));
const pickImageForRecipe = (r, toAbs) => {
  const title = (r.title || "").toString();
  const realImages = Array.isArray(r.images) ? r.images : [];
  // Prefer local overrides when title matches
  const kebabOverride = fallbackForCategory("کباب");
  const ashOverride = fallbackForCategory("سوپ"); // آش → سوپ
  if (title.includes("کباب") && kebabOverride) return toAbs(kebabOverride);
  if (title.includes("آش") && ashOverride) return toAbs(ashOverride);
  // Find first valid real image (http(s) or /uploads/... and looks like a file)
  const real = realImages.find((u) => looksLikeFile(u));
  if (real) return toAbs(real);
  // Else fallback by category
  return toAbs(getCategoryImage(r.category));
};

// GET /api/recipes
// Query params: north,south,east,west, city, difficulty, isVegetarian ("true"), q, limit, page
router.get("/", async (req, res) => {
  try {
    // Avoid stale caches during active development / frequent edits
    res.set("Cache-Control", "no-store");
    const toAbs = (url) => {
      if (!url) return url;
      if (typeof url !== "string") return url;
      if (url.startsWith("http://") || url.startsWith("https://")) return url;
      // treat as server-relative path
      return `${req.protocol}://${req.get("host")}${
        url.startsWith("/") ? url : "/" + url
      }`;
    };
    // If DB isn't ready (dev), return a small mock so UI stays functional
    if (!req.app.locals.dbReady) {
      return res.json({
        items: [
          {
            id: "dev-1",
            title: "قرمه‌سبزی",
            image:
              "https://images.unsplash.com/photo-1604908176997-431c3a7280e5?w=800&q=60",
            cookingTime: "۱۲۰ دقیقه",
            difficulty: "متوسط",
            location: "تهران، ونک",
            lat: 35.735,
            lng: 51.41,
          },
          {
            id: "dev-2",
            title: "کباب کوبیده",
            image: toAbs("/uploads/kebab.jpg"),
            cookingTime: "۴۵ دقیقه",
            difficulty: "سخت",
            location: "اصفهان، جلفا",
            lat: 32.64,
            lng: 51.67,
          },
        ],
        total: 2,
        page: 1,
        limit: 50,
        mock: true,
      });
    }
    const {
      north,
      south,
      east,
      west,
      city,
      difficulty,
      isVegetarian,
      q,
      limit = 50,
      page = 1,
      sort: rawSort,
      lng, // user position for distance
      lat,
      donation,
      hosting,
      barter,
      sale,
    } = req.query;

    const filter = { isPublished: true };

    // Text search
    if (q) {
      filter.$text = { $search: q };
    }

    // City filter
    if (city) {
      filter["location.city"] = city;
    }

    // Difficulty
    if (difficulty) {
      filter.difficulty = difficulty;
    }

    // Vegetarian
    if (isVegetarian === "true") {
      filter.isVegetarian = true;
    }

    // Bounds -> polygon for 2dsphere index
    if (
      north !== undefined &&
      south !== undefined &&
      east !== undefined &&
      west !== undefined
    ) {
      const n = parseFloat(north);
      const s = parseFloat(south);
      const e = parseFloat(east);
      const w = parseFloat(west);
      if ([n, s, e, w].every((v) => Number.isFinite(v))) {
        filter["location.coordinates"] = {
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
    }

    const pageSize = Math.min(parseInt(limit, 10) || 50, 100);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);

    // Availability flags
    if (donation === "true") filter["donation.available"] = true;
    if (hosting === "true") filter["hosting.available"] = true;
    if (barter === "true") filter["barter.available"] = true;
    if (sale === "true") filter["sale.available"] = true;

    // Determine effective sort: prioritize distance if coords provided and no explicit sort
    const userLng = parseFloat(lng);
    const userLat = parseFloat(lat);
    const wantDistance =
      (!rawSort || rawSort === "") &&
      Number.isFinite(userLng) &&
      Number.isFinite(userLat);
    const sortParam = rawSort || (wantDistance ? "distance" : undefined);

    // Sorting
    let sortSpec = { createdAt: -1 };
    switch (sortParam) {
      case "oldest":
        sortSpec = { createdAt: 1 };
        break;
      case "timeAsc":
        sortSpec = { "cookingTime.total": 1, createdAt: -1 };
        break;
      case "timeDesc":
        sortSpec = { "cookingTime.total": -1, createdAt: -1 };
        break;
      case "popular":
        sortSpec = { views: -1, createdAt: -1 };
        break;
      default:
        sortSpec = { createdAt: -1 };
    }

    let items, total;
    if (
      sortParam === "distance" &&
      Number.isFinite(userLng) &&
      Number.isFinite(userLat)
    ) {
      const geoPipeline = [
        {
          $geoNear: {
            near: { type: "Point", coordinates: [userLng, userLat] },
            distanceField: "_distance",
            spherical: true,
            query: filter,
          },
        },
        { $sort: { _distance: 1 } },
        { $skip: (pageNum - 1) * pageSize },
        { $limit: pageSize },
      ];
      const countPromise = Recipe.countDocuments(filter);
      const agg = await Recipe.aggregate(geoPipeline);
      total = await countPromise;
      items = agg.map((doc) => Object.assign(new Recipe(doc), doc));
    } else {
      const results = await Promise.all([
        Recipe.find(filter)
          .sort(sortSpec)
          .skip((pageNum - 1) * pageSize)
          .limit(pageSize),
        Recipe.countDocuments(filter),
      ]);
      items = results[0];
      total = results[1];
    }

    const mapRecipe = (r) => {
      const image = pickImageForRecipe(r, toAbs);
      const realImage = Array.isArray(r.images) && r.images[0];
      const base = {
        id: r._id,
        title: r.title,
        image,
        hasImage: !!realImage,
        cookingTime: r.cookingTime?.total ? `${r.cookingTime.total} دقیقه` : "",
        difficulty: r.difficulty,
        location: `${r.location?.city || ""}${
          r.location?.neighborhood ? "، " + r.location.neighborhood : ""
        }`,
        lat: r.location?.coordinates?.[1],
        lng: r.location?.coordinates?.[0],
        donation: r.donation?.available || false,
        hosting: r.hosting?.available || false,
        barter: r.barter?.available || false,
        sale: r.sale?.available || false,
        totalLikes: r.likes?.length || 0,
        totalDislikes: r.dislikes?.length || 0,
        commentsCount: (r.comments || []).length,
      };
      if (r._doc && r._doc._distance !== undefined) {
        base.distanceMeters = Math.round(r._doc._distance);
      }
      return base;
    };

    res.json({
      items: items.map(mapRecipe),
      total,
      page: pageNum,
      limit: pageSize,
    });
  } catch (err) {
    console.error("GET /api/recipes error", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/recipes/:id - fetch single recipe by id
// DEV ONLY: seed a few sample recipes (placed before :id to avoid conflicts)
router.get("/seed/dev", async (req, res) => {
  try {
    const count = await Recipe.estimatedDocumentCount();
    if (count > 0) return res.json({ ok: true, message: "Already seeded" });

    const author = new mongoose.Types.ObjectId();
    const docs = [
      {
        title: "قرمه‌سبزی",
        description: "قرمه‌سبزی اصیل با سبزی تازه و لوبیا قرمز.",
        ingredients: [
          { name: "گوشت گوسفندی", amount: "۳۰۰", unit: "گرم" },
          { name: "لوبیا قرمز", amount: "۱", unit: "پیمانه" },
          { name: "سبزی قرمه", amount: "۳", unit: "پیمانه" },
        ],
        instructions: [
          { step: 1, description: "لوبیا را از شب قبل خیس کنید." },
          { step: 2, description: "گوشت را تفت دهید و سبزی را اضافه کنید." },
        ],
        images: [
          "https://images.unsplash.com/photo-1604908176997-431c3a7280e5?w=800&q=60",
        ],
        cookingTime: { prep: 20, cook: 100, total: 120 },
        difficulty: "متوسط",
        servings: 4,
        category: "خورش",
        tags: ["سنتی", "ایرانی"],
        isVegetarian: false,
        author,
        location: {
          city: "تهران",
          neighborhood: "ونک",
          coordinates: [51.41, 35.735],
        },
      },
      {
        title: "کباب کوبیده",
        description: "کباب کوبیده زعفرانی با برنج ایرانی.",
        ingredients: [
          { name: "گوشت چرخ‌کرده", amount: "۵۰۰", unit: "گرم" },
          { name: "پیاز", amount: "۲", unit: "عدد" },
        ],
        instructions: [
          { step: 1, description: "پیاز را رنده و آب آن را بگیرید." },
          { step: 2, description: "گوشت و ادویه را ورز دهید و سیخ کنید." },
        ],
        images: [
          "https://images.unsplash.com/photo-1604908554200-4d8f8d9ba4b3?w=800&q=60",
        ],
        cookingTime: { prep: 20, cook: 25, total: 45 },
        difficulty: "سخت",
        servings: 3,
        category: "کباب",
        tags: ["زغالی"],
        isVegetarian: false,
        author,
        location: {
          city: "اصفهان",
          neighborhood: "جلفا",
          coordinates: [51.67, 32.64],
        },
      },
      {
        title: "آش رشته",
        description: "آش رشته جاافتاده با نعناع‌داغ.",
        ingredients: [
          { name: "رشته آش", amount: "۲۰۰", unit: "گرم" },
          { name: "سبزی آش", amount: "۳", unit: "پیمانه" },
        ],
        instructions: [
          { step: 1, description: "حبوبات را جداگانه نیم‌پز کنید." },
          { step: 2, description: "سبزی و رشته را اضافه و جا بیندازید." },
        ],
        images: [
          "https://images.unsplash.com/photo-1617191517009-bb4d9c504761?w=800&q=60",
        ],
        cookingTime: { prep: 15, cook: 45, total: 60 },
        difficulty: "آسان",
        servings: 5,
        category: "سوپ",
        tags: ["گیاهی"],
        isVegetarian: true,
        author,
        location: {
          city: "شیراز",
          neighborhood: "معالی‌آباد",
          coordinates: [52.52, 29.61],
        },
      },
    ];

    await Recipe.insertMany(docs);
    res.json({ ok: true, inserted: docs.length });
  } catch (e) {
    console.error("seed error", e);
    res.status(500).json({ message: "Seed failed" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    // Avoid stale caches during active development / frequent edits
    res.set("Cache-Control", "no-store");
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: "Not found" });
    }
    let r = null;
    if (req.app.locals.dbReady) {
      r = await Recipe.findById(id).populate("author", "name avatar");
      if (r) {
        try {
          r.views = (r.views || 0) + 1;
          await r.save();
        } catch {}
      }
    }
    if (!r && process.env.NODE_ENV !== "production") {
      // Dev placeholder with memory reaction counts
      return res.json({
        id,
        title: "دستور موقت (Dev)",
        description:
          "این یک رکورد موقت است چون در پایگاه داده یافت نشد یا اتصال برقرار نیست.",
        images: [],
        author: { id: "dev-user", name: "کاربر موقت" },
        ingredients: [],
        instructions: [],
        cookingTime: {},
        difficulty: "متوسط",
        servings: 1,
        category: "خورش",
        tags: [],
        isVegetarian: false,
        isVegan: false,
        location: { city: "", neighborhood: "", coordinates: [51.4, 35.7] },
        hasImage: false,
        averageRating: 0,
        totalLikes: memoryReactions.likes.get(id)?.size || 0,
        totalDislikes: memoryReactions.dislikes.get(id)?.size || 0,
        liked: false,
        disliked: false,
        createdAt: new Date().toISOString(),
        culturalStory: "",
        wasteReductionTips: [],
        donation: {},
        hosting: {},
        barter: {},
        sale: {},
        container: {},
      });
    }
    if (!r) return res.status(404).json({ message: "Not found" });

    const toAbs = (url) => {
      if (!url) return url;
      if (typeof url !== "string") return url;
      if (url.startsWith("http://") || url.startsWith("https://")) return url;
      return `${req.protocol}://${req.get("host")}${
        url.startsWith("/") ? url : "/" + url
      }`;
    };

    const realImage = Array.isArray(r.images) && r.images[0];
    const primary = pickImageForRecipe(r, toAbs);
    const realImages = (Array.isArray(r.images) ? r.images : [])
      .filter((u) => looksLikeFile(u))
      .map((u) => toAbs(u));
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
    const imagesOut = uniq([primary, ...realImages]);

    // Determine like/dislike state if auth header supplied
    let liked = false;
    let disliked = false;
    try {
      const h = req.headers.authorization || "";
      const token = h.startsWith("Bearer ") ? h.slice(7) : null;
      if (token) {
        const u = jwt.verify(token, JWT_SECRET);
        if (u?.id) {
          liked = r.likes.some((l) => String(l.user) === String(u.id));
          disliked = (r.dislikes || []).some(
            (d) => String(d.user) === String(u.id)
          );
        }
      }
    } catch {
      // ignore invalid token for public view
    }

    res.json({
      id: r._id,
      title: r.title,
      description: r.description,
      images: imagesOut,
      author: r.author
        ? { id: r.author._id || r.author, name: r.author.name }
        : undefined,
      ingredients: r.ingredients || [],
      instructions: r.instructions || [],
      cookingTime: r.cookingTime || {},
      difficulty: r.difficulty,
      servings: r.servings,
      category: r.category,
      tags: r.tags || [],
      isVegetarian: r.isVegetarian,
      isVegan: r.isVegan,
      location: r.location || {},
      hasImage: !!realImage,
      averageRating: r.averageRating,
      totalLikes: r.totalLikes,
      totalDislikes: r.totalDislikes,
      liked,
      disliked,
      createdAt: r.createdAt,
      culturalStory: r.culturalStory,
      wasteReductionTips: r.wasteReductionTips || [],
      donation: r.donation || {},
      hosting: r.hosting || {},
      barter: r.barter || {},
      sale: r.sale || {},
      container: r.container || {},
      totalDislikes: r.totalDislikes,
      comments: (r.comments || []).map((c) => ({
        id: c._id,
        user: c.user,
        text: c.text,
        rating: c.rating,
        createdAt: c.createdAt,
      })),
      commentsCount: (r.comments || []).length,
    });
  } catch (err) {
    console.error("GET /api/recipes/:id error", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Create a new recipe (JSON body, dev-friendly)
router.post("/", auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (
      !b.title ||
      !b.description ||
      !b.difficulty ||
      !b.servings ||
      !b.category
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Basic sanitize/normalize
    b.title = String(b.title).trim().slice(0, 200);
    b.description = String(b.description).trim().slice(0, 5000);
    const clampArray = (arr) => (Array.isArray(arr) ? arr.slice(0, 100) : []);
    b.ingredients = clampArray(b.ingredients).filter(
      (x) => x && x.name && String(x.name).trim()
    );
    b.instructions = clampArray(b.instructions)
      .filter((x) => x && x.description && String(x.description).trim())
      .map((x, i) => ({
        step: i + 1,
        title:
          x.title && String(x.title).trim()
            ? String(x.title).trim().slice(0, 200)
            : undefined,
        description: String(x.description).trim(),
        image: x.image,
        video: x.video,
      }));
    b.images = clampArray(b.images).filter((u) => typeof u === "string");

    const coords = b.location?.coordinates;
    let coordinates = coords;
    if (
      !coordinates &&
      typeof b.location?.lat === "number" &&
      typeof b.location?.lng === "number"
    ) {
      coordinates = [b.location.lng, b.location.lat];
    }
    if (!coordinates || coordinates.length !== 2) {
      return res
        .status(400)
        .json({ message: "location.coordinates or lat/lng required" });
    }

    const doc = await Recipe.create({
      title: b.title,
      description: b.description,
      ingredients: b.ingredients || [],
      instructions: b.instructions || [],
      images: b.images || [],
      cookingTime: b.cookingTime || {},
      difficulty: b.difficulty,
      servings: b.servings,
      category: b.category,
      tags: b.tags || [],
      isVegetarian: !!b.isVegetarian,
      isVegan: !!b.isVegan,
      author: req.user?.id || b.author || new mongoose.Types.ObjectId(),
      location: {
        city: b.location?.city || "",
        neighborhood: b.location?.neighborhood || "",
        coordinates,
      },
      isPublished: b.isPublished !== false,
      culturalStory: b.culturalStory?.slice(0, 6000),
      wasteReductionTips: Array.isArray(b.wasteReductionTips)
        ? b.wasteReductionTips.slice(0, 20).map((t) => String(t).slice(0, 500))
        : [],
      donation: b.donation || undefined,
      hosting: b.hosting || undefined,
      barter: b.barter || undefined,
      sale: b.sale || undefined,
      container: b.container || undefined,
    });
    res.status(201).json({ id: doc._id });
  } catch (e) {
    if (e?.name === "ValidationError") {
      const details = Object.values(e.errors || {}).map((er) => er.message);
      return res.status(400).json({ message: "Validation error", details });
    }
    console.error("POST /api/recipes error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Update a recipe by id
router.put("/:id", auth, loadRecipe, ownerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};
    const update = {};
    const str = (v, n) =>
      v === undefined ? undefined : String(v).trim().slice(0, n);
    const clampArray = (arr, n = 100) =>
      Array.isArray(arr) ? arr.slice(0, n) : undefined;
    if (b.title !== undefined) update.title = b.title;
    if (b.description !== undefined)
      update.description = str(b.description, 5000);
    if (b.ingredients !== undefined)
      update.ingredients = (clampArray(b.ingredients) || []).filter(
        (x) => x && x.name && String(x.name).trim()
      );
    if (b.instructions !== undefined)
      update.instructions = (clampArray(b.instructions) || [])
        .filter((x) => x && x.description && String(x.description).trim())
        .map((x, i) => ({
          step: i + 1,
          title:
            x.title && String(x.title).trim()
              ? String(x.title).trim().slice(0, 200)
              : undefined,
          description: String(x.description).trim(),
          image: x.image,
          video: x.video,
        }));
    if (b.images !== undefined)
      update.images = (clampArray(b.images) || []).filter(
        (u) => typeof u === "string"
      );
    if (b.cookingTime !== undefined) update.cookingTime = b.cookingTime;
    if (b.difficulty !== undefined) update.difficulty = b.difficulty;
    if (b.servings !== undefined) update.servings = b.servings;
    if (b.category !== undefined) update.category = b.category;
    if (b.tags !== undefined) update.tags = b.tags;
    if (b.isVegetarian !== undefined) update.isVegetarian = !!b.isVegetarian;
    if (b.isVegan !== undefined) update.isVegan = !!b.isVegan;
    if (b.isPublished !== undefined) update.isPublished = !!b.isPublished;
    if (b.culturalStory !== undefined)
      update.culturalStory = String(b.culturalStory).slice(0, 6000);
    if (b.wasteReductionTips !== undefined)
      update.wasteReductionTips = Array.isArray(b.wasteReductionTips)
        ? b.wasteReductionTips
            .slice(0, 20)
            .map((t) => String(t).trim().slice(0, 500))
            .filter(Boolean)
        : [];
    if (b.donation !== undefined) update.donation = b.donation;
    if (b.hosting !== undefined) update.hosting = b.hosting;
    if (b.barter !== undefined) update.barter = b.barter;
    if (b.sale !== undefined) update.sale = b.sale;
    if (b.container !== undefined) update.container = b.container;

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
        update["location.coordinates"] = coordinates;
      }
    }

    const doc = await Recipe.findByIdAndUpdate(id, update, {
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
    console.error("PUT /api/recipes/:id error", e?.message, e?.stack);
    res
      .status(500)
      .json({ message: "Server error", error: e?.message || "Unknown" });
  }
});

// DEV ONLY: seed a few sample recipes

// DELETE /api/recipes/:id - remove a recipe (owner or admin)
router.delete("/:id", auth, loadRecipe, ownerOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Recipe.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/recipes/:id error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/recipes/:id/like - toggle like
router.post("/:id/like", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || "dev-user";
    const dbMode =
      req.app.locals.dbReady && mongoose.Types.ObjectId.isValid(id);
    console.log("[LIKE] incoming", {
      id,
      userId,
      dbReady: req.app.locals.dbReady,
      validId: mongoose.Types.ObjectId.isValid(id),
      dbMode,
      time: new Date().toISOString(),
    });
    if (!dbMode) {
      const r = toggleMem(
        memoryReactions.likes,
        memoryReactions.dislikes,
        id,
        userId
      );
      console.log("[LIKE] memory toggle", {
        id,
        liked: r.active,
        totalLikes: r.totalLikes,
        totalDislikes: r.totalDislikes,
      });
      return res.json({
        liked: r.active,
        totalLikes: r.totalLikes,
        totalDislikes: r.totalDislikes,
        dev: true,
      });
    }
    const recipe = await Recipe.findById(id).select("likes dislikes");
    if (!recipe) {
      const r = toggleMem(
        memoryReactions.likes,
        memoryReactions.dislikes,
        id,
        userId
      );
      console.log("[LIKE] recipe not found in DB, memory fallback", {
        id,
        liked: r.active,
      });
      return res.json({
        liked: r.active,
        totalLikes: r.totalLikes,
        totalDislikes: r.totalDislikes,
        dev: true,
        note: "fallback-memory",
      });
    }
    const already = recipe.likes.find((l) => String(l.user) === userId);
    if (already) {
      recipe.likes = recipe.likes.filter((l) => String(l.user) !== userId);
    } else {
      recipe.likes.push({ user: userId });
      recipe.dislikes = (recipe.dislikes || []).filter(
        (d) => String(d.user) !== userId
      );
    }
    await recipe.save();
    console.log("[LIKE] db toggle", {
      id,
      liked: !already,
      totalLikes: recipe.likes.length,
      totalDislikes: recipe.dislikes.length,
    });
    res.json({
      liked: !already,
      totalLikes: recipe.likes.length,
      totalDislikes: recipe.dislikes.length,
    });
  } catch (e) {
    console.error("POST /api/recipes/:id/like error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/recipes/:id/dislike - toggle dislike
router.post("/:id/dislike", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || "dev-user";
    const dbMode =
      req.app.locals.dbReady && mongoose.Types.ObjectId.isValid(id);
    console.log("[DISLIKE] incoming", {
      id,
      userId,
      dbReady: req.app.locals.dbReady,
      validId: mongoose.Types.ObjectId.isValid(id),
      dbMode,
      time: new Date().toISOString(),
    });
    if (!dbMode) {
      const r = toggleMem(
        memoryReactions.dislikes,
        memoryReactions.likes,
        id,
        userId
      );
      console.log("[DISLIKE] memory toggle", {
        id,
        disliked: r.active,
        totalLikes: r.totalLikes,
        totalDislikes: r.totalDislikes,
      });
      return res.json({
        disliked: r.active,
        totalLikes: r.totalLikes,
        totalDislikes: r.totalDislikes,
        dev: true,
      });
    }
    const recipe = await Recipe.findById(id).select("likes dislikes");
    if (!recipe) {
      const r = toggleMem(
        memoryReactions.dislikes,
        memoryReactions.likes,
        id,
        userId
      );
      console.log("[DISLIKE] recipe not found in DB, memory fallback", {
        id,
        disliked: r.active,
      });
      return res.json({
        disliked: r.active,
        totalLikes: r.totalLikes,
        totalDislikes: r.totalDislikes,
        dev: true,
        note: "fallback-memory",
      });
    }
    const already = (recipe.dislikes || []).find(
      (d) => String(d.user) === userId
    );
    if (already) {
      recipe.dislikes = recipe.dislikes.filter(
        (d) => String(d.user) !== userId
      );
    } else {
      recipe.dislikes = recipe.dislikes || [];
      recipe.dislikes.push({ user: userId });
      recipe.likes = recipe.likes.filter((l) => String(l.user) !== userId);
    }
    await recipe.save();
    console.log("[DISLIKE] db toggle", {
      id,
      disliked: !already,
      totalLikes: recipe.likes.length,
      totalDislikes: recipe.dislikes.length,
    });
    res.json({
      disliked: !already,
      totalLikes: recipe.likes.length,
      totalDislikes: recipe.dislikes.length,
    });
  } catch (e) {
    console.error("POST /api/recipes/:id/dislike error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// --- Comments ---
// POST /api/recipes/:id/comments { text, rating }
router.post("/:id/comments", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(404).json({ message: "Not found" });
    if (!req.app.locals.dbReady)
      return res.status(503).json({ message: "DB not ready (dev mode only)" });
    const textRaw = req.body?.text;
    const ratingRaw = req.body?.rating;
    if (!textRaw || !String(textRaw).trim())
      return res.status(400).json({ message: "Comment text required" });
    const text = String(textRaw).trim().slice(0, 2000);
    let rating = undefined;
    if (ratingRaw !== undefined && ratingRaw !== null && ratingRaw !== "") {
      const num = Number(ratingRaw);
      if (!Number.isFinite(num) || num < 1 || num > 5)
        return res.status(400).json({ message: "Invalid rating" });
      rating = num;
    }
    const recipe = await Recipe.findById(id).select("comments");
    if (!recipe) return res.status(404).json({ message: "Not found" });
    recipe.comments.push({ user: req.user.id, text, rating });
    await recipe.save();
    const c = recipe.comments[recipe.comments.length - 1];
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

// DELETE /api/recipes/:id/comments/:commentId (only owner of comment or admin)
router.delete("/:id/comments/:commentId", auth, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(404).json({ message: "Not found" });
    if (!mongoose.Types.ObjectId.isValid(commentId))
      return res.status(404).json({ message: "Not found" });
    if (!req.app.locals.dbReady)
      return res.status(503).json({ message: "DB not ready (dev mode only)" });
    const recipe = await Recipe.findById(id).select("comments author");
    if (!recipe) return res.status(404).json({ message: "Not found" });
    const idx = recipe.comments.findIndex(
      (c) => String(c._id) === String(commentId)
    );
    if (idx === -1) return res.status(404).json({ message: "Not found" });
    const comment = recipe.comments[idx];
    const isOwner = String(comment.user) === String(req.user.id);
    const isAuthor = String(recipe.author) === String(req.user.id);
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAuthor && !isAdmin)
      return res.status(403).json({ message: "Forbidden" });
    recipe.comments.splice(idx, 1);
    await recipe.save();
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE comment error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// DEBUG: list registered recipe sub-routes (dev only)
router.get("/__debug/routes", (req, res) => {
  if (process.env.NODE_ENV === "production")
    return res.status(404).json({ message: "Not found" });
  try {
    const stack = router.stack || [];
    const routes = [];
    stack.forEach((layer) => {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods || {})
          .filter((m) => layer.route.methods[m])
          .map((m) => m.toUpperCase());
        routes.push({ path: layer.route.path, methods });
      }
    });
    res.json({ base: "/api/recipes", count: routes.length, routes });
  } catch (e) {
    res.status(500).json({ message: "debug error" });
  }
});

// DEBUG: quick ping to verify like route matching without side-effects
router.get("/:id/like/ping", (req, res) => {
  res.json({ ok: true, id: req.params.id, route: "/:id/like/ping" });
});

// --- Interaction flows ---
// POST /api/recipes/:id/donation/claim { portions }
router.post("/:id/donation/claim", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(404).json({ message: "Not found" });
    const r = await Recipe.findById(id).select("donation author");
    if (!r || !r.donation?.available)
      return res.status(400).json({ message: "Donation not available" });
    const portionsReq = parseInt(req.body.portions || 1, 10);
    if (!Number.isFinite(portionsReq) || portionsReq < 1)
      return res.status(400).json({ message: "Invalid portions" });
    if (String(r.author) === req.user.id)
      return res.status(400).json({ message: "Cannot claim own donation" });
    // Remaining portions calculation
    const claimed = (r.donation.claims || [])
      .filter((c) => c.status !== "declined" && c.status !== "canceled")
      .reduce((a, c) => a + (c.portions || 0), 0);
    const total = r.donation.portions || 0;
    if (claimed + portionsReq > total)
      return res.status(400).json({ message: "Not enough portions left" });
    r.donation.claims.push({ user: req.user.id, portions: portionsReq });
    await r.save();
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error("claim donation error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/recipes/:id/hosting/join { guests }
router.post("/:id/hosting/join", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(404).json({ message: "Not found" });
    const r = await Recipe.findById(id).select("hosting author");
    if (!r || !r.hosting?.available)
      return res.status(400).json({ message: "Hosting not available" });
    const guests = parseInt(req.body.guests || 1, 10);
    if (!Number.isFinite(guests) || guests < 1)
      return res.status(400).json({ message: "Invalid guests" });
    if (String(r.author) === req.user.id)
      return res.status(400).json({ message: "Cannot join own hosting" });
    const approvedOrPending = (r.hosting.guests || [])
      .filter((g) => g.status !== "declined" && g.status !== "canceled")
      .reduce((a, g) => a + (g.guests || 0), 0);
    const cap = r.hosting.capacity || 0;
    if (approvedOrPending + guests > cap)
      return res.status(400).json({ message: "Capacity exceeded" });
    r.hosting.guests.push({ user: req.user.id, guests });
    await r.save();
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error("join hosting error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/recipes/:id/sale/order { portions }
router.post("/:id/sale/order", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(404).json({ message: "Not found" });
    const r = await Recipe.findById(id).select("sale author");
    if (!r || !r.sale?.available)
      return res.status(400).json({ message: "Sale not available" });
    const portionsReq = parseInt(req.body.portions || 1, 10);
    if (!Number.isFinite(portionsReq) || portionsReq < 1)
      return res.status(400).json({ message: "Invalid portions" });
    if (String(r.author) === req.user.id)
      return res.status(400).json({ message: "Cannot order own listing" });
    const existing = (r.sale.orders || [])
      .filter((o) => o.status !== "declined" && o.status !== "canceled")
      .reduce((a, o) => a + (o.portions || 0), 0);
    const total = r.sale.portions || 0;
    if (existing + portionsReq > total)
      return res.status(400).json({ message: "Not enough portions left" });
    const amount = (r.sale.pricePerPortion || 0) * portionsReq;
    r.sale.orders.push({ user: req.user.id, portions: portionsReq, amount });
    await r.save();
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error("order sale error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/recipes/:id/barter/propose { itemsOffered[], message }
router.post("/:id/barter/propose", auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(404).json({ message: "Not found" });
    const r = await Recipe.findById(id).select("barter author");
    if (!r || !r.barter?.available)
      return res.status(400).json({ message: "Barter not available" });
    if (String(r.author) === req.user.id)
      return res.status(400).json({ message: "Cannot propose on own listing" });
    const items = Array.isArray(req.body.itemsOffered)
      ? req.body.itemsOffered
          .slice(0, 10)
          .map((s) => String(s).trim().slice(0, 200))
          .filter(Boolean)
      : [];
    if (!items.length)
      return res.status(400).json({ message: "At least one item required" });
    const message = req.body.message
      ? String(req.body.message).trim().slice(0, 1000)
      : undefined;
    r.barter.proposals.push({
      user: req.user.id,
      itemsOffered: items,
      message,
    });
    await r.save();
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error("propose barter error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH status for interaction (admin or owner approves / declines)
// Body: { type: donation|hosting|sale|barter, subId, status }
router.patch(
  "/:id/interaction/status",
  auth,
  loadRecipe,
  ownerOrAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { type, subId, status } = req.body || {};
      const allowedStatus = ["pending", "approved", "declined", "canceled"];
      if (!allowedStatus.includes(status))
        return res.status(400).json({ message: "Invalid status" });
      const r = await Recipe.findById(id).select(type);
      if (!r) return res.status(404).json({ message: "Not found" });
      let listPath;
      switch (type) {
        case "donation":
          listPath = "donation.claims";
          break;
        case "hosting":
          listPath = "hosting.guests";
          break;
        case "sale":
          listPath = "sale.orders";
          break;
        case "barter":
          listPath = "barter.proposals";
          break;
        default:
          return res.status(400).json({ message: "Invalid type" });
      }
      const segments = listPath.split(".");
      let ref = r[segments[0]][segments[1]];
      const item = ref.find((x) => String(x._id) === String(subId));
      if (!item) return res.status(404).json({ message: "Sub item not found" });
      item.status = status;
      item.updatedAt = new Date();
      await r.save();
      res.json({ ok: true });
    } catch (e) {
      console.error("interaction status patch error", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// GET /api/recipes/:id/interactions (owner/admin) optional ?type=
router.get(
  "/:id/interactions",
  auth,
  loadRecipe,
  ownerOrAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { type } = req.query;
      const projection = {
        donation: 1,
        hosting: 1,
        sale: 1,
        barter: 1,
        title: 1,
        category: 1,
        createdAt: 1,
      };
      const r = await Recipe.findById(id).select(projection);
      if (!r) return res.status(404).json({ message: "Not found" });
      const sanitizeList = (arr, fields) =>
        (arr || []).map((x) => {
          const out = {
            id: x._id,
            status: x.status,
            createdAt: x.createdAt,
            updatedAt: x.updatedAt,
          };
          fields.forEach((f) => {
            if (x[f] !== undefined) out[f] = x[f];
          });
          if (x.user) out.user = x.user; // front-end can later populate if needed
          return out;
        });
      const payload = {
        id: r._id,
        title: r.title,
        category: r.category,
      };
      const wantAll = !type;
      if (wantAll || type === "donation")
        payload.donation = r.donation?.available
          ? {
              available: true,
              portions: r.donation.portions,
              expiresAt: r.donation.expiresAt,
              claims: sanitizeList(r.donation.claims, ["portions"]),
            }
          : { available: false };
      if (wantAll || type === "hosting")
        payload.hosting = r.hosting?.available
          ? {
              available: true,
              capacity: r.hosting.capacity,
              eventDate: r.hosting.eventDate,
              guests: sanitizeList(r.hosting.guests, ["guests"]),
            }
          : { available: false };
      if (wantAll || type === "sale")
        payload.sale = r.sale?.available
          ? {
              available: true,
              pricePerPortion: r.sale.pricePerPortion,
              currency: r.sale.currency,
              portions: r.sale.portions,
              orders: sanitizeList(r.sale.orders, ["portions", "amount"]),
            }
          : { available: false };
      if (wantAll || type === "barter")
        payload.barter = r.barter?.available
          ? {
              available: true,
              desiredItems: r.barter.desiredItems,
              proposals: sanitizeList(r.barter.proposals, [
                "itemsOffered",
                "message",
              ]),
            }
          : { available: false };
      res.json(payload);
    } catch (e) {
      console.error("GET interactions error", e);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// GET /api/recipes/mine/interactions - summary across user's recipes
router.get("/mine/interactions", auth, async (req, res) => {
  try {
    const recipes = await Recipe.find({ author: req.user.id })
      .select({
        title: 1,
        donation: 1,
        hosting: 1,
        sale: 1,
        barter: 1,
        category: 1,
        createdAt: 1,
      })
      .sort({ createdAt: -1 })
      .limit(300);
    const items = recipes.map((r) => ({
      id: r._id,
      title: r.title,
      category: r.category,
      donation: r.donation?.available
        ? {
            available: true,
            portions: r.donation.portions,
            claimsCount: (r.donation.claims || []).length,
          }
        : { available: false },
      hosting: r.hosting?.available
        ? {
            available: true,
            capacity: r.hosting.capacity,
            guestsCount: (r.hosting.guests || []).length,
          }
        : { available: false },
      sale: r.sale?.available
        ? {
            available: true,
            portions: r.sale.portions,
            ordersCount: (r.sale.orders || []).length,
          }
        : { available: false },
      barter: r.barter?.available
        ? {
            available: true,
            desiredItems: r.barter.desiredItems?.slice(0, 5) || [],
            proposalsCount: (r.barter.proposals || []).length,
          }
        : { available: false },
      createdAt: r.createdAt,
    }));
    res.json({ items });
  } catch (e) {
    console.error("mine interactions summary error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/recipes/mine - list recipes created by current user
router.get("/mine/list", auth, async (req, res) => {
  try {
    const items = await Recipe.find({ author: req.user.id })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ items });
  } catch (e) {
    console.error("GET /api/recipes/mine error", e);
    res.status(500).json({ message: "Server error" });
  }
});

// Lightweight existence check (no auth) GET /api/recipes/:id/exists
router.get("/:id/exists", async (req, res) => {
  try {
    if (!req.app.locals.dbReady)
      return res.json({ exists: false, db: "disconnected" });
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.json({ exists: false, reason: "invalid id" });
    const found = await Recipe.exists({ _id: id });
    res.json({ exists: !!found });
  } catch (e) {
    res.status(500).json({ exists: false, message: "error" });
  }
});

module.exports = router;
