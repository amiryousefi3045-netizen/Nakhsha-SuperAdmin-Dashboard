import { useState } from "react";
import PriceRange from "./PriceRange";

const FilterSidebar = ({ filters, setFilters }) => {
  const [showMaterialsPopover, setShowMaterialsPopover] = useState(false);

  const craftTypes = [
    "قالی و گلیم",
    "سفال و سرامیک",
    "منبت و خاتم",
    "فلزکاری",
    "پارچه‌بافی",
    "مینیاتور و نقاشی",
    "چرم‌دوزی",
    "سایر",
  ];

  const craftCategories = [
    { id: "weaving", label: "بافندگی", displayName: "پارچه‌بافی" },
    { id: "pottery", label: "سفالگری", displayName: "سفال و سرامیک" },
    { id: "woodwork", label: "چوب کاری", displayName: "منبت و خاتم" },
    { id: "metalwork", label: "فلزکاری", displayName: "فلزکاری" },
    { id: "painting", label: "نقاشی", displayName: "مینیاتور و نقاشی" },
    { id: "leather", label: "چرم دوزی", displayName: "چرم‌دوزی" },
    { id: "carpet", label: "قالیبافی", displayName: "قالی و گلیم" },
  ];

  const materials = [
    "پنبه",
    "پشم",
    "ابریشم",
    "چرم",
    "چوب",
    "فلز",
    "سفال",
    "شیشه",
  ];

  const handleCategoryToggle = (categoryDisplayName) => {
    if (filters.craftType === categoryDisplayName) {
      setFilters({ ...filters, craftType: "" });
    } else {
      setFilters({ ...filters, craftType: categoryDisplayName });
    }
  };

  return (
    <div className="bg-gradient-to-b from-white to-gray-50/50 h-full flex flex-col">
      {/* Sticky Filter Header with Category Chips */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur px-4 py-3 border-b border-gray-200/60 space-y-3 flex-shrink-0">
        {/* Title */}
        <h2 className="text-lg font-bold text-gray-900 text-right">فیلترها</h2>

        {/* Category Chips */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-gray-500 text-right">
            صنایع دستی
          </label>
          <div className="flex flex-wrap gap-2 justify-end max-h-14 overflow-y-auto pb-1">
            {craftCategories.map((category) => (
              <button
                key={category.id}
                onClick={() => handleCategoryToggle(category.displayName)}
                data-active={filters.craftType === category.displayName}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 cursor-pointer whitespace-nowrap flex-shrink-0"
                style={{
                  backgroundColor:
                    filters.craftType === category.displayName
                      ? "#111827"
                      : "#e5e7eb",
                  color:
                    filters.craftType === category.displayName
                      ? "#ffffff"
                      : "#374151",
                }}
                aria-pressed={filters.craftType === category.displayName}
                title={`انتخاب ${category.label}`}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        {/* For Sale Toggle + More Options Row */}
        <div className="flex items-center justify-end gap-2 pt-1">
          {/* For Sale Toggle Pill */}
          <button
            onClick={() =>
              setFilters({ ...filters, forSale: !filters.forSale })
            }
            data-active={filters.forSale}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 cursor-pointer whitespace-nowrap"
            style={{
              backgroundColor: filters.forSale ? "#111827" : "#e5e7eb",
              color: filters.forSale ? "#ffffff" : "#374151",
            }}
            aria-pressed={filters.forSale}
            title="تغییر وضعیت برای فروش"
          >
            {filters.forSale ? "✓ برای فروش" : "برای فروش"}
          </button>

          {/* More Options Popover */}
          <div className="relative">
            <button
              onClick={() => setShowMaterialsPopover(!showMaterialsPopover)}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500"
              title="گزینه‌های بیشتر"
            >
              بیشتر
            </button>

            {/* Materials Popover */}
            {showMaterialsPopover && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20 min-w-max">
                <p className="text-xs font-semibold text-gray-900 text-right mb-2">
                  مواد اولیه
                </p>
                <div className="flex flex-wrap gap-2 justify-end max-w-xs">
                  {materials.map((material) => (
                    <button
                      key={material}
                      onClick={() => {
                        console.log("Selected material:", material);
                        setShowMaterialsPopover(false);
                      }}
                      className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors duration-150 cursor-pointer"
                      title={material}
                    >
                      {material}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Active Filters Summary */}
        {(filters.city ||
          filters.priceRange[0] !== 0 ||
          filters.priceRange[1] !== 5000000) && (
          <div className="pt-2 border-t border-gray-200/40 space-y-0.5">
            {filters.city && (
              <div className="text-xs text-gray-600 text-right">
                🏙️{" "}
                <span className="font-medium text-gray-900">
                  {filters.city}
                </span>
              </div>
            )}
            {(filters.priceRange[0] !== 0 ||
              filters.priceRange[1] !== 5000000) && (
              <div className="text-xs text-gray-600 text-right">
                💰{" "}
                <span className="font-medium text-gray-900">
                  {filters.priceRange[0].toLocaleString("fa-IR")} -{" "}
                  {filters.priceRange[1].toLocaleString("fa-IR")}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scrollable Detailed Filters */}
      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-5">
        {/* City Filter */}
        <div className="col-span-2">
          <label
            className="block text-xs font-semibold text-gray-700 mb-2 text-right"
            htmlFor="filter-city"
          >
            شهر
          </label>
          <input
            id="filter-city"
            type="text"
            className="w-full p-2.5 border border-gray-200 rounded-xl bg-white text-sm placeholder:text-gray-400 hover:border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 transition-all duration-200"
            value={filters.city}
            onChange={(e) => setFilters({ ...filters, city: e.target.value })}
            placeholder="نام شهر…"
            aria-label="فیلتر بر اساس شهر"
          />
        </div>

        {/* Craft Type Filter */}
        <div>
          <label
            className="block text-xs font-semibold text-gray-700 mb-2 text-right"
            htmlFor="filter-craft-type"
          >
            نوع صنایع دستی
          </label>
          <select
            id="filter-craft-type"
            className="w-full p-2.5 border border-gray-200 rounded-xl bg-white text-sm hover:border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 transition-all duration-200 appearance-none"
            value={filters.craftType}
            onChange={(e) =>
              setFilters({ ...filters, craftType: e.target.value })
            }
            aria-label="فیلتر بر اساس نوع صنایع دستی"
          >
            <option value="">همه</option>
            {craftTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* Price Range Filter - Dual Slider */}
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-700 mb-3 text-right">
            محدوده قیمت
          </label>
          <PriceRange
            value={filters.priceRange || [0, 5000000]}
            onChange={(range) => setFilters({ ...filters, priceRange: range })}
            minCap={0}
            maxCap={5000000}
          />
        </div>

        {/* For Sale Filter - Full Width Checkbox */}
        <div className="col-span-2">
          <label
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-gray-300 cursor-pointer transition-all duration-200 group"
            htmlFor="filter-for-sale"
          >
            <input
              id="filter-for-sale"
              type="checkbox"
              checked={filters.forSale}
              onChange={(e) =>
                setFilters({ ...filters, forSale: e.target.checked })
              }
              className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 focus:ring-offset-0 border-gray-300 cursor-pointer accent-primary-600"
              aria-label="فقط اثرهای برای فروش"
            />
            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
              برای فروش
            </span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default FilterSidebar;
