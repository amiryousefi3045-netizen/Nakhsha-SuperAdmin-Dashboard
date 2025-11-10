// This file previously contained legacy recipe route handlers.
// Those handlers have been removed as part of the migration to /api/crafts.
// The file is retained as an archival stub. Do NOT mount this router in production.
const express = require("express");

const router = express.Router();

router.use((req, res) => {
  res.status(410).json({
    message:
      "This legacy recipes router has been removed. Use /api/crafts and the Craft model instead.",
  });
});

module.exports = router;

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
            title: "قالی دستباف سرایان",
            image:
              "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=60",
            cookingTime: "۳۶۰ دقیقه",
            difficulty: "سخت",
            location: "کرمان، سرایان",
            lat: 30.0,
            lng: 56.0,
            isHandmade: true,
          },
          {
            id: "dev-2",
            title: "کوزه سرامیکی سنتی",
            image: toAbs("/uploads/ceramic.jpg"),
            cookingTime: "۱۸۰ دقیقه",
            difficulty: "متوسط",
            location: "اصفهان، جلفا",
            lat: 32.64,
            lng: 51.67,
            isHandmade: true,
          },
        ],
        total: 2,
        page: 1,
        limit: 50,
        mock: true,
      });
    }
    // Support both flat query params and nested objects from axios (e.g. bounds[north], filters[city])
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

    const north = getBound("north");
    const south = getBound("south");
    const east = getBound("east");
    const west = getBound("west");
    const city = getFilter("city");
    const difficulty = getFilter("difficulty");
    const isVegetarian = getFilter("isVegetarian");
    const q = rawQuery.q || rawQuery.q || rawQuery.q;
    const limit = rawQuery.limit || 50;
    const page = rawQuery.page || 1;
    const rawSort = rawQuery.sort;
    const lng = rawQuery.lng; // user position for distance
    const lat = rawQuery.lat;
    const donation = rawQuery.donation;
    const hosting = rawQuery.hosting;
    const barter = rawQuery.barter;
    const sale = rawQuery.sale;

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
        title: "قالی دستباف کردی",
        description:
          "قالی دستباف با نقوش کردی و رنگ‌های طبیعی؛ مناسب برای دکوراسیون سنتی.",
        images: [
          "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=60",
        ],
        cookingTime: { prep: 120, cook: 240, total: 360 },
        difficulty: "سخت",
        servings: null,
        category: "فرش",
        tags: ["دست‌ساز", "قالی"],
        isHandmade: true,
        author,
        location: {
          city: "کردستان",
          neighborhood: "سنندج",
          coordinates: [47.0, 35.3],
        },
        extra: { materials: ["پشم", "رنگ طبیعی"], dimensions: "200x150cm" },
      },
      {
        title: "کوزه سرامیکی لعاب‌دار",
        description: "کوزه سفالی سنتی با لعاب دست‌ساز؛ مناسب نگهداری و نمایش.",
        images: [
          "https://images.unsplash.com/photo-1524594154907-6f0f2a2a4f2b?w=800&q=60",
        ],
        cookingTime: { prep: 60, cook: 120, total: 180 },
        difficulty: "متوسط",
        servings: null,
        category: "سرامیک",
        tags: ["ظرف", "سرامیک"],
        isHandmade: true,
        author,
        location: {
          city: "اصفهان",
          neighborhood: "جلفا",
          coordinates: [51.67, 32.64],
        },
        extra: { materials: ["خاک رس", "لعاب"], dimensions: "ارتفاع 30cm" },
      },
      {
        title: "جعبه چوبی منبت‌کاری",
        description:
          "جعبه چوبی منبت‌کاری شده با طراحی محلی؛ مناسب هدیه و دکوری.",
        images: [
          "https://images.unsplash.com/photo-1505592422499-2a9d6f5a78d5?w=800&q=60",
        ],
        cookingTime: { prep: 80, cook: 160, total: 240 },
        difficulty: "متوسط",
        servings: null,
        category: "چوب",
        tags: ["منبت", "دست‌ساز"],
        isHandmade: true,
        author,
        location: {
          city: "تبریز",
          neighborhood: "مرکز",
          coordinates: [46.29, 38.08],
        },
        extra: { materials: ["چوب گردو"], dimensions: "20x15x8cm" },
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
        title: "نمونه موقت (Dev)",
        description:
          "این یک نمونه موقت صنایع‌دستی است چون در پایگاه داده یافت نشد یا اتصال برقرار نیست.",
        images: [],
        author: { id: "dev-user", name: "کاربر موقت" },
        ingredients: [], // legacy field; not used for crafts
        instructions: [], // legacy field; not used for crafts
        cookingTime: {}, // repurposed as estimated crafting time
        difficulty: "متوسط",
        servings: null,
        category: "فرش",
        tags: [],
        isHandmade: true,
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
router.post(":id/like", auth, async (req, res) => {
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

module.exports = router;
