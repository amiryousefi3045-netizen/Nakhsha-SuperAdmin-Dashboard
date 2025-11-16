const FilterToolbar = ({ filters, setFilters }) => {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="text"
        placeholder="شهر"
        className="w-28 border border-nakhsha-border rounded-lg px-2.5 py-1.5 bg-white text-sm text-nakhsha-text placeholder:text-gray-400 hover:border-primary-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30 transition-all duration-200 motion-reduce:transition-none"
        value={filters.city}
        onChange={(e) => setFilters({ ...filters, city: e.target.value })}
        aria-label="فیلتر بر اساس شهر"
      />

      <select
        className="w-28 border border-nakhsha-border rounded-lg px-2.5 py-1.5 bg-white text-sm text-nakhsha-text hover:border-primary-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30 transition-all duration-200 motion-reduce:transition-none appearance-none"
        value={typeof filters.craftType === "string" ? filters.craftType : ""}
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
        className="w-28 border border-nakhsha-border rounded-lg px-2.5 py-1.5 bg-white text-sm text-nakhsha-text hover:border-primary-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30 transition-all duration-200 motion-reduce:transition-none appearance-none"
        value={typeof filters.priceRange === "string" ? filters.priceRange : ""}
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
          className="rounded text-primary-500 focus:ring-primary-500 focus:ring-offset-0 border-primary-300 cursor-pointer accent-primary-500"
          checked={filters.forSale}
          onChange={(e) =>
            setFilters({ ...filters, forSale: e.target.checked })
          }
          aria-label="فقط اثرهای برای فروش"
        />
        <span className="text-sm font-medium text-nakhsha-text group-hover:text-primary-600 transition-colors motion-reduce:transition-none">
          برای فروش
        </span>
      </label>
    </div>
  );
};

export default FilterToolbar;
