import React from "react";

const ProfileBanner = ({ bannerUrl, alt, className = "" }) => {
  return (
    <div
      className={`relative w-full h-48 md:h-64 lg:h-80 ${className}`}
      role="banner"
    >
      {bannerUrl ? (
        <img
          src={bannerUrl}
          alt={alt || "تصویر پروفایل کاربر"}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        // Default gradient banner
        <div className="w-full h-full bg-gradient-to-br from-primary-400 via-primary-500 to-accent-400 opacity-90">
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
        </div>
      )}

      {/* Optional overlay for better text contrast */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
    </div>
  );
};

export default ProfileBanner;
