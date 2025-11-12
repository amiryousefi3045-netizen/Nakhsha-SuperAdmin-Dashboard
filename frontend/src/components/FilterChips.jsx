const FilterChips = ({ filters, onClear }) => {
  const items = [];
  if (filters.city) items.push({ key: "city", label: filters.city });
  if (filters.craftType)
    items.push({ key: "craftType", label: filters.craftType });
  if (filters.priceRange)
    items.push({ key: "priceRange", label: filters.priceRange });
  if (filters.forSale) items.push({ key: "forSale", label: "برای فروش" });

  if (items.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2 justify-end">
      {items.map(({ key, label }) => (
        <button
          key={key}
          className="group inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-100 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-all duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500"
          onClick={() => onClear?.(key)}
          title={`حذف فیلتر: ${label}`}
          aria-label={`حذف فیلتر ${label}`}
        >
          <span>{label}</span>
          <span className="text-gray-400 group-hover:text-gray-600 font-semibold transition-colors motion-reduce:transition-none">
            ×
          </span>
        </button>
      ))}
      {items.length > 1 && (
        <button
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gray-100 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-all duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500"
          onClick={() => onClear?.("__all__")}
          title="حذف تمام فیلترها"
          aria-label="حذف تمام فیلترها"
        >
          پاک‌کردن فیلترها
          <span className="text-gray-400 transition-colors motion-reduce:transition-none group-hover:text-gray-600">
            ×
          </span>
        </button>
      )}
    </div>
  );
};

export default FilterChips;
