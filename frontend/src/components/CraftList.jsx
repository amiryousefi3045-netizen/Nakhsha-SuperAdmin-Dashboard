import { Link } from "react-router-dom";

// Inline SVG placeholder (light gray) for when images are missing or fail to load
const PLACEHOLDER =
  "data:image/svg+xml;utf8,\
  <svg xmlns='http://www.w3.org/2000/svg' width='160' height='114' viewBox='0 0 160 114'>\
    <rect width='100%' height='100%' fill='%23e5e7eb'/>\
    <g fill='%239ca3af' font-family='sans-serif' font-size='12' text-anchor='middle'>\
      <text x='80' y='58'>بدون تصویر</text>\
    </g>\
  </svg>";

const CraftCard = ({ craft }) => (
  <Link
    to={`/craft/${craft.id}`}
    className="block p-3 hover:bg-gray-50 transition-colors"
  >
    <div className="flex gap-3 items-start">
      <img
        src={
          craft.image ||
          (Array.isArray(craft.images) && craft.images[0]) ||
          PLACEHOLDER
        }
        alt={craft.title}
        className="w-28 h-20 object-cover rounded-md flex-shrink-0"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={(e) => {
          // Prevent infinite loop then set placeholder
          e.currentTarget.onerror = null;
          e.currentTarget.src = PLACEHOLDER;
        }}
      />
      <div className="flex-1 text-right">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">{craft.title}</h3>
          <span className="text-[11px] text-gray-500">
            {craft.duration || craft.craftingTime || ""}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-gray-500 flex-wrap">
          {typeof craft.distanceMeters === "number" && (
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px]">
              {craft.distanceMeters < 1000
                ? `${Math.round(craft.distanceMeters)} متر`
                : `${(craft.distanceMeters / 1000).toFixed(1)} کیلومتر`}
            </span>
          )}
          <span>{craft.location || "—"}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path
              fillRule="evenodd"
              d="M11.54 22.351l-.345-.207C9.727 21.274 3 17.13 3 10.5 3 6.358 6.358 3 10.5 3S18 6.358 18 10.5c0 6.63-6.727 10.774-8.195 11.644l-.265.157zM10.5 6a4.5 4.5 0 100 9 4.5 4.5 0 000-9z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="mt-2 flex items-center justify-end gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-700">
            {craft.type}
          </span>
          {craft.hasImage === false && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px]">
              بدون تصویر
            </span>
          )}
          {craft.isHandmade && (
            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px]">
              دست‌ساز
            </span>
          )}
          {typeof craft.totalLikes === "number" && craft.totalLikes > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[11px] flex items-center gap-1">
              👍 {craft.totalLikes}
            </span>
          )}
          {typeof craft.totalDislikes === "number" &&
            craft.totalDislikes > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[11px] flex items-center gap-1">
                👎 {craft.totalDislikes}
              </span>
            )}
        </div>
      </div>
    </div>
  </Link>
);

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
      <div className="p-6 text-center text-sm text-gray-500">
        نتیجه‌ای پیدا نشد.
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {items.map((craft, idx) => (
        <CraftCard key={craft.id || idx} craft={craft} />
      ))}
    </div>
  );
};

export default CraftList;
