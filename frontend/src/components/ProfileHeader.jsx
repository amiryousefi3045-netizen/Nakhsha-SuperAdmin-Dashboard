import React, { useState } from "react";
import { useAuth } from "../hooks/useAuth";

const ProfileHeader = ({
  user,
  isOwnProfile,
  isSaved = false,
  onSaveToggle,
  onContact,
  onEditProfile,
}) => {
  const { user: currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleSaveClick = async () => {
    if (!currentUser) {
      // Show login modal or prompt
      return;
    }

    setIsLoading(true);
    try {
      await onSaveToggle?.(!isSaved);
    } finally {
      setIsLoading(false);
    }
  };

  const getBadgeInfo = () => {
    const badges = [];

    if (user.isVerified) {
      badges.push({
        text: "تأیید شده",
        icon: "✓",
        className: "bg-green-100 text-green-700 border-green-200",
      });
    }

    if (user.role === "admin") {
      badges.push({
        text: "مدیر",
        icon: "👑",
        className: "bg-purple-100 text-purple-700 border-purple-200",
      });
    } else if (user.creatorType === "artisan") {
      badges.push({
        text: "هنرمند",
        icon: "🎨",
        className: "bg-accent-100 text-accent-700 border-accent-200",
      });
    } else if (user.creatorType === "tour_leader") {
      badges.push({
        text: "راهنمای گردشگری",
        icon: "🗺️",
        className: "bg-blue-100 text-blue-700 border-blue-200",
      });
    }

    return badges;
  };

  const badges = getBadgeInfo();
  const locationText = [user.location.neighborhood, user.location.city]
    .filter(Boolean)
    .join("، ");

  return (
    <div className="relative px-4 md:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Avatar positioned to overlap banner */}
        <div className="relative -mt-16 md:-mt-20 lg:-mt-24 mb-4">
          <div className="inline-block">
            <div className="w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-full border-4 border-white shadow-lg bg-white overflow-hidden">
              <img
                src={user.avatar}
                alt={`تصویر پروفایل ${user.name}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        {/* Profile Info */}
        <div className="space-y-4">
          {/* Name and Badges */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-nakhsha-text">
                {user.name}
              </h1>

              {/* Badges */}
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {badges.map((badge, index) => (
                    <span
                      key={index}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${badge.className}`}
                    >
                      <span className="text-sm">{badge.icon}</span>
                      {badge.text}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              {!isOwnProfile && (
                <>
                  {/* Contact Button */}
                  <button
                    onClick={onContact}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 focus:ring-2 focus:ring-primary-500/30 transition-all duration-200"
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

                  {/* Save/Follow Button */}
                  <button
                    onClick={handleSaveClick}
                    disabled={isLoading || !currentUser}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium border transition-all duration-200 ${
                      isSaved
                        ? "bg-accent-500 text-white border-accent-500 hover:bg-accent-600"
                        : "bg-white text-nakhsha-text border-nakhsha-border hover:bg-gray-50"
                    } focus:ring-2 focus:ring-accent-500/30 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill={isSaved ? "currentColor" : "none"}
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
                    {isLoading
                      ? "در حال پردازش..."
                      : isSaved
                      ? "ذخیره شده"
                      : "ذخیره"}
                  </button>
                </>
              )}

              {isOwnProfile && (
                <button
                  onClick={onEditProfile}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-nakhsha-text border border-nakhsha-border rounded-lg font-medium hover:bg-gray-50 focus:ring-2 focus:ring-primary-500/30 transition-all duration-200"
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
              )}
            </div>
          </div>

          {/* Bio */}
          {user.bio && (
            <div className="max-w-3xl">
              <p className="text-gray-700 text-base md:text-lg leading-relaxed whitespace-pre-line">
                {user.bio}
              </p>
            </div>
          )}

          {/* Location */}
          {locationText && (
            <div className="flex items-center gap-2 text-gray-600">
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
        </div>
      </div>
    </div>
  );
};

export default ProfileHeader;
