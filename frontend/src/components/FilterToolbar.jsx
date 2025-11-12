const FilterToolbar = ({ filters, setFilters }) => {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="text"
        placeholder="شهر"
        className="w-28 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-sm hover:border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 transition-all duration-200 motion-reduce:transition-none"
        value={filters.city}
        onChange={(e) => setFilters({ ...filters, city: e.target.value })}
        aria-label="فیلتر بر اساس شهر"
      />

      <select
        className="w-28 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-sm hover:border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 transition-all duration-200 motion-reduce:transition-none appearance-none"
        value={filters.craftType}
        onChange={(e) => setFilters({ ...filters, craftType: e.target.value })}
        aria-label="فیلتر بر اساس نوع اثر"
      >
        <option value="">نوع اثر</option>
        <option>قالیچه</option>
        <option>سفال</option>
        <option>پارچه‌بافی</option>
        <option>فلزکاری</option>
        <option>چوب‌تراشی</option>
        <option>نقاشی</option>
      </select>

      <select
        className="w-28 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-sm hover:border-gray-300 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 transition-all duration-200 motion-reduce:transition-none appearance-none"
        value={filters.priceRange}
        onChange={(e) => setFilters({ ...filters, priceRange: e.target.value })}
        aria-label="فیلتر بر اساس محدوده قیمت"
      >
        <option value="">بازه قیمت</option>
        <option value="0-100">زیر ۱۰۰٬۰۰۰ تومان</option>
        <option value="100-500">۱۰۰٬۰۰۰ - ۵۰۰٬۰۰۰ تومان</option>
        <option value="500-1000">۵۰۰٬۰۰۰ - ۱٬۰۰۰٬۰۰۰ تومان</option>
        <option value="1000+">بیش از ۱٬۰۰۰٬۰۰۰ تومان</option>
      </select>

      <label className="inline-flex items-center gap-1 mr-2 cursor-pointer group">
        <input
          type="checkbox"
          className="rounded text-primary-600 focus:ring-primary-500 focus:ring-offset-0 border-gray-300 cursor-pointer"
          checked={filters.forSale}
          onChange={(e) =>
            setFilters({ ...filters, forSale: e.target.checked })
          }
          aria-label="فقط اثرهای برای فروش"
        />
        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors motion-reduce:transition-none">
          برای فروش
        </span>
      </label>
    </div>
  );
};

export default FilterToolbar;
