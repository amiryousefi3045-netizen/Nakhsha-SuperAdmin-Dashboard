/**
 * Public storefront domain types.
 *
 * These mirror the backend storefront DTOs (no seller-internal fields such as
 * status, stock, sku, finance or verification data are ever exposed).
 */

export interface StorefrontStats {
  totalProducts: number;
  averageRating: number;
  ratingCount: number;
}

export interface StorefrontContact {
  phone?: string;
  email?: string;
  telegram?: string;
  instagram?: string;
  whatsapp?: string;
}

export interface StorefrontProfile {
  id: string;
  storeName: string;
  slug: string;
  description?: string;
  logo?: string;
  cover?: string;
  contact?: StorefrontContact;
  location?: { city?: string; neighborhood?: string };
  stats: StorefrontStats;
  createdAt?: string;
}

export interface StorefrontProduct {
  id: string;
  title: string;
  description?: string;
  images: string[];
  category: string;
  price: number;
  currency: string;
  tags: string[];
  /** Derived stock: onHand − reserved (only when stockPolicy === "tracked"). */
  availableStock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  createdAt?: string;
}

export type StorefrontSort = "newest" | "priceAsc" | "priceDesc";

export interface ListStorefrontProductsParams {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
  sort?: StorefrontSort;
}

export interface StorefrontProductsPage {
  items: StorefrontProduct[];
  total: number;
  page: number;
  limit: number;
}

/** Product category enum values accepted by the public storefront. */
export const STOREFRONT_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "carpet", label: "فرش" },
  { value: "pottery", label: "سفالگری" },
  { value: "metalwork", label: "فلزکاری" },
  { value: "woodwork", label: "نجاری" },
  { value: "textile", label: "نساجی" },
  { value: "jewelry", label: "زیورآلات" },
  { value: "leather", label: "چرم" },
  { value: "home_decor", label: "دکوراسیون" },
  { value: "accessories", label: "اکسسوری" },
  { value: "tourism", label: "گردشگری" },
  { value: "other", label: "سایر" },
];