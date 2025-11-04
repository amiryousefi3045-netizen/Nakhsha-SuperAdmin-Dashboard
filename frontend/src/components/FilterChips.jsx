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
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map(({ key, label }) => (
        <button
          key={key}
          className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-700 hover:bg-gray-200"
          onClick={() => onClear?.(key)}
        >
          <span>{label}</span>
          <span className="text-gray-400 group-hover:text-gray-600">×</span>
        </button>
      ))}
      {items.length > 1 && (
        <button
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-700 hover:bg-gray-200"
          onClick={() => onClear?.("__all__")}
        >
          پاک‌کردن فیلترها
          <span className="text-gray-400">×</span>
        </button>
      )}
    </div>
  );
};

export default FilterChips;
