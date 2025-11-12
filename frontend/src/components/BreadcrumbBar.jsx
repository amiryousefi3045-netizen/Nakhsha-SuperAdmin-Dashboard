const BreadcrumbBar = ({ city = "تهران", category = "همه دستور پخت‌ها" }) => {
  return (
    <nav className="flex items-center justify-between text-xs text-gray-600" aria-label="breadcrumb">
      <div className="flex items-center gap-2">
        <span className="text-gray-800 font-medium">{category}</span>
        <span className="opacity-50" aria-hidden="true">/</span>
        <span>{city}</span>
      </div>
      <button
        className="text-primary-600 hover:text-primary-700 transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 rounded"
        aria-label="تغییر محدوده جستجو"
      >
        تغییر محدوده
      </button>
    </nav>
  );
};

export default BreadcrumbBar;
