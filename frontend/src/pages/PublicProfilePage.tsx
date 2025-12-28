import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  getPublicUserByHandle,
  getPublicUserContent,
} from "../services/profile";
import type { User, ContentItem } from "../types/api";
import ContentCard from "../components/ContentCard";

const PublicProfilePage = () => {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{
    code?: string;
    message?: string;
  } | null>(null);
  const [tabContentLoading, setTabContentLoading] = useState(false);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [contentError, setContentError] = useState<string | null>(null);

  // Get active tab from URL params, default to "posts"
  const activeTab = searchParams.get("tab") || "posts";

  // Tab configuration
  const tabs = [
    { id: "posts", label: "پست‌ها", icon: "" },
    { id: "tours", label: "تور‌ها", icon: "" },
    { id: "tutorials", label: "آموزش‌ها", icon: "" },
    { id: "about", label: "درباره", icon: "" },
  ];

  // Determine if this is the current user's own profile
  const isOwnProfile =
    currentUser && profileUser && currentUser.id === profileUser.id;

  useEffect(() => {
    loadProfile();
  }, [handle]);

  const loadProfile = async () => {
    if (!handle) {
      setError({ code: "INVALID_HANDLE", message: "مشخصات کاربر نامعتبر است" });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const userData = await getPublicUserByHandle(handle);
      setProfileUser(userData);
    } catch (err: any) {
      console.error("Failed to load profile:", err);
      setError({
        code: err.code || "API_ERROR",
        message: err.message || "خطا در بارگذاری پروفایل",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditProfile = () => {
    navigate("/profile");
  };

  const handleTabClick = (tabId: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", tabId);
    setSearchParams(newParams);
  };

  // Map activeTab to API type
  const mapTabToType = (tab: string): "posts" | "tours" | "tutorials" => {
    if (tab === "tours") return "tours";
    if (tab === "tutorials") return "tutorials";
    return "posts"; // default to posts
  };

  // Load content for active tab
  useEffect(() => {
    if (!profileUser || !handle || activeTab === "about") return;

    const loadContent = async () => {
      setTabContentLoading(true);
      setContentError(null);

      try {
        const contentType = mapTabToType(activeTab);
        const items = await getPublicUserContent(handle, contentType);
        setContent(items);
      } catch (error: any) {
        console.error("Failed to load content:", error);
        setContentError(error.message || "خطا در بارگذاری محتوا");
        setContent([]);
      } finally {
        setTabContentLoading(false);
      }
    };

    loadContent();
  }, [activeTab, profileUser, handle]);

  const getRoleLabel = (role: string): string => {
    switch (role) {
      case "admin":
        return "مدیر";
      case "tour_leader":
        return "راهنمای گردشگری";
      default:
        return "کاربر";
    }
  };

  const handleContentClick = (item: ContentItem) => {
    switch (item.type) {
      case "post":
        navigate(`/p/${item.id}`);
        break;
      case "tour":
        navigate(`/tour/${item.id}`);
        break;
      case "tutorial":
        navigate(`/learn/${item.id}`);
        break;
      default:
        navigate(`/p/${item.id}`);
    }
  };

  const getCreatorTypeLabel = (creatorType: string): string => {
    switch (creatorType) {
      case "artisan":
        return "هنرمند";
      case "tour_leader":
        return "راهنمای گردشگری";
      default:
        return "";
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50" dir="rtl">
        {/* Banner skeleton */}
        <div className="h-48 md:h-64 lg:h-80 bg-gray-200 animate-pulse" />

        <div className="px-4 md:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            {/* Avatar skeleton */}
            <div className="relative -mt-16 md:-mt-20 lg:-mt-24 mb-6">
              <div className="w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-full border-4 border-white bg-gray-200 animate-pulse" />
            </div>

            {/* Content skeleton */}
            <div className="space-y-4">
              <div className="h-8 bg-gray-200 rounded animate-pulse w-64" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-32" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-96" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-48" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center"
        dir="rtl"
      >
        <div className="text-center p-8 max-w-md">
          <div className="text-red-500 text-6xl mb-4">
            {error.code === "USER_NOT_FOUND" ? "👤" : "⚠️"}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {error.code === "USER_NOT_FOUND"
              ? "کاربر پیدا نشد"
              : "خطا در بارگذاری"}
          </h1>
          <p className="text-gray-600 mb-6">{error.message}</p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            بازگشت به صفحه اصلی
          </button>
        </div>
      </div>
    );
  }

  // No profile found
  if (!profileUser) {
    return (
      <div
        className="min-h-screen bg-gray-50 flex items-center justify-center"
        dir="rtl"
      >
        <div className="text-center p-8 max-w-md">
          <div className="text-gray-400 text-6xl mb-4">👤</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            پروفایل یافت نشد
          </h1>
          <p className="text-gray-600 mb-6">
            کاربری با این شناسه وجود ندارد یا حذف شده است
          </p>
          <button
            onClick={() => navigate("/")}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            بازگشت به صفحه اصلی
          </button>
        </div>
      </div>
    );
  }

  const locationText = [
    profileUser.location?.neighborhood,
    profileUser.location?.city,
  ]
    .filter(Boolean)
    .join("، ");

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Banner Section - Simple gradient placeholder (~160px height) */}
      <div className="relative">
        <div className="h-40 md:h-44 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
      </div>

      {/* Main Content */}
      <div className="px-4 md:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Profile Header */}
          <div className="relative -mt-16 md:-mt-20">
            {/* Avatar */}
            <div className="mb-4">
              <div className="inline-block">
                <div className="w-20 h-20 md:w-28 md:h-28 rounded-full border-4 border-white shadow-lg bg-white overflow-hidden">
                  {profileUser.avatar ? (
                    <img
                      src={profileUser.avatar}
                      alt={`تصویر پروفایل ${profileUser.name}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                      <svg
                        className="w-10 h-10 text-gray-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Name, Handle, and Action Buttons */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
              <div className="space-y-3">
                {/* Name and Handle */}
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                    {profileUser.name}
                  </h1>
                  {profileUser.handle && (
                    <p className="text-gray-600 text-base mt-1">
                      @{profileUser.handle}
                    </p>
                  )}
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  {profileUser.isVerified && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200">
                      <span className="text-sm">✓</span>
                      تأیید شده
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200">
                    {getRoleLabel(profileUser.role)}
                  </span>

                  {profileUser.creatorType && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 border border-purple-200">
                      <span className="text-sm">🎨</span>
                      {getCreatorTypeLabel(profileUser.creatorType)}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                {isOwnProfile ? (
                  <button
                    onClick={handleEditProfile}
                    className="flex items-center gap-2 px-6 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 focus:ring-2 focus:ring-blue-500/30 transition-all duration-200"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                      />
                    </svg>
                    ویرایش پروفایل
                  </button>
                ) : (
                  <>
                    <button className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500/30 transition-all duration-200">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-5 h-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                        />
                      </svg>
                      تماس
                    </button>

                    <button className="flex items-center gap-2 px-6 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 focus:ring-2 focus:ring-blue-500/30 transition-all duration-200">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-5 h-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
                        />
                      </svg>
                      ذخیره
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Bio - truncate to 2 lines */}
            {profileUser.bio && (
              <div className="mb-4 max-w-3xl">
                <p className="text-gray-700 text-base leading-relaxed line-clamp-2 overflow-hidden">
                  {profileUser.bio}
                </p>
              </div>
            )}

            {/* Location */}
            {locationText && (
              <div className="flex items-center gap-2 text-gray-600 mb-6">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4 text-gray-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25s-7.5-4.108-7.5-11.25a7.5 7.5 0 1115 0z"
                  />
                </svg>
                <span className="text-sm">{locationText}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Tab Bar */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-40">
        <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8">
          <nav
            className="flex space-x-0 space-x-reverse"
            role="tablist"
            aria-label="بخش‌های پروفایل"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={`
                    relative px-4 py-4 text-sm md:text-base font-medium transition-all duration-200
                    hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 
                    focus:ring-offset-2 focus:ring-offset-white
                    ${
                      isActive
                        ? "text-blue-600 font-bold"
                        : "text-gray-600 hover:text-gray-800"
                    }
                  `}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`${tab.id}-panel`}
                  id={`${tab.id}-tab`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-lg">{tab.icon}</span>
                    {tab.label}
                  </span>

                  {/* Active tab indicator */}
                  {isActive && (
                    <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-blue-500" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-gray-50 min-h-[400px]">
        <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8 py-6">
          <div
            role="tabpanel"
            aria-labelledby={`${activeTab}-tab`}
            id={`${activeTab}-panel`}
          >
            {activeTab === "posts" && (
              <>
                {tabContentLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array(8)
                      .fill(0)
                      .map((_, i) => (
                        <div
                          key={i}
                          className="bg-white rounded-lg border border-gray-200 overflow-hidden animate-pulse"
                        >
                          <div className="aspect-video bg-gray-200" />
                          <div className="p-4 space-y-2">
                            <div className="h-4 bg-gray-200 rounded" />
                            <div className="h-3 bg-gray-200 rounded w-3/4" />
                          </div>
                        </div>
                      ))}
                  </div>
                ) : contentError ? (
                  <div className="text-center py-12 text-red-500">
                    <span className="text-6xl mb-4 block">⚠️</span>
                    <h3 className="text-xl font-medium text-gray-900 mb-2">
                      خطا در بارگذاری
                    </h3>
                    <p className="text-gray-600">{contentError}</p>
                  </div>
                ) : content.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {content.map((item) => (
                      <ContentCard
                        key={item.id}
                        id={item.id}
                        title={item.title}
                        thumbnailUrl={item.thumbnailUrl}
                        type={item.type}
                        city={item.city}
                        price={item.price}
                        createdAt={item.createdAt}
                        onClick={() => handleContentClick(item)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <span className="text-6xl mb-4 block">📝</span>
                    <h3 className="text-xl font-medium text-gray-900 mb-2">
                      هنوز پستی ثبت نشده
                    </h3>
                    <p className="text-gray-600">
                      در این بخش پست‌های کاربر نمایش داده می‌شود
                    </p>
                  </div>
                )}
              </>
            )}

            {activeTab === "tours" && (
              <>
                {tabContentLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array(8)
                      .fill(0)
                      .map((_, i) => (
                        <div
                          key={i}
                          className="bg-white rounded-lg border border-gray-200 overflow-hidden animate-pulse"
                        >
                          <div className="aspect-video bg-gray-200" />
                          <div className="p-4 space-y-2">
                            <div className="h-4 bg-gray-200 rounded" />
                            <div className="h-3 bg-gray-200 rounded w-3/4" />
                          </div>
                        </div>
                      ))}
                  </div>
                ) : contentError ? (
                  <div className="text-center py-12 text-red-500">
                    <span className="text-6xl mb-4 block">⚠️</span>
                    <h3 className="text-xl font-medium text-gray-900 mb-2">
                      خطا در بارگذاری
                    </h3>
                    <p className="text-gray-600">{contentError}</p>
                  </div>
                ) : content.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {content.map((item) => (
                      <ContentCard
                        key={item.id}
                        id={item.id}
                        title={item.title}
                        thumbnailUrl={item.thumbnailUrl}
                        type={item.type}
                        city={item.city}
                        price={item.price}
                        createdAt={item.createdAt}
                        onClick={() => handleContentClick(item)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <span className="text-6xl mb-4 block">🗺️</span>
                    <h3 className="text-xl font-medium text-gray-900 mb-2">
                      هنوز توری ثبت نشده
                    </h3>
                    <p className="text-gray-600">
                      در این بخش تورهای گردشگری نمایش داده می‌شود
                    </p>
                  </div>
                )}
              </>
            )}

            {activeTab === "tutorials" && (
              <>
                {tabContentLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array(8)
                      .fill(0)
                      .map((_, i) => (
                        <div
                          key={i}
                          className="bg-white rounded-lg border border-gray-200 overflow-hidden animate-pulse"
                        >
                          <div className="aspect-video bg-gray-200" />
                          <div className="p-4 space-y-2">
                            <div className="h-4 bg-gray-200 rounded" />
                            <div className="h-3 bg-gray-200 rounded w-3/4" />
                          </div>
                        </div>
                      ))}
                  </div>
                ) : contentError ? (
                  <div className="text-center py-12 text-red-500">
                    <span className="text-6xl mb-4 block">⚠️</span>
                    <h3 className="text-xl font-medium text-gray-900 mb-2">
                      خطا در بارگذاری
                    </h3>
                    <p className="text-gray-600">{contentError}</p>
                  </div>
                ) : content.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {content.map((item) => (
                      <ContentCard
                        key={item.id}
                        id={item.id}
                        title={item.title}
                        thumbnailUrl={item.thumbnailUrl}
                        type={item.type}
                        city={item.city}
                        price={item.price}
                        createdAt={item.createdAt}
                        onClick={() => handleContentClick(item)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <span className="text-6xl mb-4 block">🎓</span>
                    <h3 className="text-xl font-medium text-gray-900 mb-2">
                      هنوز آموزشی ثبت نشده
                    </h3>
                    <p className="text-gray-600">
                      در این بخش آموزش‌ها و راهنماها نمایش داده می‌شود
                    </p>
                  </div>
                )}
              </>
            )}

            {activeTab === "about" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  درباره {profileUser.name}
                </h2>

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Bio Card */}
                  {profileUser.bio && (
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">
                        معرفی
                      </h3>
                      <p className="text-gray-700 leading-relaxed">
                        {profileUser.bio}
                      </p>
                    </div>
                  )}

                  {/* Location Card */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      موقعیت مکانی
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-gray-600">
                        <span className="w-5">📍</span>
                        <span>{locationText || "موقعیت مشخص نشده"}</span>
                      </div>
                      <div className="flex items-center gap-3 text-gray-600">
                        <span className="w-5">🏷️</span>
                        <span>
                          {profileUser.creatorType === "artisan"
                            ? "هنرمند"
                            : profileUser.creatorType === "tour_leader"
                            ? "راهنمای گردشگری"
                            : getRoleLabel(profileUser.role)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Activity Stats Card */}
                  <div className="bg-white rounded-lg border border-gray-200 p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      آمار فعالیت
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">وضعیت:</span>
                        <span className="font-medium">
                          {profileUser.isVerified
                            ? "تأیید شده"
                            : "در انتظار تأیید"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">نقش:</span>
                        <span className="font-medium">
                          {getRoleLabel(profileUser.role)}
                        </span>
                      </div>
                      {profileUser.creatorType && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">تخصص:</span>
                          <span className="font-medium">
                            {getCreatorTypeLabel(profileUser.creatorType)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicProfilePage;
