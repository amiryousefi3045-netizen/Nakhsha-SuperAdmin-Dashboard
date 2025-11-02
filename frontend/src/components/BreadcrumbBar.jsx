const BreadcrumbBar = ({ city = "تهران", category = "همه دستور پخت‌ها" }) => {
  return (
    <div className="flex items-center justify-between text-xs text-gray-600">
      <div className="flex items-center gap-2">
        <span className="text-gray-800">{category}</span>
        <span className="opacity-50">/</span>
        <span>{city}</span>
      </div>
      <button className="text-primary-600 hover:text-primary-700">
        تغییر محدوده
      </button>
    </div>
  );
};

export default BreadcrumbBar;
