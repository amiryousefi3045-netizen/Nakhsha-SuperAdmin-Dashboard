const FilterToolbar = ({ filters, setFilters }) => {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="text"
        placeholder="شهر"
        className="w-28 border rounded-md px-2 py-1 bg-white"
        value={filters.city}
        onChange={(e) => setFilters({ ...filters, city: e.target.value })}
      />

      <select
        className="w-28 border rounded-md px-2 py-1 bg-white"
        value={filters.craftType}
        onChange={(e) => setFilters({ ...filters, craftType: e.target.value })}
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
        className="w-28 border rounded-md px-2 py-1 bg-white"
        value={filters.priceRange}
        onChange={(e) => setFilters({ ...filters, priceRange: e.target.value })}
      >
        <option value="">بازه قیمت</option>
        <option value="0-100">زیر ۱۰۰٬۰۰۰ تومان</option>
        <option value="100-500">۱۰۰٬۰۰۰ - ۵۰۰٬۰۰۰ تومان</option>
        <option value="500-1000">۵۰۰٬۰۰۰ - ۱٬۰۰۰٬۰۰۰ تومان</option>
        <option value="1000+">بیش از ۱٬۰۰۰٬۰۰۰ تومان</option>
      </select>

      <label className="inline-flex items-center gap-1 mr-2">
        <input
          type="checkbox"
          className="rounded text-primary-600"
          checked={filters.forSale}
          onChange={(e) =>
            setFilters({ ...filters, forSale: e.target.checked })
          }
        />
        برای فروش
      </label>
    </div>
  );
};

export default FilterToolbar;
