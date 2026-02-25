import React, {
  useState,
  useRef,
  useEffect,
  type FC,
  type RefObject,
} from "react";
import { Link } from "react-router-dom";
import { toAbsoluteMediaUrl } from "../services/media";

const PLACEHOLDER =
  "data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22114%22 viewBox=%220 0 160 114%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23e5e7eb%22/%3E%3Cg fill=%22%239ca3af%22 font-family=%22sans-serif%22 font-size=%2212%22 text-anchor=%22middle%22%3E%3Ctext x=%2280%22 y=%2258%22%3E%D8%A8%D8%AF%D9%88%D9%86 %D8%AA%D8%B5%D9%88%DB%8C%D8%B1%3C/text%3E%3C/g%3E%3C/svg%3E";

export interface CraftItem {
  id?: string;
  title?: string;
  image?: string | null;
  images?: string[];
  price?: number;
  minPrice?: number;
  maxPrice?: number;
  priceRange?: string;
  location?: string | { city?: string; neighborhood?: string };
  description?: string;
  type?: string;
  distanceMeters?: number;
  isNew?: boolean;
  isFeatured?: boolean;
  craftingTime?: string;
}

interface CraftCardProps {
  craft: CraftItem;
  isVisible?: boolean;
}

const CraftCard: FC<CraftCardProps> = ({ craft }) => {
  const rawSrc =
    (craft.image ? toAbsoluteMediaUrl(craft.image) : "") ||
    (Array.isArray(craft.images) && craft.images[0]
      ? toAbsoluteMediaUrl(craft.images[0])
      : "") ||
    PLACEHOLDER;
  const [imgSrc, setImgSrc] = useState<string>(rawSrc);

  const handleImgError = () => setImgSrc(PLACEHOLDER);

  const imageCount = Array.isArray(craft.images)
    ? craft.images.length
    : craft.image
      ? 1
      : 0;

  const formatPrice = (price: number): string =>
    new Intl.NumberFormat("fa-IR").format(price);

  const priceText = craft.price
    ? `${formatPrice(craft.price)} تومان`
    : craft.minPrice && craft.maxPrice
      ? `${formatPrice(craft.minPrice)} - ${formatPrice(craft.maxPrice)} تومان`
      : craft.priceRange
        ? craft.priceRange
        : null;

  const statusTag = craft.isNew
    ? "جدید"
    : craft.isFeatured
      ? "ویژه"
      : craft.distanceMeters && craft.distanceMeters < 1000
        ? `نزدیک ${Math.round(craft.distanceMeters)} متر`
        : null;

  return (
    <Link
      to={`/craft/${craft.id}`}
      className="block p-4 hover:bg-primary-50/50 transition-colors duration-200 motion-reduce:transition-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500"
      aria-label={`دیدن جزئیات ${craft.title}`}
    >
      <div className="flex flex-row-reverse gap-3">
        {/* Thumbnail with photo count badge */}
        <div className="relative w-28 h-28 shrink-0">
          <img
            src={imgSrc}
            alt={craft.title}
            className="w-full h-full object-cover rounded-xl motion-safe:group-hover:brightness-110 transition-all duration-200 motion-reduce:transition-none"
            width="112"
            height="112"
            sizes="112px"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={handleImgError}
            decoding="async"
          />
          {imageCount > 0 && (
            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
              <svg
                className="w-3 h-3"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{imageCount}</span>
            </div>
          )}
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-sm leading-5 text-nakhsha-text line-clamp-2">
              {craft.title}
            </h3>

            {priceText && (
              <div className="mt-1 text-xs text-slate-600">
                <span className="font-semibold">{priceText}</span>
              </div>
            )}

            <div className="mt-1 text-xs text-slate-500 truncate">
              {typeof craft.location === "string"
                ? craft.location
                : craft.location && typeof craft.location === "object"
                  ? craft.location.city
                    ? `${craft.location.city}${
                        craft.location.neighborhood
                          ? "، " + craft.location.neighborhood
                          : ""
                      }`
                    : "—"
                  : craft.type || "—"}
            </div>

            {craft.description && (
              <div className="mt-1 text-xs text-slate-500 truncate">
                {craft.description}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            {statusTag && (
              <span className="text-xs text-red-500 font-medium">
                {statusTag}
              </span>
            )}
            {craft.craftingTime && (
              <span className="text-xs text-slate-400">
                {craft.craftingTime}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

const MemoizedCraftCard = React.memo(CraftCard, (prev, next) => {
  return prev.craft.id === next.craft.id;
});

const Skeleton: FC = () => (
  <div className="p-4">
    <div className="flex gap-3">
      <div className="w-28 h-28 bg-nakhsha-border/30 rounded-xl animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 bg-nakhsha-border/30 w-3/4 rounded animate-pulse" />
        <div className="h-3 bg-nakhsha-border/30 w-1/2 rounded animate-pulse" />
        <div className="h-3 bg-nakhsha-border/30 w-2/3 rounded animate-pulse" />
        <div className="h-3 bg-nakhsha-border/30 w-1/3 rounded animate-pulse mt-4" />
      </div>
    </div>
  </div>
);

interface CraftListProps {
  items?: CraftItem[];
  loading?: boolean;
  scrollRootRef?: RefObject<HTMLElement>;
}

const CraftList: FC<CraftListProps> = ({
  items = [],
  loading = false,
  scrollRootRef,
}) => {
  const [visibleIndices, setVisibleIndices] = useState<Set<number>>(
    () => new Set([0, 1, 2, 3, 4]),
  );
  const observerRef = useRef<IntersectionObserver | null>(null);
  const itemRefsRef = useRef<Map<number, Element>>(new Map());

  useEffect(() => {
    setVisibleIndices(new Set([0, 1, 2, 3, 4]));
  }, [items]);

  useEffect(() => {
    if (loading) return;

    const rootEl = scrollRootRef?.current || null;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleIndices((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const idxAttr = (entry.target as HTMLElement).dataset?.idx;
            if (idxAttr == null) continue;
            const idx = Number(idxAttr);
            if (entry.isIntersecting) next.add(idx);
          }
          return next;
        });
      },
      { root: rootEl, rootMargin: "200px 0px", threshold: 0.01 },
    );

    observerRef.current = observer;
    for (const node of itemRefsRef.current.values()) {
      if (node) observer.observe(node);
    }

    return () => {
      observer.disconnect();
      if (observerRef.current === observer) observerRef.current = null;
    };
  }, [loading, items, scrollRootRef]);

  if (loading) {
    return (
      <div className="divide-y divide-gray-100">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div
        className="p-6 text-center text-sm text-nakhsha-text/60"
        role="status"
      >
        نتیجه‌ای پیدا نشد.
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {items.map((craft, idx) => {
        const shouldRender = visibleIndices.has(idx) || idx < 5;
        return (
          <div
            key={craft.id || idx}
            ref={(el) => {
              const prev = itemRefsRef.current.get(idx);
              if (prev && observerRef.current)
                observerRef.current.unobserve(prev);
              if (el) {
                itemRefsRef.current.set(idx, el);
                if (observerRef.current) observerRef.current.observe(el);
              } else {
                itemRefsRef.current.delete(idx);
              }
            }}
            data-idx={idx}
          >
            {shouldRender ? (
              <MemoizedCraftCard craft={craft} isVisible />
            ) : (
              <div className="p-4 h-32 bg-transparent" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CraftList;
