import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMyCrafts } from "../services/crafts";
import RecipeList from "../components/RecipeList";

export default function MyRecipes() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetchMyCrafts()
      .then((list) => {
        if (ignore) return;
        setItems(
          list.map((r) => ({
            id: r._id || r.id,
            title: r.title,
            image: Array.isArray(r.images) && r.images[0],
            duration:
              r.duration ||
              (r.cookingTime?.total ? `${r.cookingTime.total} دقیقه` : ""),
            difficulty: r.difficulty,
            location: `${r.location?.city || ""}${
              r.location?.neighborhood ? "، " + r.location.neighborhood : ""
            }`,
            hasImage: !!(Array.isArray(r.images) && r.images[0]),
            isHandmade: !!r.isHandmade || !!r.isHandmade,
          }))
        );
        setError("");
      })
      .catch((e) => {
        console.warn("/crafts/mine failed", e?.message);
        setError("برای مشاهده باید وارد شوید.");
      })
      .finally(() => setLoading(false));
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto thin-scrollbar">
      <div className="max-w-[1100px] mx-auto p-4">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h1 className="text-xl font-bold">آثار من</h1>
          <Link
            to="/create-craft"
            className="group inline-flex items-center gap-2 bg-primary-100 text-black px-3.5 py-2.5 rounded-lg border border-primary-300 shadow-sm hover:bg-primary-200 active:bg-primary-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-white transition-colors text-sm font-medium"
            title="ساخت دستور جدید"
          >
            <span>اضافه‌ی اثر جدید</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4 text-emerald-600 transition-colors group-hover:text-emerald-700"
              aria-hidden="true"
            >
              <path d="M12 4.5a.75.75 0 0 1 .75.75v6h6a.75.75 0 0 1 0 1.5h-6v6a.75.75 0 0 1-1.5 0v-6h-6a.75.75 0 0 1 0-1.5h6v-6A.75.75 0 0 1 12 4.5Z" />
            </svg>
          </Link>
        </div>
        {error && (
          <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {error}
          </div>
        )}
        <div className="bg-white rounded-lg border">
          <RecipeList items={items} loading={loading} />
        </div>
      </div>
    </div>
  );
}
