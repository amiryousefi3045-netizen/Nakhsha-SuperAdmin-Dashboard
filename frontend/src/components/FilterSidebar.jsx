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
    <div className="bg-white p-2 md:p-4 overflow-y-auto">
      <h2 className="text-lg font-semibold mb-4">فیلترها</h2>

      {/* City Filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          شهر
        </label>
        <input
          type="text"
          className="w-full p-2 border rounded-md"
          value={filters.city}
          onChange={(e) => setFilters({ ...filters, city: e.target.value })}
          placeholder="نام شهر..."
        />
      </div>

      {/* Craft Type Filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          نوع صنایع دستی
        </label>
        <select
          className="w-full p-2 border rounded-md"
          value={filters.craftType}
          onChange={(e) =>
            setFilters({ ...filters, craftType: e.target.value })
          }
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
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          محدوده قیمت
        </label>
        <select
          className="w-full p-2 border rounded-md"
          value={filters.priceRange}
          onChange={(e) =>
            setFilters({ ...filters, priceRange: e.target.value })
          }
        >
          <option value="">همه</option>
          {priceRanges.map((range) => (
            <option key={range.value} value={range.value}>
              {range.label}
            </option>
          ))}
        </select>
      </div>

      {/* For Sale Filter */}
      <div className="mb-4">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={filters.forSale}
            onChange={(e) =>
              setFilters({ ...filters, forSale: e.target.checked })
            }
            className="rounded text-primary-600"
          />
          <span className="text-sm font-medium text-gray-700 mr-2">
            برای فروش
          </span>
        </label>
      </div>
    </div>
  );
};

export default FilterSidebar;
