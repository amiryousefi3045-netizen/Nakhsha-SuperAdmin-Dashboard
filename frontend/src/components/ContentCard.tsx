import React from "react";
import { useNavigate } from "react-router-dom";
import { toAbsoluteMediaUrl } from "../services/media";

const FALLBACK_THUMBNAIL =
  "data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22180%22 viewBox=%220 0 320 180%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23e5e7eb%22/%3E%3Cg fill=%22%239ca3af%22 font-family=%22sans-serif%22 font-size=%2214%22 text-anchor=%22middle%22%3E%3Ctext x=%22160%22 y=%2295%22%3E%D8%A8%D8%AF%D9%88%D9%86 %D8%AA%D8%B5%D9%88%DB%8C%D8%B1%3C/text%3E%3C/g%3E%3C/svg%3E";

interface ContentCardProps {
  id: string; // Added id for navigation
  title: string;
  thumbnailUrl: string | null;
  type: "post" | "tour" | "tutorial";
  city?: string | null;
  price?: string | null;
  createdAt?: string | null;
  onClick?: () => void; // Optional custom click handler
}

const ContentCard: React.FC<ContentCardProps> = ({
  id,
  title,
  thumbnailUrl,
  type,
  city,
  price,
  createdAt,
  onClick,
}) => {
  const navigate = useNavigate();
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

  const getDetailRoute = () => {
    switch (type) {
      case "post":
        return `/p/${id}`;
      case "tour":
        return `/tour/${id}`;
      case "tutorial":
        return `/learn/${id}`;
      default:
        return `/p/${id}`;
    }
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(getDetailRoute());
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  };

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
      className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 active:scale-98 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      dir="rtl"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-100">
        {thumbnailUrl ? (
          <img
            src={toAbsoluteMediaUrl(thumbnailUrl)}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = FALLBACK_THUMBNAIL;
            }}
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
