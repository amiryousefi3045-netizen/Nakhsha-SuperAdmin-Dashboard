const RecipeMeta = ({ timeFa, difficulty, servings, category }) => {
  return (
    <div className="flex flex-wrap gap-2 text-xs text-gray-600">
      {timeFa && (
        <span className="px-2 py-1 rounded-full bg-gray-100">زمان: {timeFa}</span>
      )}
      {difficulty && (
        <span className="px-2 py-1 rounded-full bg-gray-100">سختی: {difficulty}</span>
      )}
      {servings && (
        <span className="px-2 py-1 rounded-full bg-gray-100">نفرات: {servings}</span>
      )}
      {category && (
        <span className="px-2 py-1 rounded-full bg-gray-100">دسته: {category}</span>
      )}
    </div>
  );
};

export default RecipeMeta;
