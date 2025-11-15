import { Link } from "react-router-dom";
import React, { useState, useRef, useEffect } from "react";

const PLACEHOLDER =
  "data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%22114%22 viewBox=%220 0 160 114%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23e5e7eb%22/%3E%3Cg fill=%22%239ca3af%22 font-family=%22sans-serif%22 font-size=%2212%22 text-anchor=%22middle%22%3E%3Ctext x=%2280%22 y=%2258%22%3E%D8%A8%D8%AF%D9%88%D9%86 %D8%AA%D8%B5%D9%88%DB%8C%D8%B1%3C/text%3E%3C/g%3E%3C/svg%3E";

const CraftCard = ({ craft }) => {
  const [imgSrc, setImgSrc] = React.useState(
    craft.image ||
      (Array.isArray(craft.images) && craft.images[0]) ||
      PLACEHOLDER
  );

  const handleImgError = () => {
    setImgSrc(PLACEHOLDER);
  };

  return (
    <Link
      to={`/craft/${craft.id}`}
      className="block p-3 hover:bg-gray-50 transition-colors duration-200 motion-reduce:transition-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400"
      aria-label={`دیدن جزئیات ${craft.title}`}
    >
      <div className="flex gap-3 items-start">
        <img
          src={imgSrc}
          alt={craft.title}
          className="w-28 h-20 object-cover rounded-md flex-shrink-0 motion-safe:group-hover:brightness-110 transition-all duration-200 motion-reduce:transition-none"
          width="112"
          height="80"
          sizes="(max-width: 640px) 100px, 112px"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={handleImgError}
          decoding="async"
        />
        <div className="flex-1 text-right">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base text-gray-900">
              {craft.title}
            </h3>
            <span className="text-xs font-medium text-gray-500">
              {craft.duration || craft.craftingTime || ""}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-end gap-1 text-xs text-gray-500 flex-wrap">
            {typeof craft.distanceMeters === "number" && (
              <span
                className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none hover:bg-blue-100"
                title={`${
                  craft.distanceMeters < 1000
                    ? craft.distanceMeters + " متر"
                    : (craft.distanceMeters / 1000).toFixed(1) + " کیلومتر"
                }`}
              >
                {craft.distanceMeters < 1000
                  ? `${Math.round(craft.distanceMeters)} متر`
                  : `${(craft.distanceMeters / 1000).toFixed(1)} کیلومتر`}
              </span>
            )}
            <span>
              {typeof craft.location === "string"
                ? craft.location
                : craft.location && typeof craft.location === "object"
                ? craft.location.city
                  ? `${craft.location.city}${
                      craft.location.neighborhood
                        ? "، " + craft.location.neighborhood
                        : ""
                    }`
                  : Array.isArray(craft.location.coordinates)
                  ? `${Number(craft.location.coordinates[1]).toFixed(
                      3
                    )}, ${Number(craft.location.coordinates[0]).toFixed(3)}`
                  : "—"
                : "—"}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-3.5 h-3.5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M11.54 22.351l-.345-.207C9.727 21.274 3 17.13 3 10.5 3 6.358 6.358 3 10.5 3S18 6.358 18 10.5c0 6.63-6.727 10.774-8.195 11.644l-.265.157zM10.5 6a4.5 4.5 0 100 9 4.5 4.5 0 000-9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-500 font-medium transition-colors duration-150 motion-reduce:transition-none hover:bg-gray-200">
              {craft.type}
            </span>
            {craft.hasImage === false && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-medium">
                بدون تصویر
              </span>
            )}
            {craft.isHandmade && (
              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-medium">
                دست‌ساز
              </span>
            )}
            {typeof craft.totalLikes === "number" && craft.totalLikes > 0 && (
              <span
                className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[11px] flex items-center gap-1 font-medium transition-colors duration-150 motion-reduce:transition-none hover:bg-green-100"
                aria-label={`${craft.totalLikes} پسند`}
              >
                👍 {craft.totalLikes}
              </span>
            )}
            {typeof craft.totalDislikes === "number" &&
              craft.totalDislikes > 0 && (
                <span
                  className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[11px] flex items-center gap-1 font-medium transition-colors duration-150 motion-reduce:transition-none hover:bg-red-100"
                  aria-label={`${craft.totalDislikes} نپسند`}
                >
                  👎 {craft.totalDislikes}
                </span>
              )}
          </div>

          {/* CTA Footer */}
          <div className="mt-3 flex items-center gap-2">
            {/* Primary CTA - View Details */}
            <button
              onClick={(e) => {
                e.preventDefault();
                window.location.href = `/craft/${craft.id}`;
              }}
              className="flex-1 rounded-full h-9 px-4 bg-gray-900 text-white text-sm font-medium hover:bg-black transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400"
              aria-label={`دیدن جزئیات ${craft.title}`}
            >
              دیدن جزئیات
            </button>

            {/* Secondary CTA - Save */}
            <button
              onClick={(e) => {
                e.preventDefault();
                // TODO: Implement save functionality
                console.log("Save craft:", craft.id);
              }}
              className="rounded-full h-9 w-9 bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400 flex items-center justify-center"
              title="ذخیره"
              aria-label="ذخیره این اثر"
            >
              <svg
                className="w-4 h-4"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 19V5z" />
              </svg>
            </button>

            {/* Secondary CTA - Share */}
            <button
              onClick={(e) => {
                e.preventDefault();
                // TODO: Implement share functionality
                if (navigator.share) {
                  navigator.share({
                    title: craft.title,
                    text: craft.description || craft.title,
                    url: `/craft/${craft.id}`,
                  });
                } else {
                  console.log("Share craft:", craft.id);
                }
              }}
              className="rounded-full h-9 w-9 bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400 flex items-center justify-center"
              title="اشتراک"
              aria-label="اشتراک این اثر"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C9.589 12.938 10.45 12.5 11.3 12.1m0 0a6 6 0 11-8.485 2.936m8.485-2.936l6.364 3.686m0 0l1.364.682a1 1 0 001.364-1.366L19 15"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
};

const MemoizedCraftCard = React.memo(CraftCard, (prevProps, nextProps) => {
  return prevProps.craft.id === nextProps.craft.id;
});

const Skeleton = () => (
  <div className="p-3">
    <div className="flex gap-3">
      <div className="w-28 h-20 bg-gray-200 rounded-md animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 w-1/2 rounded animate-pulse" />
        <div className="h-3 bg-gray-200 w-1/3 rounded animate-pulse" />
        <div className="h-3 bg-gray-200 w-1/4 rounded animate-pulse" />
      </div>
    </div>
  </div>
);

const CraftList = ({ items = [], loading = false }) => {
  const [visibleIndices, setVisibleIndices] = useState(new Set());
  const observerRef = useRef(null);
  const itemRefsRef = useRef(new Map());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleIndices((prevIndices) => {
          const newVisibleIndices = new Set(prevIndices);

          entries.forEach((entry) => {
            const idx = entry.target.dataset.idx;
            if (entry.isIntersecting || entry.boundingClientRect.top < 800) {
              newVisibleIndices.add(Number(idx));
            }
          });

          return newVisibleIndices;
        });
      },
      {
        root: null,
        rootMargin: "100px",
        threshold: 0,
      }
    );

    observerRef.current = observer;

    itemRefsRef.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    itemRefsRef.current.clear();
  }, [items]);

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
      <div className="p-6 text-center text-sm text-gray-500" role="status">
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
              if (el) itemRefsRef.current.set(idx, el);
            }}
            data-idx={idx}
          >
            {shouldRender ? (
              <MemoizedCraftCard craft={craft} isVisible={true} />
            ) : (
              <div className="p-3 h-28 bg-transparent" />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CraftList;
