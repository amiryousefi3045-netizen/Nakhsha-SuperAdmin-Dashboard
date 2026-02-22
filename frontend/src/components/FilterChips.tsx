import type { FC } from "react";

interface FilterValues {
  city?: string;
  craftType?: string;
  priceRange?: [number, number];
  forSale?: boolean;
  [key: string]: unknown;
}

interface FilterChipsProps {
  filters: FilterValues;
  onClear?: (key: string) => void;
}

const FilterChips: FC<FilterChipsProps> = ({ filters, onClear }) => {
  const items: { key: string; label: string }[] = [];
  if (filters.city) items.push({ key: "city", label: filters.city });
  if (filters.craftType)
    items.push({ key: "craftType", label: filters.craftType });
  if (filters.priceRange && Array.isArray(filters.priceRange)) {
    const [min, max] = filters.priceRange;
    if (min !== 0 || max !== 5000000) {
      items.push({
        key: "priceRange",
        label: `${min.toLocaleString("fa-IR")} - ${max.toLocaleString(
          "fa-IR",
        )} تومان`,
      });
    }
  }
  if (filters.forSale) items.push({ key: "forSale", label: "برای فروش" });

  if (items.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2 justify-end">
      {items.map(({ key, label }) => (
        <button
          key={key}
          className="group inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary-50 text-xs font-medium text-primary-700 hover:bg-primary-100 transition-all duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500"
          onClick={() => onClear?.(key)}
          title={`حذف فیلتر: ${label}`}
          aria-label={`حذف فیلتر ${label}`}
        >
          <span>{label}</span>
          <span className="text-primary-400 group-hover:text-primary-600 font-semibold transition-colors motion-reduce:transition-none">
            ×
          </span>
        </button>
      ))}
      {items.length > 1 && (
        <button
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary-50 text-xs font-medium text-primary-700 hover:bg-primary-100 transition-all duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500"
          onClick={() => onClear?.("__all__")}
          title="حذف تمام فیلترها"
          aria-label="حذف تمام فیلترها"
        >
          پاک‌کردن فیلترها
          <span className="text-primary-400 transition-colors motion-reduce:transition-none group-hover:text-primary-600">
            ×
          </span>
        </button>
      )}
    </div>
  );
};

export default FilterChips;
