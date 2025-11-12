import { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import Map from "../components/Map";
import CraftList from "../components/CraftList";
import MobileBottomSheet from "../components/MobileBottomSheet";
import FilterSidebar from "../components/FilterSidebar";
import FilterToolbar from "../components/FilterToolbar";
import BreadcrumbBar from "../components/BreadcrumbBar";
import FilterChips from "../components/FilterChips";
import { fetchCrafts, fetchCraftsNear, seedDev } from "../services/crafts";
import { toFa } from "../utils/number";
import useGeolocation from "../hooks/useGeolocation";

const HomeNew = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { position, error: geoError, getPosition } = useGeolocation();

  const [useMyLocation, setUseMyLocation] = useState(false);
  const [radiusKm, setRadiusKm] = useState(10);

  const [filters, setFilters] = useState({
    city: "",
    craftType: "",
    priceRange: [0, 5000000],
    forSale: false,
  });

  const [mapDirty, setMapDirty] = useState(false);
  const [bounds, setBounds] = useState(null);
  const [appliedBounds, setAppliedBounds] = useState(null);
  const boundsDebounceRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [triedSeed, setTriedSeed] = useState(false);
  const [sort, setSort] = useState("newest");
  const [typingQuery, setTypingQuery] = useState("");

  // Convert geolocation position to userPos
  const userPos = useMemo(() => {
    if (!position?.coords) return null;
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  }, [position]);

  // Update sort to 'distance' when we get location
  useEffect(() => {
    if (userPos && sort === "newest") {
      setSort("distance");
    }
  }, [userPos, sort]);

  // Set initial map bounds when we get location
  useEffect(() => {
    if (!userPos || appliedBounds) return;

    // Different zoom levels based on location source
    const delta = position?.source === "GPS" ? 0.02 : 0.2;

    const initial = {
      north: userPos.lat + delta,
      south: userPos.lat - delta,
      east: userPos.lng + delta,
      west: userPos.lng - delta,
    };
    setBounds(initial);
    setAppliedBounds(initial);
  }, [userPos, position?.source, appliedBounds]);

  const effectiveParams = useMemo(
    () => ({
      bounds: appliedBounds,
      filters,
      page,
      limit,
      q: query,
      sort,
      lat: userPos?.lat,
      lng: userPos?.lng,
    }),
    [appliedBounds, filters, page, limit, query, sort, userPos]
  );

  // Load initial state from URL
  useEffect(() => {
    const city = searchParams.get("city") || "";
    const difficulty = searchParams.get("difficulty") || "";
    const isVegetarian = searchParams.get("veg") === "1";
    const q = searchParams.get("q") || "";
    const srt = searchParams.get("sort") || "newest";
    const n = parseFloat(searchParams.get("n"));
    const s = parseFloat(searchParams.get("s"));
    const e = parseFloat(searchParams.get("e"));
    const w = parseFloat(searchParams.get("w"));
    setFilters((f) => ({ ...f, city, difficulty, isVegetarian }));
    setQuery(q);
    setTypingQuery(q);
    setSort(srt);
    if ([n, s, e, w].every((v) => Number.isFinite(v))) {
      const b = { north: n, south: s, east: e, west: w };
      setBounds(b);
      setAppliedBounds(b);
    }
  }, [searchParams]);

  // Persist state to URL
  useEffect(() => {
    if (mapDirty) return;
    const params = new URLSearchParams();
    if (filters.city) params.set("city", filters.city);
    if (filters.difficulty) params.set("difficulty", filters.difficulty);
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

  // Reset page when filters change
  useEffect(() => {
    setItems([]);
    setPage(1);
  }, [appliedBounds, filters, query, sort]);

  // Auto-apply bounds after user stops moving map
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

  // Load initial state from URL (add radiusKm)
  useEffect(() => {
    const radius = parseInt(searchParams.get("radius"), 10);
    if (radius >= 1 && radius <= 50) {
      setRadiusKm(radius);
    }
  }, [searchParams]);

  // Toggle location and update sort
  useEffect(() => {
    if (userPos && !geoError) {
      setUseMyLocation(true);
      if (sort === "newest") {
        setSort("distance");
      }
    }
  }, [userPos, geoError, sort]);

  // Fetch items
  useEffect(() => {
    let ignore = false;
    const run = async () => {
      setLoading(true);

      let res;
      if (useMyLocation && userPos) {
        // Use near search when location is available
        const items = await fetchCraftsNear({
          lng: userPos.lng,
          lat: userPos.lat,
          radiusKm,
          q: query,
          category: filters.craftType,
          min:
            filters.priceRange && Array.isArray(filters.priceRange)
              ? filters.priceRange[0]
              : undefined,
          max:
            filters.priceRange && Array.isArray(filters.priceRange)
              ? filters.priceRange[1]
              : undefined,
        });
        res = { items, total: items.length };
      } else {
        // Fall back to regular search
        res = await fetchCrafts(effectiveParams);
      }

      if (ignore) return;

      // Format distance if available
      const formattedItems = res.items.map((item) => ({
        ...item,
        distance: item.distanceMeters
          ? `${(item.distanceMeters / 1000).toFixed(1)} کیلومتر`
          : undefined,
      }));

      setItems((prev) =>
        page === 1 ? formattedItems : [...prev, ...formattedItems]
      );
      setTotal(res.total);
      setHasMore(
        !useMyLocation &&
          (res.page || 1) * (res.limit || limit) < (res.total || 0)
      );

      // Dev seeding
      if (import.meta.env.DEV && !triedSeed && (res.total || 0) === 0) {
        try {
          await seedDev();
          setTriedSeed(true);
          const seeded = await fetchCrafts({ ...effectiveParams, page: 1 });
          if (ignore) return;
          setItems(seeded.items);
          setTotal(seeded.total);
          setHasMore(
            (seeded.page || 1) * (seeded.limit || limit) < (seeded.total || 0)
          );
        } catch {
          // ignore seeding errors
        }
      }

      if (!ignore) setLoading(false);
    };
    run();
    return () => {
      ignore = true;
    };
  }, [
    effectiveParams,
    triedSeed,
    page,
    limit,
    useMyLocation,
    userPos,
    radiusKm,
    filters,
    query,
  ]);

  // Desktop layout
  return (
    <>
      <div className="hidden md:grid h-full grid-rows-[1fr] grid-cols-[420px_1fr]">
        {/* Right Panel (RTL) */}
        <aside className="bg-white flex flex-col border-r md:border-l md:border-r-0 min-h-0">
          <div className="p-3 border-b">
            <BreadcrumbBar />
          </div>
          <div className="p-3 border-b">
            <FilterToolbar filters={filters} setFilters={setFilters} />
          </div>
          <div className="px-3 pb-2 border-b">
            <div className="flex items-center justify-between py-2">
              <h2 className="text-sm font-medium text-gray-700">همه آثار</h2>
              <div className="text-[11px] text-gray-500">
                {toFa(total)} نتیجه
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-600">
              <select
                className="border rounded-full px-3 py-1 text-[11px]"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="newest">جدیدترین</option>
                <option value="oldest">قدیمی‌تر</option>
                <option value="popular">محبوب‌ترین</option>
                <option value="priceAsc">ارزان‌ترین</option>
                <option value="priceDesc">گران‌ترین</option>
                <option value="distance">نزدیک‌ترین</option>
              </select>
              <input
                className="ml-auto border rounded-full px-3 py-1 text-[11px]"
                placeholder="جستجو"
                value={typingQuery}
                onChange={(e) => setTypingQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3 mt-2 text-[11px]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 rounded"
                  checked={useMyLocation}
                  onChange={(e) => {
                    setUseMyLocation(e.target.checked);
                    if (e.target.checked && !userPos) {
                      getPosition();
                    }
                  }}
                />
                <span>استفاده از موقعیت من</span>
              </label>
              {useMyLocation && userPos && (
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(parseInt(e.target.value, 10))}
                    className="w-24"
                  />
                  <span className="text-gray-600">
                    {toFa(radiusKm)} کیلومتر
                  </span>
                </div>
              )}
            </div>
            <FilterChips
              filters={filters}
              onClear={(key) => {
                if (key === "__all__") {
                  setFilters({
                    city: "",
                    craftType: "",
                    priceRange: [0, 5000000],
                    forSale: false,
                  });
                } else {
                  setFilters({
                    ...filters,
                    [key]:
                      key === "forSale"
                        ? false
                        : key === "priceRange"
                        ? [0, 5000000]
                        : "",
                  });
                }
              }}
            />
          </div>
          <div className="flex-1 overflow-y-auto thin-scrollbar">
            <CraftList items={items} loading={loading} />
            <div className="p-3 flex justify-center">
              {hasMore && (
                <button
                  className="border rounded-full px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={loading}
                >
                  {loading ? "در حال بارگذاری…" : "نمایش بیشتر"}
                </button>
              )}
            </div>
          </div>
        </aside>
        <section className="relative h-full min-h-0">
          <div className="absolute top-3 left-3 z-10 bg-white/95 px-3 py-1.5 rounded-full shadow text-xs font-semibold">
            {total.toLocaleString("fa-IR")} اثر در این محدوده
          </div>
          <Map
            center={userPos}
            items={items}
            showMyLocationButton
            onLocate={getPosition}
            onMoveEnd={({ bounds }) => {
              setBounds(bounds);
              setMapDirty(true);
            }}
          />
          {mapDirty && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 text-gray-700 text-xs px-4 py-1 rounded-full shadow animate-pulse">
              بروزرسانی خودکار…
            </div>
          )}
          {geoError && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-red-50 text-red-700 text-xs px-3 py-2 rounded-full shadow max-w-[260px] text-center">
              {geoError}
            </div>
          )}
        </section>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden relative h-full w-full">
        <div className="absolute inset-0">
          <Map
            center={userPos}
            items={items}
            showMyLocationButton
            onLocate={getPosition}
            onMoveEnd={({ bounds }) => {
              setBounds(bounds);
              setMapDirty(true);
            }}
          />
          {mapDirty && (
            <div className="absolute top-3 left-3 bg-white/95 text-gray-800 px-3 py-1 rounded-full text-[10px] shadow animate-pulse">
              بروزرسانی…
            </div>
          )}
        </div>
        <MobileBottomSheet
          initial="collapsed"
          header={
            <div className="space-y-3">
              <div className="text-center text-xs text-gray-700 font-medium">
                {toFa(total)} اثر در این محدوده
              </div>
              <div className="flex gap-2 items-center text-[11px]">
                <input
                  className="border rounded-full px-3 py-1 text-[11px] flex-1"
                  placeholder="جستجو"
                  value={typingQuery}
                  onChange={(e) => setTypingQuery(e.target.value)}
                />
                <select
                  className="border rounded-full px-2 py-1 text-[11px]"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="newest">جدیدترین</option>
                  <option value="distance">نزدیک‌ترین</option>
                  <option value="popular">محبوب‌ترین</option>
                </select>
                <button
                  type="button"
                  className="text-[11px] px-2 py-1 rounded-full border bg-gray-50"
                  onClick={() => {
                    const el = document.getElementById("mobile-filters-inline");
                    if (el) el.open = !el.open;
                  }}
                >
                  فیلتر
                </button>
              </div>
              <details id="mobile-filters-inline" className="text-[11px]">
                <summary className="cursor-pointer text-gray-600">
                  فیلترهای پیشرفته
                </summary>
                <div className="pt-2">
                  <div className="flex flex-col gap-2 mb-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-blue-600 rounded"
                        checked={useMyLocation}
                        onChange={(e) => {
                          setUseMyLocation(e.target.checked);
                          if (e.target.checked && !userPos) {
                            getPosition();
                          }
                        }}
                      />
                      <span>استفاده از موقعیت من</span>
                    </label>
                    {useMyLocation && userPos && (
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="1"
                          max="50"
                          value={radiusKm}
                          onChange={(e) =>
                            setRadiusKm(parseInt(e.target.value, 10))
                          }
                          className="w-24"
                        />
                        <span className="text-gray-600">
                          {toFa(radiusKm)} کیلومتر
                        </span>
                      </div>
                    )}
                  </div>
                  <FilterSidebar filters={filters} setFilters={setFilters} />
                </div>
              </details>
              <FilterChips
                filters={filters}
                onClear={(key) => {
                  if (key === "__all__") {
                    setFilters({
                      city: "",
                      craftType: "",
                      priceRange: [0, 5000000],
                      forSale: false,
                    });
                  } else {
                    setFilters({
                      ...filters,
                      [key]:
                        key === "forSale"
                          ? false
                          : key === "priceRange"
                          ? [0, 5000000]
                          : "",
                    });
                  }
                }}
              />
            </div>
          }
        >
          <CraftList items={items} loading={loading} />
          <div className="p-3 flex justify-center">
            {hasMore && (
              <button
                className="border rounded-full px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => setPage((p) => p + 1)}
                disabled={loading}
              >
                {loading ? "در حال بارگذاری…" : "نمایش بیشتر"}
              </button>
            )}
          </div>
          {geoError && (
            <div className="mx-3 mb-3 bg-red-50 text-red-700 text-xs px-3 py-2 rounded shadow text-center">
              {geoError}
            </div>
          )}
        </MobileBottomSheet>
      </div>
    </>
  );
};

export default HomeNew;
