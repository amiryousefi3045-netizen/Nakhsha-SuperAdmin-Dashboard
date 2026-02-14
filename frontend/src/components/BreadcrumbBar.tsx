import type { FC } from "react";

interface BreadcrumbBarProps {
  city?: string;
  category?: string;
}

const BreadcrumbBar: FC<BreadcrumbBarProps> = ({
  city = "تهران",
  category = "همه صنایع دستی",
}) => {
  return (
    <nav
      className="flex items-center justify-between text-xs text-nakhsha-text/60"
      aria-label="breadcrumb"
    >
      <div className="flex items-center gap-2">
        <span className="text-nakhsha-text font-medium">{category}</span>
        <span className="opacity-50" aria-hidden="true">
          /
        </span>
        <span>{city}</span>
      </div>
      <button
        className="text-primary-600 hover:text-primary-700 transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 rounded"
        aria-label="تغییر محدوده جستجو"
      >
        تغییر محدوده
      </button>
    </nav>
  );
};

export default BreadcrumbBar;
