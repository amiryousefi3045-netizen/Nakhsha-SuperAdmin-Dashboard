import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getPublicProfile } from "../services/profile";
import type { User } from "../types/api";

const PublicProfilePage = () => {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine if this is the current user's own profile
  const isOwnProfile =
    currentUser && profileUser && currentUser.id === profileUser.id;

  useEffect(() => {
    loadProfile();
  }, [handle]);

  const loadProfile = async () => {
    if (!handle) {
      setError("مشخصات کاربر نامعتبر است");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const profileData = await getPublicProfile(handle);
      setProfileUser(profileData);
    } catch (err: any) {
      console.error("Failed to load profile:", err);

      if (err.response?.status === 404) {
        setError("کاربری با این شناسه یافت نشد");
      } else {
        setError(err?.message || "خطا در بارگذاری پروفایل");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleContact = () => {
    if (!profileUser) return;
    // For now, this could open a modal or navigate to a contact page
    console.log("Contact user:", profileUser.id);
  };

  const handleSave = () => {
    if (!currentUser || !profileUser) {
      // Could show login modal
      return;
    }
    console.log("Save profile:", profileUser.id);
  };

  const handleEditProfile = () => {
    navigate("/profile");
  };

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
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            خطا در بارگذاری پروفایل
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
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
      {/* Banner Section - Simple gradient placeholder */}
      <div className="relative">
        <div className="h-48 md:h-64 lg:h-80 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
      </div>

      {/* Main Content */}
      <div className="px-4 md:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Profile Header */}
          <div className="relative -mt-16 md:-mt-20 lg:-mt-24">
            {/* Avatar */}
            <div className="mb-6">
              <div className="inline-block">
                <div className="w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-full border-4 border-white shadow-lg bg-white overflow-hidden">
                  <img
                    src={profileUser.avatar}
                    alt={`تصویر پروفایل ${profileUser.name}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>

            {/* Name, Handle, and Action Buttons */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
              <div className="space-y-4">
                {/* Name and Handle */}
                <div>
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900">
                    {profileUser.name}
                  </h1>
                  {profileUser.handle && (
                    <p className="text-gray-600 text-lg mt-1">
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
                    <button
                      onClick={handleContact}
                      className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500/30 transition-all duration-200"
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
                          d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                        />
                      </svg>
                      تماس
                    </button>

                    <button
                      onClick={handleSave}
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
                          d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
                        />
                      </svg>
                      ذخیره
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Bio */}
            {profileUser.bio && (
              <div className="mb-6 max-w-3xl">
                <p className="text-gray-700 text-base md:text-lg leading-relaxed whitespace-pre-line">
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
                  className="w-5 h-5 text-gray-400"
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
                <span className="text-sm md:text-base">{locationText}</span>
              </div>
            )}

            {/* Tabs Bar Placeholder */}
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8 space-x-reverse">
                <button className="border-b-2 border-blue-500 py-4 px-1 text-sm font-medium text-blue-600">
                  آثار
                </button>
                <button className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
                  معرفی
                </button>
                <button className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300">
                  نظرات
                </button>
              </nav>
            </div>

            {/* Content Area Placeholder */}
            <div className="py-8">
              <div className="text-center text-gray-500">
                <p>محتوای تب‌ها در ادامه پیاده‌سازی خواهد شد</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicProfilePage;
