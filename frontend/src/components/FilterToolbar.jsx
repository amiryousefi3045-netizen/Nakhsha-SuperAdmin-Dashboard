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
        value={filters.foodType}
        onChange={(e) => setFilters({ ...filters, foodType: e.target.value })}
      >
        <option value="">نوع غذا</option>
        <option>کباب</option>
        <option>خورشت</option>
        <option>پلو</option>
        <option>آش</option>
        <option>دسر</option>
        <option>نان</option>
      </select>

      <select
        className="w-28 border rounded-md px-2 py-1 bg-white"
        value={filters.cookingTime}
        onChange={(e) =>
          setFilters({ ...filters, cookingTime: e.target.value })
        }
      >
        <option value="">زمان پخت</option>
        <option>۱۵ دقیقه</option>
        <option>۳۰ دقیقه</option>
        <option>۴۵ دقیقه</option>
        <option>۱ ساعت</option>
        <option>بیش از ۱ ساعت</option>
      </select>

      <select
        className="w-28 border rounded-md px-2 py-1 bg-white"
        value={filters.difficulty}
        onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}
      >
        <option value="">سختی</option>
        <option>آسان</option>
        <option>متوسط</option>
        <option>سخت</option>
      </select>

      <label className="inline-flex items-center gap-1 mr-2">
        <input
          type="checkbox"
          className="rounded text-primary-600"
          checked={filters.isVegetarian}
          onChange={(e) =>
            setFilters({ ...filters, isVegetarian: e.target.checked })
          }
        />
        گیاهی
      </label>
    </div>
  );
};

export default FilterToolbar;
