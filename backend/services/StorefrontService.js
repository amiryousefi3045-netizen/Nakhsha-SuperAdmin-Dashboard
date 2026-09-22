const SellerProfile = require("../models/SellerProfile");
const Product = require("../models/Product");

// Public storefront exposes only curated fields. Money stays integer Rial;
// internal stock quantities (onHand/reserved) are never leaked to visitors.
const PUBLISHED_PROFILE_SELECT =
  "_id storeName slug description logo cover contact location stats createdAt";

const PUBLIC_PRODUCT_SELECT =
  "title description images category price currency tags lowStockThreshold rating stockPolicy stock.onHand stock.reserved createdAt";

const PRODUCT_CATEGORIES = [
  "carpet",
  "pottery",
  "metalwork",
  "woodwork",
  "textile",
  "jewelry",
  "leather",
  "home_decor",
  "accessories",
  "tourism",
  "other",
];

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function publicStorefrontToDTO(profile) {
  return {
    id: String(profile._id),
    storeName: profile.storeName,
    slug: profile.slug,
    description: profile.description || "",
    logo: profile.logo || "",
    cover: profile.cover || "",
    contact:
      profile.contact && typeof profile.contact === "object"
        ? profile.contact
        : {},
    location: {
      city: profile.location?.city || "",
      neighborhood: profile.location?.neighborhood || "",
    },
    stats: {
      totalProducts: profile.stats?.totalProducts ?? 0,
      averageRating: profile.stats?.averageRating ?? 0,
      ratingCount: profile.stats?.ratingCount ?? 0,
    },
    createdAt: profile.createdAt,
  };
}

function publicProductToDTO(product) {
  const onHand = product.stock?.onHand ?? 0;
  const reserved = product.stock?.reserved ?? 0;
  const availableStock = Math.max(0, onHand - reserved);
  const tracked = product.stockPolicy === "tracked";
  return {
    id: String(product._id),
    title: product.title,
    description: product.description || "",
    images: product.images || [],
    category: product.category,
    price: product.price,
    currency: product.currency || "IRR",
    tags: product.tags || [],
    availableStock,
    isLowStock:
      tracked && availableStock > 0 && availableStock <= (product.lowStockThreshold ?? 0),
    isOutOfStock: tracked && availableStock <= 0,
    rating: product.rating || { average: 0, count: 0 },
    createdAt: product.createdAt,
  };
}

const StorefrontService = {
  /**
   * Resolve a seller's public storefront — exists only when the owner
   * explicitly published it (settings.storefrontPublished) AND the profile
   * is active. Everything else (unpublished, suspended, deactivated or
   * unknown slug) resolves to null so we never leak whether a store exists.
   */
  async findPublishedStorefront(slug) {
    const norm = String(slug || "").trim().toLowerCase();
    if (!norm) return null;
    return SellerProfile.findOne({
      slug: norm,
      status: "active",
      "settings.storefrontPublished": true,
    })
      .select(PUBLISHED_PROFILE_SELECT)
      .lean();
  },

  async getStorefront(slug) {
    const profile = await this.findPublishedStorefront(slug);
    if (!profile) return null;
    return publicStorefrontToDTO(profile);
  },

  /**
   * Public storefront directory — every published + active store, paginated.
   * Same visibility gate as a single storefront: unpublished and suspended
   * profiles never appear in the directory (no existence leak).
   */
  async listStorefronts({ page, limit, q, sort }) {
    const filter = {
      status: "active",
      "settings.storefrontPublished": true,
    };
    if (q && String(q).trim()) {
      const safe = escapeRegex(String(q).trim());
      filter.$or = [
        { storeName: { $regex: safe, $options: "i" } },
        { description: { $regex: safe, $options: "i" } },
        { slug: { $regex: safe, $options: "i" } },
      ];
    }

    let sortSpec;
    if (sort === "rating") sortSpec = { "stats.averageRating": -1, "stats.ratingCount": -1, createdAt: -1 };
    else if (sort === "products") sortSpec = { "stats.totalProducts": -1, createdAt: -1 };
    else sortSpec = { createdAt: -1 };

    const skip = Math.max(0, ((page || 1) - 1) * (limit || 25));

    const [items, total] = await Promise.all([
      SellerProfile.find(filter)
        .select(PUBLISHED_PROFILE_SELECT)
        .sort(sortSpec)
        .skip(skip)
        .limit(limit)
        .lean(),
      SellerProfile.countDocuments(filter),
    ]);

    return {
      items: items.map(publicStorefrontToDTO),
      total,
      page: page || 1,
      limit: limit || 25,
    };
  },

  async listStorefrontProducts({ slug, page, limit, category, q, sort }) {
    const profile = await this.findPublishedStorefront(slug);
    if (!profile) return null;

    const filter = { sellerId: profile._id, status: "active" };
    if (category) filter.category = category;
    if (q && String(q).trim()) {
      const safe = escapeRegex(String(q).trim());
      filter.$or = [
        { title: { $regex: safe, $options: "i" } },
        { tags: { $regex: safe, $options: "i" } },
      ];
    }

    let sortSpec;
    if (sort === "priceAsc") sortSpec = { price: 1, createdAt: -1 };
    else if (sort === "priceDesc") sortSpec = { price: -1, createdAt: -1 };
    else sortSpec = { createdAt: -1 };

    const skip = Math.max(0, ((page || 1) - 1) * (limit || 25));

    const [items, total] = await Promise.all([
      Product.find(filter)
        .select(PUBLIC_PRODUCT_SELECT)
        .sort(sortSpec)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return {
      storefront: publicStorefrontToDTO(profile),
      items: items.map(publicProductToDTO),
      total,
      page: page || 1,
      limit: limit || 25,
    };
  },

  async getStorefrontProduct({ slug, productId }) {
    const profile = await this.findPublishedStorefront(slug);
    if (!profile) return null;

    const product = await Product.findOne({
      _id: productId,
      sellerId: profile._id,
      status: "active",
    })
      .select(PUBLIC_PRODUCT_SELECT)
      .lean();
    if (!product) return null;

    return {
      storefront: publicStorefrontToDTO(profile),
      product: publicProductToDTO(product),
    };
  },
};

module.exports = {
  StorefrontService,
  publicStorefrontToDTO,
  publicProductToDTO,
  PRODUCT_CATEGORIES,
};