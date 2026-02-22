import type { FC } from "react";

interface ProfileBannerProps {
  bannerUrl?: string | null;
  alt?: string;
  className?: string;
}

const ProfileBanner: FC<ProfileBannerProps> = ({
  bannerUrl,
  alt,
  className = "",
}) => {
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
        <div className="w-full h-full bg-gradient-to-br from-primary-400 via-primary-500 to-accent-400 opacity-90">
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
    </div>
  );
};

export default ProfileBanner;
