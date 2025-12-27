import React from "react";

interface ContentCardProps {
  title: string;
  thumbnailUrl: string | null;
  type: "post" | "tour" | "tutorial";
  city?: string | null;
  price?: string | null;
  createdAt?: string | null;
  onClick?: () => void;
}

const ContentCard: React.FC<ContentCardProps> = ({
  title,
  thumbnailUrl,
  type,
  city,
  price,
  createdAt,
  onClick,
}) => {
  const getTypeBadge = () => {
    switch (type) {
      case "post":
        return { label: "آگهی", color: "bg-blue-100 text-blue-800" };
      case "tour":
        return { label: "تور", color: "bg-green-100 text-green-800" };
      case "tutorial":
        return { label: "آموزش", color: "bg-purple-100 text-purple-800" };
      default:
        return { label: "آگهی", color: "bg-blue-100 text-blue-800" };
    }
  };

  const badge = getTypeBadge();

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
    } catch {
      return "";
    }
  };

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200 cursor-pointer"
      onClick={onClick}
      dir="rtl"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-100">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-4xl text-gray-400">
              {type === "post" && "📝"}
              {type === "tour" && "🗺️"}
              {type === "tutorial" && "🎓"}
            </div>
          </div>
        )}

        {/* Type Badge */}
        <div className="absolute top-2 right-2">
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title - max 2 lines */}
        <h3 className="font-medium text-gray-900 text-sm leading-tight line-clamp-2 mb-2">
          {title}
        </h3>

        {/* Meta row */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1">
            {city && (
              <>
                <span className="text-gray-400">📍</span>
                <span>{city}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {price && (
              <span className="font-medium text-gray-700">{price}</span>
            )}
            {createdAt && (
              <span className="text-gray-400">{formatDate(createdAt)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentCard;
