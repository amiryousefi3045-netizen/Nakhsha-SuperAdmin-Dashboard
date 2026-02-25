import {
  useEffect,
  useMemo,
  useState,
  useRef,
  type FC,
  type RefObject,
} from "react";
import { useSearchParams } from "react-router-dom";
import Map, { type MapHandle } from "../components/Map";
import CraftList, { type CraftItem } from "../components/CraftList";
import SkeletonCard from "../components/SkeletonCard";
import MobileBottomSheet from "../components/MobileBottomSheet";
import FilterSidebar from "../components/FilterSidebar";
import FilterToolbar from "../components/FilterToolbar";
import BreadcrumbBar from "../components/BreadcrumbBar";
import FilterChips from "../components/FilterChips";
import { fetchCrafts, seedDev } from "../services/crafts";
import { fetchListingsNear } from "../services/listings";
import type { ListingItem } from "../types/listings";
import type { CraftFilters } from "../types/api";
import { toFa } from "../utils/number";
import useGeolocation from "../hooks/useGeolocation";

interface Filters {
  city: string;
  craftType: string;
  priceRange: [number, number];
  forSale: boolean;
  [key: string]: unknown;
}

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface UserPos {
  lat: number;
  lng: number;
}

const DEFAULT_FILTERS: Filters = {
  city: "",
  craftType: "",
  priceRange: [0, 5000000],
  forSale: false,
};

const isInIran = (lat: number, lng: number): boolean => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= 25 && lat <= 40 && lng >= 44 && lng <= 64;
};

const Home: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    position,
    error: geoError,
    getPosition,
    usedIpFallback,
    providerBlocked,
  } = useGeolocation();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [mapDirty, setMapDirty] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [appliedBounds, setAppliedBounds] = useState<Bounds | null>(null);
  const boundsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CraftItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [hasMore, setHasMore] = useState(false);
  const [mapItems, setMapItems] = useState<ListingItem[]>([]);
  const [query, setQuery] = useState("");
  const [triedSeed, setTriedSeed] = useState(false);
  const [sort, setSort] = useState("newest");
  const [typingQuery, setTypingQuery] = useState("");
  const [selectingLocation, setSelectingLocation] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSelectedPos, setManualSelectedPos] = useState<UserPos | null>(
    null,
  );
  const [filterHeaderHasShadow, setFilterHeaderHasShadow] = useState(false);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapHandle>(null);

  // Prevent page scrolling on desktop layout
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
    };
  }, []);

  const userPos = useMemo<UserPos | null>(() => {
    if (!position?.coords) return null;
    if (usedIpFallback) return null;
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  }, [position, usedIpFallback]);

  const handleMapClick = (coords: UserPos) => {
    if (!selectingLocation || !coords) return;
    const { lat, lng } = coords;
    setSelectingLocation(false);
    if (isInIran(lat, lng)) {
      const clamped = {
        lat: Math.min(40, Math.max(25, lat)),
        lng: Math.min(64, Math.max(44, lng)),
      };
      setManualSelectedPos(clamped);
      setManualError(null);
      try {
        localStorage.setItem(
          "geo.ir.good",
          JSON.stringify({ ...clamped, ts: Date.now() }),
        );
      } catch {
        /* ignore */
      }
    } else {
      setManualSelectedPos(null);
      setManualError("مختصات انتخابی خارج از محدوده ایران است.");
    }
  };

  const safeUserPos: UserPos | null =
    manualSelectedPos && isInIran(manualSelectedPos.lat, manualSelectedPos.lng)
      ? manualSelectedPos
      : userPos && isInIran(userPos.lat, userPos.lng)
        ? userPos
        : null;

  useEffect(() => {
    if (userPos && isInIran(userPos.lat, userPos.lng) && sort === "newest") {
      setSort("distance");
    }
  }, [userPos, sort]);

  useEffect(() => {
    if (!userPos || appliedBounds) return;
    if (!isInIran(userPos.lat, userPos.lng)) return;
    const delta =
      (position as { source?: string } | null)?.source === "GPS" ? 0.02 : 0.2;
    const initial: Bounds = {
      north: userPos.lat + delta,
      south: userPos.lat - delta,
      east: userPos.lng + delta,
      west: userPos.lng - delta,
    };
    setBounds(initial);
    setAppliedBounds(initial);
  }, [userPos, position, appliedBounds]);

  const effectiveParams = useMemo(
    () => ({
      ...(appliedBounds && { bounds: appliedBounds }),
      filters,
      page,
      limit,
      q: query,
      sort,
      ...(safeUserPos && { lat: safeUserPos.lat, lng: safeUserPos.lng }),
    }),
    [appliedBounds, filters, page, limit, query, sort, safeUserPos],
  );

  // Load initial state from URL
  useEffect(() => {
    const city = searchParams.get("city") || "";
    const difficulty = searchParams.get("difficulty") || "";
    const isVegetarian = searchParams.get("veg") === "1";
    const q = searchParams.get("q") || "";
    const srt = searchParams.get("sort") || "newest";
    const n = parseFloat(searchParams.get("n") || "");
    const s = parseFloat(searchParams.get("s") || "");
    const e = parseFloat(searchParams.get("e") || "");
    const w = parseFloat(searchParams.get("w") || "");
    setFilters((f) => ({ ...f, city, difficulty, isVegetarian }));
    setQuery(q);
    setTypingQuery(q);
    setSort(srt);
    if ([n, s, e, w].every((v) => Number.isFinite(v))) {
      const b: Bounds = { north: n, south: s, east: e, west: w };
      setBounds(b);
      setAppliedBounds(b);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist state to URL
  useEffect(() => {
    if (mapDirty) return;
    const params = new URLSearchParams();
    if (filters.city) params.set("city", String(filters.city));
    if (filters.difficulty)
      params.set("difficulty", String(filters.difficulty));
    if (filters.isVegetarian) params.set("veg", "1");
    if (query) params.set("q", query);
    if (appliedBounds) {
      params.set("n", String(appliedBounds.north));
      params.set("s", String(appliedBounds.south));
      params.set("e", String(appliedBounds.east));
      params.set("w", String(appliedBounds.west));
    }
    if (sort && sort !== "newest") params.set("sort", sort);
    setSearchParams(params, { replace: true });
  }, [filters, appliedBounds, mapDirty, query, sort, setSearchParams]);

  // Fetch geospatial listings for map markers when user position is known
  useEffect(() => {
    if (!safeUserPos) return;
    let ignore = false;
    fetchListingsNear({
      lat: safeUserPos.lat,
      lng: safeUserPos.lng,
      radiusKm: 50,
      limit: 100,
    })
      .then((data) => {
        if (!ignore) setMapItems(data);
      })
      .catch(() => {
        /* silent: map will just show no markers */
      });
    return () => {
      ignore = true;
    };
  }, [safeUserPos]);

  // Reset page when filters change
  useEffect(() => {
    setItems([]);
    setPage(1);
  }, [appliedBounds, filters, query, sort]);

  // Auto-apply bounds after debounce
  useEffect(() => {
    if (!mapDirty || !bounds) return;
    if (boundsDebounceRef.current) clearTimeout(boundsDebounceRef.current);
    boundsDebounceRef.current = setTimeout(() => {
      setAppliedBounds(bounds);
      setMapDirty(false);
    }, 600);
    return () => {
      if (boundsDebounceRef.current) clearTimeout(boundsDebounceRef.current);
    };
  }, [mapDirty, bounds]);

  // Debounce search typing
  useEffect(() => {
    const t = setTimeout(() => setQuery(typingQuery), 350);
    return () => clearTimeout(t);
  }, [typingQuery]);

  // Fetch items
  useEffect(() => {
    let ignore = false;
    const run = async () => {
      setLoading(true);
      const res = await fetchCrafts(effectiveParams as CraftFilters);
      if (ignore) return;
      setItems((prev) =>
        page === 1
          ? (res.items as CraftItem[])
          : [...prev, ...(res.items as CraftItem[])],
      );
      setTotal(res.total);
      setHasMore((res.page || 1) * (res.limit || limit) < (res.total || 0));
      if (import.meta.env.DEV && !triedSeed && (res.total || 0) === 0) {
        try {
          await seedDev();
          setTriedSeed(true);
          const seeded = await fetchCrafts({
            ...effectiveParams,
            page: 1,
          } as CraftFilters);
          if (ignore) return;
          setItems(seeded.items as CraftItem[]);
          setTotal(seeded.total);
          setHasMore(
            (seeded.page || 1) * (seeded.limit || limit) < (seeded.total || 0),
          );
        } catch {
          /* ignore seeding errors */
        }
      }
      if (!ignore) setLoading(false);
    };
    run();
    return () => {
      ignore = true;
    };
  }, [effectiveParams, triedSeed, page, limit]);

  const clearFilterKey = (key: string) => {
    if (key === "__all__") {
      setFilters(DEFAULT_FILTERS);
    } else {
      setFilters({
        ...filters,
        [key]:
          key === "forSale" ? false : key === "priceRange" ? [0, 5000000] : "",
      });
    }
  };

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden md:grid h-[calc(100vh-80px)] grid-rows-[1fr] grid-cols-[1fr] overflow-hidden">
        <section className="relative w-full h-full overflow-hidden rounded-tr-3xl">
          <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur px-4 py-2 rounded-xl shadow-md text-sm font-semibold text-nakhsha-text text-right">
            {total.toLocaleString("fa-IR")} اثر در این محدوده
          </div>
          {usedIpFallback && (
            <div className="absolute top-16 right-4 z-10 bg-amber-50 text-amber-800 text-xs px-3 py-2 rounded-lg shadow-md font-medium text-right">
              موقعیت تقریبی (IP)
            </div>
          )}
          {(providerBlocked ||
            (typeof geoError === "string" && geoError.includes("403"))) && (
            <div className="absolute top-28 right-4 left-4 z-20 bg-red-50 text-red-700 text-xs px-4 py-3 rounded-lg shadow-md max-w-sm text-right">
              <div className="font-semibold mb-2">
                سرویس موقعیت‌یابی در دسترس نیست
              </div>
              <div className="text-xs mb-3 text-red-600 leading-5">
                سرویس شبکه‌ای موقعیت در این مرورگر قابل دسترس نیست. Firefox یا
                Safari را امتحان کنید.
              </div>
              <button
                onClick={() => setSelectingLocation(true)}
                className="inline-block bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-800 transition-colors"
              >
                انتخاب دستی روی نقشه
              </button>
            </div>
          )}
          <Map
            ref={mapRef}
            center={manualSelectedPos || safeUserPos}
            selectedPos={manualSelectedPos}
            items={mapItems}
            showMyLocationButton
            onLocate={() => getPosition(true)}
            onMapClick={handleMapClick}
            selectingLocation={selectingLocation}
            onMoveEnd={({ bounds }) => {
              setBounds(bounds);
              setMapDirty(true);
            }}
          />
          {mapDirty && (
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur text-nakhsha-text text-xs px-4 py-2 rounded-full shadow-md font-medium animate-pulse">
              بروزرسانی خودکار…
            </div>
          )}
          {geoError && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-red-50 text-red-700 text-xs px-4 py-2 rounded-lg shadow-md max-w-xs text-center font-medium">
              {geoError}
            </div>
          )}
          {manualError && (
            <div className="absolute bottom-40 left-1/2 -translate-x-1/2 bg-red-50 text-red-700 text-xs px-4 py-2 rounded-lg shadow-md max-w-sm text-center font-medium">
              {manualError}
            </div>
          )}
        </section>

        {/* Right Sidebar */}
        <div
          className="fixed right-4 top-24 w-[450px] z-10 pointer-events-auto"
          style={{ height: "calc(100vh - 80px - 32px)" }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-px border-l border-dotted border-nakhsha-border" />
          <aside className="h-full rounded-3xl bg-white/95 backdrop-blur shadow-lg border border-nakhsha-border overflow-hidden flex flex-col">
            <div className="space-y-4 p-6 border-b border-nakhsha-border">
              <BreadcrumbBar />
              <FilterToolbar
                filters={filters}
                setFilters={(f) =>
                  setFilters((prev) => ({ ...prev, ...f }) as Filters)
                }
              />
            </div>
            <div
              className={`sticky top-0 z-10 px-6 py-5 border-b border-nakhsha-border space-y-4 backdrop-blur bg-white/90 rounded-t-2xl transition-shadow duration-200 ${filterHeaderHasShadow ? "shadow-md" : ""}`}
            >
              <div className="flex items-center justify-between text-right">
                <h2 className="text-xl md:text-2xl font-bold text-nakhsha-text">
                  آثار هنری
                </h2>
                <div className="text-xs font-medium text-nakhsha-text bg-blue-50 px-3 py-1.5 rounded-full">
                  {toFa(total)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <select
                  className="flex-1 border border-nakhsha-border rounded-xl px-4 py-2.5 text-sm bg-white text-nakhsha-text hover:border-primary-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 transition-all duration-200 motion-reduce:transition-none"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label="مرتب‌سازی آثار"
                >
                  <option value="newest">جدیدترین</option>
                  <option value="oldest">قدیمی‌تر</option>
                  <option value="popular">محبوب‌ترین</option>
                  <option value="priceAsc">ارزان‌ترین</option>
                  <option value="priceDesc">گران‌ترین</option>
                  <option value="distance">نزدیک‌ترین</option>
                </select>
                <div className="flex-1 relative">
                  <svg
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-nakhsha-text/40 pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    className="w-full h-11 rounded-full pl-4 pr-10 bg-nakhsha-bg text-sm text-nakhsha-text placeholder:text-nakhsha-text/40 border border-nakhsha-border hover:border-primary-400 focus:bg-white focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 transition-all duration-200 motion-reduce:transition-none"
                    placeholder="جستجو…"
                    value={typingQuery}
                    onChange={(e) => setTypingQuery(e.target.value)}
                    aria-label="جستجوی عنوان اثر"
                  />
                </div>
              </div>
              <FilterChips filters={filters} onClear={clearFilterKey} />
            </div>

            <div
              ref={sidebarScrollRef}
              onScroll={(e) =>
                setFilterHeaderHasShadow(e.currentTarget.scrollTop > 2)
              }
              className="flex-1 overflow-y-auto thin-scrollbar"
            >
              <div className="p-6">
                {loading ? (
                  <CraftList
                    items={[]}
                    loading
                    scrollRootRef={sidebarScrollRef as RefObject<HTMLElement>}
                  />
                ) : items.length === 0 ? (
                  <div className="flex items-center justify-center h-48">
                    <div className="text-center text-nakhsha-text/60">
                      <p className="text-sm">نتیجه‌ای پیدا نشد</p>
                    </div>
                  </div>
                ) : (
                  <CraftList
                    items={items}
                    loading={false}
                    scrollRootRef={sidebarScrollRef as RefObject<HTMLElement>}
                  />
                )}
              </div>
              {hasMore && (
                <div className="px-6 pb-6 flex justify-center">
                  <button
                    className="px-6 py-2.5 text-sm font-semibold text-primary-600 bg-white border-2 border-primary-500 rounded-xl hover:bg-primary-50 transition-all duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={loading}
                    aria-busy={loading}
                    aria-label={
                      loading ? "در حال بارگذاری آثار بیشتر" : "دیدن آثار بیشتر"
                    }
                  >
                    {loading ? "در حال بارگذاری…" : "نمایش بیشتر"}
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden relative h-full w-full flex flex-col">
        <div className="absolute inset-0 z-0">
          <Map
            ref={mapRef}
            center={safeUserPos}
            selectedPos={manualSelectedPos}
            items={mapItems}
            showMyLocationButton
            onLocate={() => getPosition(true)}
            onMapClick={handleMapClick}
            selectingLocation={selectingLocation}
            onMoveEnd={({ bounds }) => {
              setBounds(bounds);
              setMapDirty(true);
            }}
          />
          {usedIpFallback && (
            <div className="absolute top-3 right-3 z-10 bg-amber-50 text-amber-800 text-xs px-2 py-1 rounded-lg shadow-md font-medium">
              موقعیت تقریبی (IP)
            </div>
          )}
          {(providerBlocked ||
            (typeof geoError === "string" && geoError.includes("403"))) && (
            <div className="absolute top-3 left-3 right-3 z-20 bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg shadow-md text-center font-medium">
              <div className="mb-1">موقعیت‌یابی قابل دسترس نیست</div>
              <button
                onClick={() => setSelectingLocation(true)}
                className="inline-block bg-red-700 text-white px-2 py-1 rounded-lg text-[10px] hover:bg-red-800 font-semibold mt-1 transition-colors"
              >
                انتخاب روی نقشه
              </button>
            </div>
          )}
          {mapDirty && (
            <div className="absolute top-3 left-3 bg-white/95 backdrop-blur text-nakhsha-text px-3 py-1 rounded-lg text-xs shadow-md font-medium animate-pulse">
              بروزرسانی…
            </div>
          )}
        </div>
        <MobileBottomSheet
          initial="collapsed"
          header={
            <div className="space-y-4 p-4">
              <div className="text-center text-sm font-bold text-nakhsha-text">
                {toFa(total)} اثر در این محدوده
              </div>
              <div className="flex gap-2 items-center text-sm">
                <input
                  className="border border-nakhsha-border rounded-xl px-4 py-2.5 text-sm flex-1 text-nakhsha-text placeholder:text-nakhsha-text/40 hover:border-primary-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30 transition-all duration-200 motion-reduce:transition-none"
                  placeholder="جستجو…"
                  value={typingQuery}
                  onChange={(e) => setTypingQuery(e.target.value)}
                  aria-label="جستجوی عنوان اثر"
                />
                <select
                  className="border border-nakhsha-border rounded-xl px-3 py-2.5 text-sm bg-white text-nakhsha-text hover:border-primary-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30 transition-all duration-200 motion-reduce:transition-none appearance-none"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label="مرتب‌سازی آثار"
                >
                  <option value="newest">جدیدترین</option>
                  <option value="distance">نزدیک‌ترین</option>
                  <option value="popular">محبوب‌ترین</option>
                </select>
              </div>
              <div className="mt-4 pt-4 border-t border-nakhsha-border">
                <FilterSidebar
                  filters={filters}
                  setFilters={(f) => setFilters((prev) => ({ ...prev, ...f }))}
                />
              </div>
              <FilterChips filters={filters} onClear={clearFilterKey} />
            </div>
          }
        >
          <div className="px-4 py-6">
            {loading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-center text-nakhsha-text/60">
                  <p className="text-sm leading-6">نتیجه‌ای پیدا نشد</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {items.map((craft, idx) => (
                  <a
                    key={`mobile-${craft.id || idx}`}
                    href={`/craft/${craft.id}`}
                    className="group block bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-[transform,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500"
                  >
                    <div className="relative w-full aspect-[4/3] bg-nakhsha-border/30">
                      <img
                        src={
                          craft.image ||
                          (Array.isArray(craft.images) && craft.images[0]) ||
                          "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='112' viewBox='0 0 140 112'%3E%3Crect width='100%25' height='100%25' fill='%23e5e7eb'/%3E%3Cg fill='%239ca3af' font-family='sans-serif' font-size='11' text-anchor='middle'%3E%3Ctext x='70' y='56'%3Eبدون تصویر%3C/text%3E%3C/g%3E%3C/svg%3E"
                        }
                        alt={craft.title}
                        className="w-full h-full object-cover motion-safe:group-hover:scale-110 transition-transform duration-300 motion-reduce:transition-none"
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src =
                            "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='112' viewBox='0 0 140 112'%3E%3Crect width='100%25' height='100%25' fill='%23e5e7eb'/%3E%3Cg fill='%239ca3af' font-family='sans-serif' font-size='11' text-anchor='middle'%3E%3Ctext x='70' y='56'%3Eبدون تصویر%3C/text%3E%3C/g%3E%3C/svg%3E";
                        }}
                      />
                    </div>
                    <div className="p-3 space-y-2 text-right">
                      <h3 className="text-xs font-bold text-nakhsha-text line-clamp-2 leading-5">
                        {craft.title}
                      </h3>
                      {craft.type && (
                        <div className="flex justify-end">
                          <span className="inline-block px-2 py-0.5 text-xs font-medium text-nakhsha-text/70 bg-primary-50 rounded-full motion-reduce:transition-none hover:bg-primary-100 transition-colors duration-150">
                            {craft.type}
                          </span>
                        </div>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
          {hasMore && (
            <div className="px-4 pb-6 flex justify-center">
              <button
                className="px-4 py-2.5 text-xs font-semibold text-primary-600 bg-white border-2 border-primary-500 rounded-lg hover:bg-primary-50 transition-all duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setPage((p) => p + 1)}
                disabled={loading}
                aria-busy={loading}
                aria-label={
                  loading ? "در حال بارگذاری آثار بیشتر" : "دیدن آثار بیشتر"
                }
              >
                {loading ? "در حال بارگذاری…" : "نمایش بیشتر"}
              </button>
            </div>
          )}
          {geoError && (
            <div className="mx-4 mb-4 bg-red-50 text-red-700 text-xs px-4 py-2 rounded-lg shadow text-center font-medium leading-5">
              {geoError}
            </div>
          )}
        </MobileBottomSheet>
      </div>
    </>
  );
};

export default Home;
