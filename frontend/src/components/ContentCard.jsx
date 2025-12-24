import React from "react";

const ContentCard = ({
  title,
  thumbnailUrl,
  type,
  city,
  price,
  date,
  onClick,
  className = "",
}) => {
  // Get badge info based on content type
  const getBadgeInfo = (contentType) => {
    switch (contentType) {
      case "post":
        return {
          label: "آگهی",
          className: "bg-blue-100 text-blue-700 border-blue-200",
          icon: "📝",
        };
      case "tour":
        return {
          label: "تور",
          className: "bg-green-100 text-green-700 border-green-200",
          icon: "🗺️",
        };
      case "tutorial":
        return {
          label: "آموزش",
          className: "bg-purple-100 text-purple-700 border-purple-200",
          icon: "🎓",
        };
      default:
        return {
          label: "محتوا",
          className: "bg-gray-100 text-gray-700 border-gray-200",
          icon: "📄",
        };
    }
  };

  const badgeInfo = getBadgeInfo(type);

  // Format price with Persian numbers and currency
  const formatPrice = (amount) => {
    return new Intl.NumberFormat("fa-IR").format(amount) + " تومان";
  };

  // Format date to Persian
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
    } catch {
      return dateString;
    }
  };

  return (
    <div
      className={`bg-white rounded-lg border border-nakhsha-border overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary-300 cursor-pointer group ${className}`}
      onClick={onClick}
      role="article"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden">
        <img
          src={thumbnailUrl}
          alt={title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />

        {/* Type Badge */}
        <div className="absolute top-3 right-3">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border backdrop-blur-sm bg-white/90 ${badgeInfo.className}`}
          >
            <span className="text-xs">{badgeInfo.icon}</span>
            {badgeInfo.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Title */}
        <h3 className="font-medium text-nakhsha-text leading-tight line-clamp-2 group-hover:text-primary-600 transition-colors">
          {title}
        </h3>

        {/* Location and Price */}
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <span className="text-xs">📍</span>
            <span>{city}</span>
          </div>

          {price && (
            <div className="flex items-center gap-1 font-medium text-primary-600">
              <span className="text-xs">💰</span>
              <span>{formatPrice(price)}</span>
            </div>
          )}
        </div>

        {/* Date */}
        {date && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span>📅</span>
            <span>{formatDate(date)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentCard;
