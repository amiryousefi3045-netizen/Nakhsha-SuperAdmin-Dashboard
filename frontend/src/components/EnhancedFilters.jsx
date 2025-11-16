import { useState } from "react";

/**
 * CategoryChip Component
 * A pill-style category selector with active state styling
 */
const CategoryChip = ({ label, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      data-active={isActive}
      className="px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 cursor-pointer"
      style={{
        backgroundColor: isActive ? "var(--color-text)" : "var(--color-bg)",
        color: isActive ? "#ffffff" : "var(--color-text)",
        borderWidth: "1px",
        borderColor: isActive ? "var(--color-text)" : "transparent",
      }}
      aria-pressed={isActive}
      title={`${label} را انتخاب کنید`}
    >
      {label}
    </button>
  );
};

/**
 * FiltersHeader Component
 * Sticky filter header with category chips and quick toggles
 */
const FiltersHeader = ({ filters, setFilters }) => {
  const craftCategories = [
    { id: "weaving", label: "بافندگی", displayName: "پارچه‌بافی" },
    { id: "pottery", label: "سفالگری", displayName: "سفال و سرامیک" },
    { id: "woodwork", label: "چوب کاری", displayName: "منبت و خاتم" },
    { id: "metalwork", label: "فلزکاری", displayName: "فلزکاری" },
    { id: "painting", label: "نقاشی", displayName: "مینیاتور و نقاشی" },
    { id: "leather", label: "چرم دوزی", displayName: "چرم‌دوزی" },
    { id: "carpet", label: "قالیبافی", displayName: "قالی و گلیم" },
  ];

  const handleCategoryToggle = (categoryDisplayName) => {
    if (filters.craftType === categoryDisplayName) {
      // Deselect if already selected
      setFilters({ ...filters, craftType: "" });
    } else {
      // Select the category
      setFilters({ ...filters, craftType: categoryDisplayName });
    }
  };

  return (
    <div className="sticky top-0 z-10 bg-nakhsha-bg/90 backdrop-blur px-4 py-3 border-b border-nakhsha-border/60 space-y-4">
      {/* Title */}
      <h2 className="text-sm font-semibold text-nakhsha-text text-right">
        فیلترها
      </h2>

      {/* Category Chips */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-nakhsha-text text-right">
          صنایع دستی
        </label>
        <div className="flex flex-wrap gap-2 justify-end">
          {craftCategories.map((category) => (
            <CategoryChip
              key={category.id}
              label={category.label}
              isActive={filters.craftType === category.displayName}
              onClick={() => handleCategoryToggle(category.displayName)}
            />
          ))}
        </div>
      </div>

      {/* For Sale Toggle Pill */}
      <div className="flex justify-end">
        <button
          onClick={() => setFilters({ ...filters, forSale: !filters.forSale })}
          data-active={filters.forSale}
          className="px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 cursor-pointer"
          style={{
            backgroundColor: filters.forSale
              ? "var(--color-text)"
              : "var(--color-bg)",
            color: filters.forSale ? "#ffffff" : "var(--color-text)",
            borderWidth: "1px",
            borderColor: filters.forSale ? "var(--color-text)" : "transparent",
          }}
          aria-pressed={filters.forSale}
          title="فقط اثرهای برای فروش"
        >
          {filters.forSale ? "✓ برای فروش" : "برای فروش"}
        </button>
      </div>

      {/* Active Filters Summary */}
      {(filters.city || filters.priceRange) && (
        <div className="pt-2 border-t border-nakhsha-border/40 space-y-1">
          {filters.city && (
            <div className="text-xs text-nakhsha-text/60 text-right">
              🏙️ شهر:{" "}
              <span className="font-medium text-nakhsha-text">
                {filters.city}
              </span>
            </div>
          )}
          {filters.priceRange &&
            (filters.priceRange[0] !== 0 ||
              filters.priceRange[1] !== 5000000) && (
              <div className="text-xs text-nakhsha-text/60 text-right">
                💰 قیمت:{" "}
                <span className="font-medium text-nakhsha-text">
                  {filters.priceRange[0].toLocaleString("fa-IR")} -{" "}
                  {filters.priceRange[1].toLocaleString("fa-IR")} تومان
                </span>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

/**
 * EnhancedFilters Component
 * Complete filter panel with sticky header and detailed options
 */
const EnhancedFilters = ({ filters, setFilters }) => {
  const [showMorePopover, setShowMorePopover] = useState(false);

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

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header with Quick Filters */}
      <FiltersHeader filters={filters} setFilters={setFilters} />

      {/* Scrollable Detailed Filters */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* City Filter */}
        <div>
          <label
            className="block text-xs font-semibold text-nakhsha-text mb-2 text-right"
            htmlFor="filter-city"
          >
            شهر
          </label>
          <input
            id="filter-city"
            type="text"
            className="w-full p-2.5 border border-nakhsha-border rounded-xl bg-nakhsha-bg text-sm placeholder:text-nakhsha-text/40 hover:border-primary-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 transition-all duration-200"
            value={filters.city}
            onChange={(e) => setFilters({ ...filters, city: e.target.value })}
            placeholder="نام شهر…"
            aria-label="فیلتر بر اساس شهر"
          />
        </div>

        {/* Price Range Slider - Imported from PriceRange component */}
        <div>
          <label className="block text-xs font-semibold text-nakhsha-text mb-3 text-right">
            محدوده قیمت
          </label>
          <div className="rounded-2xl bg-nakhsha-bg p-4 shadow-sm border border-nakhsha-border/60 space-y-4">
            {/* Simple slider visualization */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-nakhsha-text/60">
                <span>
                  {filters.priceRange?.[0]?.toLocaleString("fa-IR")} تومان
                </span>
                <span>
                  {filters.priceRange?.[1]?.toLocaleString("fa-IR")} تومان
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="5000000"
                value={filters.priceRange?.[0] || 0}
                onChange={(e) => {
                  const newMin = parseInt(e.target.value, 10);
                  setFilters({
                    ...filters,
                    priceRange: [newMin, filters.priceRange?.[1] || 5000000],
                  });
                }}
                className="w-full h-2 bg-nakhsha-border/30 rounded-full appearance-none cursor-pointer accent-primary-500"
                aria-label="قیمت کمینه"
              />
              <input
                type="range"
                min="0"
                max="5000000"
                value={filters.priceRange?.[1] || 5000000}
                onChange={(e) => {
                  const newMax = parseInt(e.target.value, 10);
                  setFilters({
                    ...filters,
                    priceRange: [filters.priceRange?.[0] || 0, newMax],
                  });
                }}
                className="w-full h-2 bg-nakhsha-border/30 rounded-full appearance-none cursor-pointer accent-primary-500"
                aria-label="قیمت بیشینه"
              />
            </div>
          </div>
        </div>

        {/* Materials/Tags Popover */}
        <div className="relative">
          <button
            onClick={() => setShowMorePopover(!showMorePopover)}
            className="w-full px-3 py-2.5 text-sm font-medium text-nakhsha-text bg-nakhsha-bg border border-nakhsha-border rounded-lg hover:bg-nakhsha-bg/95 transition-colors duration-150 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500"
          >
            گزینه‌های بیشتر ({materials.length})
          </button>

          {/* Materials Popover Panel */}
          {showMorePopover && (
            <div className="absolute top-full right-0 mt-2 w-full bg-nakhsha-bg border border-nakhsha-border rounded-xl shadow-lg z-50 p-3 space-y-2">
              <p className="text-xs font-semibold text-nakhsha-text text-right mb-2">
                مواد اولیه
              </p>
              <div className="flex flex-wrap gap-2 justify-end">
                {materials.map((material) => (
                  <button
                    key={material}
                    className="px-2.5 py-1 text-xs font-medium text-nakhsha-text bg-nakhsha-bg hover:bg-nakhsha-bg/95 rounded-full border border-nakhsha-border transition-colors duration-150"
                    onClick={() => {
                      // Could add material filtering here
                      setShowMorePopover(false);
                    }}
                  >
                    {material}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-nakhsha-border/60" />

        {/* Reset Filters Button */}
        <button
          onClick={() =>
            setFilters({
              city: "",
              craftType: "",
              priceRange: [0, 5000000],
              forSale: false,
            })
          }
          className="w-full px-4 py-2.5 text-sm font-semibold text-nakhsha-text bg-nakhsha-bg border-2 border-nakhsha-border rounded-lg hover:bg-nakhsha-bg/95 hover:border-primary-400 transition-all duration-200 text-right"
        >
          پاک‌کردن همه فیلترها
        </button>
      </div>
    </div>
  );
};

export default EnhancedFilters;
