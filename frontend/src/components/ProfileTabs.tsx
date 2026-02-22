import type { FC } from "react";
import { useSearchParams } from "react-router-dom";

interface ProfileTabsProps {
  className?: string;
  onTabChange?: (tab: string) => void;
}

const ProfileTabs: FC<ProfileTabsProps> = ({ className = "", onTabChange }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get("tab") || "posts";

  const tabs: { id: string; label: string; icon: string }[] = [
    { id: "posts", label: "پست‌ها", icon: "📝" },
    { id: "tours", label: "تورها", icon: "🗺️" },
    { id: "tutorials", label: "آموزش‌ها", icon: "🎓" },
    { id: "about", label: "درباره", icon: "ℹ️" },
  ];

  const handleTabClick = (tabId: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("tab", tabId);
    setSearchParams(newParams);
    onTabChange?.(tabId);
  };

  return (
    <div
      className={`bg-white border-b border-nakhsha-border sticky top-14 z-40 ${className}`}
    >
      <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8">
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
                className={`relative px-4 py-4 text-sm md:text-base font-medium transition-all duration-200 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:ring-offset-2 focus:ring-offset-white ${
                  isActive
                    ? "text-primary-600 font-bold"
                    : "text-gray-600 hover:text-gray-800"
                }`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`${tab.id}-panel`}
                id={`${tab.id}-tab`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-lg">{tab.icon}</span>
                  {tab.label}
                </span>
                {isActive && (
                  <div className="absolute bottom-0 right-0 left-0 h-0.5 bg-primary-500" />
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default ProfileTabs;
