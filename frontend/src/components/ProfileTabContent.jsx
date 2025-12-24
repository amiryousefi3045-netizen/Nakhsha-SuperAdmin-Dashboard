import React from "react";
import ContentCard from "./ContentCard";
import useProfileContent from "../hooks/useProfileContent";

const ProfileTabContent = ({ activeTab, user, isOwnProfile }) => {
  // Extract handle from user (fallback to id if no handle available)
  const userHandle =
    user?.handle || user?.name?.toLowerCase()?.replace(/\s+/g, "-") || user?.id;

  const renderTabContent = () => {
    switch (activeTab) {
      case "posts":
        return (
          <PostsTabContent
            userHandle={userHandle}
            activeTab={activeTab}
            user={user}
            isOwnProfile={isOwnProfile}
          />
        );
      case "tours":
        return (
          <ToursTabContent
            userHandle={userHandle}
            activeTab={activeTab}
            user={user}
            isOwnProfile={isOwnProfile}
          />
        );
      case "tutorials":
        return (
          <TutorialsTabContent
            userHandle={userHandle}
            activeTab={activeTab}
            user={user}
            isOwnProfile={isOwnProfile}
          />
        );
      case "about":
        return <AboutTabContent user={user} isOwnProfile={isOwnProfile} />;
      default:
        return (
          <PostsTabContent
            userHandle={userHandle}
            activeTab={activeTab}
            user={user}
            isOwnProfile={isOwnProfile}
          />
        );
    }
  };

  return (
    <div
      className="min-h-[400px]"
      role="tabpanel"
      aria-labelledby={`${activeTab}-tab`}
      id={`${activeTab}-panel`}
    >
      {renderTabContent()}
    </div>
  );
};

// Posts Tab Content
const PostsTabContent = ({ userHandle, activeTab, user, isOwnProfile }) => {
  const {
    items: posts,
    isLoading,
    error,
  } = useProfileContent(userHandle, "posts");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-nakhsha-text">
            پست‌های اخیر
          </h2>
          {isOwnProfile && (
            <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors">
              ایجاد پست جدید
            </button>
          )}
        </div>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array(8)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-lg border border-nakhsha-border overflow-hidden animate-pulse"
              >
                <div className="aspect-video bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded" />
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-nakhsha-text">
            پست‌های اخیر
          </h2>
          {isOwnProfile && (
            <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors">
              ایجاد پست جدید
            </button>
          )}
        </div>

        <div className="text-center py-8 text-red-500">
          <span className="text-4xl mb-2 block">⚠️</span>
          <p className="font-medium mb-2">خطا در بارگذاری</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-nakhsha-text">
          پست‌های اخیر
        </h2>
        {isOwnProfile && (
          <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors">
            ایجاد پست جدید
          </button>
        )}
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {posts.map((post) => (
          <ContentCard
            key={post.id}
            title={post.title}
            thumbnailUrl={post.thumbnail}
            type={post.type}
            city={post.city}
            price={post.price}
            date={post.createdAt}
            onClick={() => console.log("Navigate to post:", post.id)}
          />
        ))}
      </div>

      {posts.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <span className="text-4xl mb-2 block">📝</span>
          <p>هنوز پستی منتشر نشده است</p>
          {isOwnProfile && (
            <p className="text-sm mt-2">اولین پست خود را ایجاد کنید!</p>
          )}
        </div>
      )}
    </div>
  );
};

// Tours Tab Content
const ToursTabContent = ({ userHandle, activeTab, user, isOwnProfile }) => {
  const {
    items: tours,
    isLoading,
    error,
  } = useProfileContent(userHandle, "tours");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-nakhsha-text">
            تورهای گردشگری
          </h2>
          {isOwnProfile && user.creatorType === "tour_leader" && (
            <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors">
              اضافه کردن تور جدید
            </button>
          )}
        </div>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array(6)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-lg border border-nakhsha-border overflow-hidden animate-pulse"
              >
                <div className="aspect-video bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded" />
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-nakhsha-text">
            تورهای گردشگری
          </h2>
          {isOwnProfile && user.creatorType === "tour_leader" && (
            <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors">
              اضافه کردن تور جدید
            </button>
          )}
        </div>

        <div className="text-center py-8 text-red-500">
          <span className="text-4xl mb-2 block">⚠️</span>
          <p className="font-medium mb-2">خطا در بارگذاری</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-nakhsha-text">
          تورهای گردشگری
        </h2>
        {isOwnProfile && user.creatorType === "tour_leader" && (
          <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors">
            اضافه کردن تور جدید
          </button>
        )}
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {tours.map((tour) => (
          <ContentCard
            key={tour.id}
            title={tour.title}
            thumbnailUrl={tour.thumbnail}
            type={tour.type}
            city={tour.city}
            price={tour.price}
            date={tour.createdAt}
            onClick={() => console.log("Navigate to tour:", tour.id)}
          />
        ))}
      </div>

      {tours.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <span className="text-4xl mb-2 block">🗺️</span>
          <p>هنوز توری اضافه نشده است</p>
          {isOwnProfile && user.creatorType === "tour_leader" && (
            <p className="text-sm mt-2">تور گردشگری خود را معرفی کنید!</p>
          )}
        </div>
      )}
    </div>
  );
};

// Tutorials Tab Content
const TutorialsTabContent = ({ userHandle, activeTab, user, isOwnProfile }) => {
  const {
    items: tutorials,
    isLoading,
    error,
  } = useProfileContent(userHandle, "tutorials");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-nakhsha-text">
            آموزش‌ها و راهنماها
          </h2>
          {isOwnProfile && (
            <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors">
              افزودن آموزش جدید
            </button>
          )}
        </div>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array(8)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-lg border border-nakhsha-border overflow-hidden animate-pulse"
              >
                <div className="aspect-video bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded" />
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-nakhsha-text">
            آموزش‌ها و راهنماها
          </h2>
          {isOwnProfile && (
            <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors">
              افزودن آموزش جدید
            </button>
          )}
        </div>

        <div className="text-center py-8 text-red-500">
          <span className="text-4xl mb-2 block">⚠️</span>
          <p className="font-medium mb-2">خطا در بارگذاری</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-nakhsha-text">
          آموزش‌ها و راهنماها
        </h2>
        {isOwnProfile && (
          <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors">
            افزودن آموزش جدید
          </button>
        )}
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {tutorials.map((tutorial) => (
          <ContentCard
            key={tutorial.id}
            title={tutorial.title}
            thumbnailUrl={tutorial.thumbnail}
            type={tutorial.type}
            city={tutorial.city}
            date={tutorial.createdAt}
            onClick={() => console.log("Navigate to tutorial:", tutorial.id)}
          />
        ))}
      </div>

      {tutorials.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <span className="text-4xl mb-2 block">🎓</span>
          <p>هنوز آموزشی منتشر نشده است</p>
          {isOwnProfile && (
            <p className="text-sm mt-2">
              دانش و تجربه خود را به اشتراک بگذارید!
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// About Tab Content
const AboutTabContent = ({ user, isOwnProfile }) => (
  <div className="space-y-6">
    <h2 className="text-xl font-semibold text-nakhsha-text">اطلاعات تکمیلی</h2>

    <div className="grid gap-6 md:grid-cols-2">
      {/* Stats Card */}
      <div className="bg-white rounded-lg border border-nakhsha-border p-6">
        <h3 className="text-lg font-medium text-nakhsha-text mb-4">
          آمار فعالیت
        </h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">عضویت از:</span>
            <span className="font-medium">1403/10/01</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">تعداد پست‌ها:</span>
            <span className="font-medium">0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">دنبال‌کننده:</span>
            <span className="font-medium">0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">امتیاز:</span>
            <span className="font-medium">⭐ 0.0</span>
          </div>
        </div>
      </div>

      {/* Contact Info Card */}
      <div className="bg-white rounded-lg border border-nakhsha-border p-6">
        <h3 className="text-lg font-medium text-nakhsha-text mb-4">
          اطلاعات تماس
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-gray-600">
            <span className="w-5">📍</span>
            <span>{user.location?.city || "نامشخص"}</span>
          </div>
          <div className="flex items-center gap-3 text-gray-600">
            <span className="w-5">🏷️</span>
            <span>
              {user.creatorType === "artisan"
                ? "هنرمند"
                : user.creatorType === "tour_leader"
                ? "راهنمای گردشگری"
                : "کاربر"}
            </span>
          </div>
          {isOwnProfile && (
            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                اطلاعات تماس شما فقط برای خودتان قابل مشاهده است
              </p>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Skills/Interests (placeholder) */}
    <div className="bg-white rounded-lg border border-nakhsha-border p-6">
      <h3 className="text-lg font-medium text-nakhsha-text mb-4">
        مهارت‌ها و علایق
      </h3>
      <div className="text-center py-8 text-gray-500">
        <span className="text-4xl mb-2 block">🎨</span>
        <p>هنوز مهارتی اضافه نشده است</p>
        {isOwnProfile && (
          <p className="text-sm mt-2">مهارت‌ها و علایق خود را معرفی کنید</p>
        )}
      </div>
    </div>
  </div>
);

export default ProfileTabContent;
