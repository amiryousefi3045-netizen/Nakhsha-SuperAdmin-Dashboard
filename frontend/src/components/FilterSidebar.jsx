const FilterSidebar = ({ filters, setFilters }) => {
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

  const priceRanges = [
    { value: "0-100", label: "زیر ۱۰۰٬۰۰۰ تومان" },
    { value: "100-500", label: "۱۰۰٬۰۰۰ - ۵۰۰٬۰۰۰ تومان" },
    { value: "500-1000", label: "۵۰۰٬۰۰۰ - ۱٬۰۰۰٬۰۰۰ تومان" },
    { value: "1000+", label: "بیش از ۱٬۰۰۰٬۰۰۰ تومان" },
  ];

  return (
    <div className="bg-gradient-to-b from-white to-gray-50/50 p-4 md:p-5 overflow-y-auto">
      <h2 className="text-sm font-semibold text-gray-900 mb-5 text-right">
        فیلترها
      </h2>

      {/* Two-column grid layout with rounded corners and subtle shadow */}
      <div className="grid grid-cols-2 gap-4">
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

        {/* Price Range Filter */}
        <div>
          <label
            className="block text-xs font-semibold text-gray-700 mb-2 text-right"
            htmlFor="filter-price-range"
          >
            محدوده قیمت
          </label>
          <select
            id="filter-price-range"
            className="w-full p-2.5 border border-gray-200 rounded-xl bg-white text-sm hover:border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 transition-all duration-200 appearance-none"
            value={filters.priceRange}
            onChange={(e) =>
              setFilters({ ...filters, priceRange: e.target.value })
            }
            aria-label="فیلتر بر اساس محدوده قیمت"
          >
            <option value="">همه</option>
            {priceRanges.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
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
