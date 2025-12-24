import React from "react";
import ContentCard from "./ContentCard";

const ProfileTabContent = ({ activeTab, user, isOwnProfile }) => {
  const renderTabContent = () => {
    switch (activeTab) {
      case "posts":
        return <PostsTabContent user={user} isOwnProfile={isOwnProfile} />;
      case "tours":
        return <ToursTabContent user={user} isOwnProfile={isOwnProfile} />;
      case "tutorials":
        return <TutorialsTabContent user={user} isOwnProfile={isOwnProfile} />;
      case "about":
        return <AboutTabContent user={user} isOwnProfile={isOwnProfile} />;
      default:
        return <PostsTabContent user={user} isOwnProfile={isOwnProfile} />;
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
const PostsTabContent = ({ user, isOwnProfile }) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold text-nakhsha-text">پست‌های اخیر</h2>
      {isOwnProfile && (
        <button className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 transition-colors">
          ایجاد پست جدید
        </button>
      )}
    </div>

    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {/* Placeholder posts using ContentCard */}
      {[
        {
          id: 1,
          title: "صنایع دستی سنتی کرمان - فرش دستباف ابریشم",
          thumbnailUrl:
            "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
          city: "کرمان",
          price: 2500000,
          date: "1403/10/20",
        },
        {
          id: 2,
          title: "سفالگری اصفهان - کاسه‌های نقاشی شده",
          thumbnailUrl:
            "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
          city: "اصفهان",
          price: 350000,
          date: "1403/10/18",
        },
        {
          id: 3,
          title: "هنر خاتم‌کاری شیراز - جعبه جواهرات",
          thumbnailUrl:
            "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
          city: "شیراز",
          price: 1200000,
          date: "1403/10/15",
        },
      ].map((post) => (
        <ContentCard
          key={post.id}
          title={post.title}
          thumbnailUrl={post.thumbnailUrl}
          type="post"
          city={post.city}
          price={post.price}
          date={post.date}
          onClick={() => console.log("Navigate to post:", post.id)}
        />
      ))}
    </div>

    <div className="text-center py-8 text-gray-500">
      <span className="text-4xl mb-2 block">📝</span>
      <p>هنوز پستی منتشر نشده است</p>
      {isOwnProfile && (
        <p className="text-sm mt-2">اولین پست خود را ایجاد کنید!</p>
      )}
    </div>
  </div>
);

// Tours Tab Content
const ToursTabContent = ({ user, isOwnProfile }) => (
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
      {/* Placeholder tours using ContentCard */}
      {[
        {
          id: 1,
          title: "تور طبیعت‌گردی جنگل‌های شمال - ۳ روزه",
          thumbnailUrl:
            "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
          city: "رامسر",
          price: 2500000,
          date: "1403/11/05",
        },
        {
          id: 2,
          title: "تور فرهنگی اصفهان - بازدید از بناهای تاریخی",
          thumbnailUrl:
            "https://images.unsplash.com/photo-1539650116574-75c0c6d73c6e?w=400",
          city: "اصفهان",
          price: 1800000,
          date: "1403/11/10",
        },
      ].map((tour) => (
        <ContentCard
          key={tour.id}
          title={tour.title}
          thumbnailUrl={tour.thumbnailUrl}
          type="tour"
          city={tour.city}
          price={tour.price}
          date={tour.date}
          onClick={() => console.log("Navigate to tour:", tour.id)}
        />
      ))}
    </div>

    <div className="text-center py-8 text-gray-500">
      <span className="text-4xl mb-2 block">🗺️</span>
      <p>هنوز توری اضافه نشده است</p>
      {isOwnProfile && user.creatorType === "tour_leader" && (
        <p className="text-sm mt-2">تور گردشگری خود را معرفی کنید!</p>
      )}
    </div>
  </div>
);

// Tutorials Tab Content
const TutorialsTabContent = ({ user, isOwnProfile }) => (
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
      {/* Placeholder tutorials using ContentCard */}
      {[
        {
          id: 1,
          title: "آموزش بافت فرش دستی - مقدماتی تا پیشرفته",
          thumbnailUrl:
            "https://images.unsplash.com/photo-1588776814546-dab15c79cd1d?w=400",
          city: "تبریز",
          date: "1403/10/25",
        },
        {
          id: 2,
          title: "سفالگری سنتی ایران - تکنیک‌های کاسه‌سازی",
          thumbnailUrl:
            "https://images.unsplash.com/photo-1594736797933-d0a9b6db5004?w=400",
          city: "لالجین",
          date: "1403/10/22",
        },
        {
          id: 3,
          title: "هنر قالی‌بافی - الگوهای سنتی آذربایجان",
          thumbnailUrl:
            "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400",
          city: "تبریز",
          date: "1403/10/20",
        },
      ].map((tutorial) => (
        <ContentCard
          key={tutorial.id}
          title={tutorial.title}
          thumbnailUrl={tutorial.thumbnailUrl}
          type="tutorial"
          city={tutorial.city}
          date={tutorial.date}
          onClick={() => console.log("Navigate to tutorial:", tutorial.id)}
        />
      ))}
    </div>

    <div className="text-center py-8 text-gray-500">
      <span className="text-4xl mb-2 block">🎓</span>
      <p>هنوز آموزشی منتشر نشده است</p>
      {isOwnProfile && (
        <p className="text-sm mt-2">دانش و تجربه خود را به اشتراک بگذارید!</p>
      )}
    </div>
  </div>
);

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
