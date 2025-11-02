const FilterSidebar = ({ filters, setFilters }) => {
  const foodTypes = ["کباب", "خورشت", "پلو", "آش", "دسر", "نان"];

  const difficulties = ["آسان", "متوسط", "سخت"];

  const cookingTimes = [
    "۱۵ دقیقه",
    "۳۰ دقیقه",
    "۴۵ دقیقه",
    "۱ ساعت",
    "بیش از ۱ ساعت",
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

      {/* Food Type Filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          نوع غذا
        </label>
        <select
          className="w-full p-2 border rounded-md"
          value={filters.foodType}
          onChange={(e) => setFilters({ ...filters, foodType: e.target.value })}
        >
          <option value="">همه</option>
          {foodTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {/* Cooking Time Filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          زمان پخت
        </label>
        <select
          className="w-full p-2 border rounded-md"
          value={filters.cookingTime}
          onChange={(e) =>
            setFilters({ ...filters, cookingTime: e.target.value })
          }
        >
          <option value="">همه</option>
          {cookingTimes.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </div>

      {/* Difficulty Filter */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          سطح سختی
        </label>
        <select
          className="w-full p-2 border rounded-md"
          value={filters.difficulty}
          onChange={(e) =>
            setFilters({ ...filters, difficulty: e.target.value })
          }
        >
          <option value="">همه</option>
          {difficulties.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </div>

      {/* Vegetarian Filter */}
      <div className="mb-4">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={filters.isVegetarian}
            onChange={(e) =>
              setFilters({ ...filters, isVegetarian: e.target.checked })
            }
            className="rounded text-primary-600"
          />
          <span className="text-sm font-medium text-gray-700">گیاهی</span>
        </label>
      </div>
    </div>
  );
};

export default FilterSidebar;
