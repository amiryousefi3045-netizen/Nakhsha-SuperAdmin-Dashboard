import React from "react";
import { Link, useNavigate } from "react-router-dom";

interface Creator {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string;
  verified?: boolean;
}

interface ContentDetailLayoutProps {
  content: {
    id: string;
    title: string;
    type: "post" | "tour" | "tutorial";
    coverImageUrl?: string;
    description: string;
    city: string;
    creator: Creator;
    createdAt: string;
    price?: string;
  } | null;
  isLoading: boolean;
  error: string | null;
  onContact?: () => void;
  onSave?: () => void;
  onBookTour?: () => void;
  isSaved?: boolean;
}

const ContentDetailLayout: React.FC<ContentDetailLayoutProps> = ({
  content,
  isLoading,
  error,
  onContact,
  onSave,
  onBookTour,
  isSaved = false,
}) => {
  const navigate = useNavigate();

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "post":
        return {
          label: "آگهی",
          color: "bg-blue-100 text-blue-800",
          icon: "📝",
        };
      case "tour":
        return {
          label: "تور",
          color: "bg-green-100 text-green-800",
          icon: "🗺️",
        };
      case "tutorial":
        return {
          label: "آموزش",
          color: "bg-purple-100 text-purple-800",
          icon: "🎓",
        };
      default:
        return {
          label: "آگهی",
          color: "bg-blue-100 text-blue-800",
          icon: "📝",
        };
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(date);
    } catch {
      return "";
    }
  };

  // Loading Skeleton
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50" dir="rtl">
        <div className="animate-pulse">
          {/* Header skeleton */}
          <div className="bg-white border-b">
            <div className="max-w-4xl mx-auto px-4 py-6">
              <div className="h-8 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>

          {/* Content skeleton */}
          <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="h-64 bg-gray-200 rounded-lg mb-6"></div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-4/5"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center"
        dir="rtl"
      >
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            خطا در بارگذاری
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            بازگشت
          </button>
        </div>
      </div>
    );
  }

  // Not Found
  if (!content) {
    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center"
        dir="rtl"
      >
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            یافت نشد
          </h2>
          <p className="text-gray-600 mb-6">
            متاسفانه محتوای درخواستی شما یافت نشد.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            بازگشت
          </button>
        </div>
      </div>
    );
  }

  const badge = getTypeBadge(content.type);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-start gap-3 mb-4">
            <button
              onClick={() => navigate(-1)}
              className="mt-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <div className="flex-1">
              {/* Type Badge */}
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}
                >
                  {badge.icon} {badge.label}
                </span>
              </div>

              {/* Title */}
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                {content.title}
              </h1>
            </div>
          </div>

          {/* Meta row: City + Date */}
          <div className="flex items-center justify-between mb-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className="text-lg">📍</span>
              <span className="font-medium">{content.city}</span>
            </div>
            <div>{formatDate(content.createdAt)}</div>
          </div>

          {/* Creator Card */}
          <div className="flex items-center gap-3">
            <Link
              to={`/u/${content.creator.handle}`}
              className="flex items-center gap-3 hover:bg-gray-50 -mx-2 px-2 py-2 rounded-lg transition-colors"
            >
              <div className="relative">
                <img
                  src={content.creator.avatarUrl || "/default-avatar.png"}
                  alt={content.creator.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
                {content.creator.verified && (
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg
                      className="w-2.5 h-2.5 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                    </svg>
                  </div>
                )}
              </div>

              <div>
                <div className="font-medium text-gray-900">
                  {content.creator.name}
                </div>
                <div className="text-sm text-gray-500">
                  @{content.creator.handle}
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid md:grid-cols-3 gap-6">
          {/* Content Section */}
          <div className="md:col-span-2">
            {/* Hero Image (16:9 aspect ratio with rounded corners) */}
            {content.coverImageUrl && (
              <div className="relative mb-6 aspect-video">
                <img
                  src={content.coverImageUrl}
                  alt={content.title}
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            )}

            {/* Description Block */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                توضیحات
              </h2>
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {content.description}
                </div>
              </div>
            </div>
          </div>

          {/* CTA Sticky Bottom Section (mobile) / Sidebar (desktop) */}
          <div className="md:col-span-1">
            <div className="sticky top-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="space-y-3">
                  {/* Price if available */}
                  {content.price && (
                    <div className="text-center border-b border-gray-100 pb-3 mb-3">
                      <div className="text-2xl font-bold text-gray-900">
                        {content.price}
                      </div>
                    </div>
                  )}

                  {/* Contact Button */}
                  <button
                    onClick={onContact}
                    className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    تماس
                  </button>

                  {/* Save Button */}
                  <button
                    onClick={onSave}
                    className={`w-full py-3 px-4 rounded-lg border transition-colors font-medium ${
                      isSaved
                        ? "bg-yellow-50 border-yellow-300 text-yellow-800"
                        : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {isSaved ? "ذخیره شده ✓" : "ذخیره"}
                  </button>

                  {/* Book Tour Button (only for tours) */}
                  {content.type === "tour" && (
                    <button
                      onClick={onBookTour}
                      className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors font-medium"
                    >
                      رزرو
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sticky CTA */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4"
        dir="rtl"
      >
        <div className="flex gap-3">
          <button
            onClick={onContact}
            className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            تماس
          </button>
          <button
            onClick={onSave}
            className={`px-4 py-3 rounded-lg border transition-colors font-medium ${
              isSaved
                ? "bg-yellow-50 border-yellow-300 text-yellow-800"
                : "bg-white border-gray-300 text-gray-700"
            }`}
          >
            {isSaved ? "✓" : "ذخیره"}
          </button>
          {content.type === "tour" && (
            <button
              onClick={onBookTour}
              className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              رزرو
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContentDetailLayout;
