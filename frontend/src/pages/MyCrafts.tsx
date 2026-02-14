import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMyCrafts } from "../services/crafts";
// The CraftList component is a .jsx file; its import is implicitly `any` in TS.
// We keep the import as-is to avoid refactoring other files.
// @ts-ignore - allow importing the JS component without a declaration file
import CraftList from "../components/CraftList";
import type { Craft } from "../types/api";

// Local shape used by the list component; the API Craft may have additional fields
type RawCraft = Craft & {
  _id?: string;
  images?: string[];
  cookingTime?: { total?: number };
  duration?: string;
  isHandmade?: boolean;
  location?: { city?: string; neighborhood?: string } | string;
};

type ListItem = {
  id: string;
  title: string;
  image?: string | null;
  images?: string[];
  duration?: string;
  difficulty?: string;
  location?: string;
  hasImage?: boolean;
  isHandmade?: boolean;
  // optional extras that CraftList may read
  type?: string;
  totalLikes?: number;
  totalDislikes?: number;
  distanceMeters?: number;
};

export default function MyCrafts(): React.ReactElement {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetchMyCrafts()
      .then((list) => {
        if (ignore) return;
        // cast to RawCraft to allow access to legacy fields like _id
        const raw = list as unknown as RawCraft[];
        setItems(
          raw.map((r) => ({
            id: (r._id as string) || r.id,
            title: r.title,
            image:
              Array.isArray(r.images) && r.images[0] ? r.images[0] : undefined,
            images: r.images,
            duration:
              r.duration ||
              (r.cookingTime?.total ? `${r.cookingTime.total} دقیقه` : ""),
            difficulty: (r as any).difficulty,
            location:
              typeof r.location === "string"
                ? r.location
                : `${r.location?.city || ""}${
                    r.location?.neighborhood
                      ? "، " + r.location.neighborhood
                      : ""
                  }`,
            hasImage: !!(Array.isArray(r.images) && r.images[0]),
            isHandmade: !!r.isHandmade,
          })),
        );
        setError("");
      })
      .catch((e) => {
        console.warn("/crafts/mine failed", (e as Error)?.message);
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
          <CraftList items={items} loading={loading} scrollRootRef={null} />
        </div>
      </div>
    </div>
  );
}
