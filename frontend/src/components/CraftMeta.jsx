const CraftMeta = ({ timeFa, type, size, category }) => {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-gray-600">
      {timeFa && (
        <span className="px-2 py-1 rounded-full bg-gray-100">
          زمان ساخت: {timeFa}
        </span>
      )}
      {type && (
        <span className="px-2 py-1 rounded-full bg-gray-100">نوع: {type}</span>
      )}
      {size && (
        <span className="px-2 py-1 rounded-full bg-gray-100">
          ابعاد: {size}
        </span>
      )}
      {category && (
        <span className="px-2 py-1 rounded-full bg-gray-100">
          دسته: {category}
        </span>
      )}
    </div>
  );
};

export default CraftMeta;
