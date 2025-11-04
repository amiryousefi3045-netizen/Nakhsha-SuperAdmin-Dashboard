import { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import Map from "../components/Map";
import RecipeList from "../components/RecipeList";
import MobileBottomSheet from "../components/MobileBottomSheet";
import FilterSidebar from "../components/FilterSidebar";
import FilterToolbar from "../components/FilterToolbar";
import BreadcrumbBar from "../components/BreadcrumbBar";
import FilterChips from "../components/FilterChips";
import { fetchCrafts, seedDev } from "../services/crafts";
import { toFa } from "../utils/number";
import useGeolocation from "../hooks/useGeolocation";

const Home = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { position, error: geoError, loading: geoLoading, getPosition } = useGeolocation();

  const [filters, setFilters] = useState({
    city: "",
    craftType: "",
    priceRange: "",
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
      lng: position.coords.longitude
    };
  }, [position]);

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

  // Ask for geolocation once (high priority: center & distance sort)
  useEffect(() => {
    if (askedGeo) return;
    setAskedGeo(true);

    // First try Iranian IP location service, then fallback to browser GPS
    (async () => {
      // Helper for GPS access with options
      const tryGeo = (options = {}) =>
        new Promise((resolve, reject) => {
          if (!navigator.geolocation) reject(new Error("No geolocation API"));
          try {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ ok: true, pos }),
              (err) => reject(err),
              options
            );
          } catch (e) {
            reject(e);
          }
        });

      // Try direct GPS (no Google location service)
      try {
        const r = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) reject(new Error("No geolocation"));
          
          // Remove default Google location provider
          const geoOptions = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000,
            mozSystem: true, // Firefox: use GPS directly
            webkitSkipLowAccuracy: true // Chrome/Safari: prefer GPS
          };
          
          const handleSuccess = (position) => {
            // Some browsers might still fall back to Google - check response time
            // If too fast (< 100ms) it's probably network location
            const responseTime = Date.now() - startTime;
            if (responseTime < 100) {
              reject(new Error("Network location detected"));
              return;
            }
            resolve(position);
          };
          
          const startTime = Date.now();
          navigator.geolocation.getCurrentPosition(
            handleSuccess,
            reject,
            geoOptions
          );
        });
        
        const { latitude, longitude, accuracy } = r.coords;
        console.debug("geo: Direct GPS success", {
          latitude, longitude,
          accuracy: Math.round(accuracy),
          source: "direct-gps"
        });
        setUserPos({ lat: latitude, lng: longitude });
        setGeoError("");
        setSort((s) => (s === "newest" ? "distance" : s));
        // Precise view for GPS
        const delta = 0.02;
        const initial = {
          north: latitude + delta,
          south: latitude - delta,
          east: longitude + delta,
          west: longitude - delta,
        };
        setBounds(initial);
        setAppliedBounds(initial);
        return;
      } catch (err) {
        console.debug("geo: Direct GPS failed, trying backup services", err);
        
        // Try multiple location services that work in Iran
        try {
          // Try NowAPI.ir (Iran service)
          const resp = await fetch("http://ip.nowapi.ir/");
          if (resp.ok) {
            const { lat, lon } = await resp.json();
          });
          const { latitude, longitude, accuracy } = r.pos.coords;
          console.debug("geo: LOW accuracy GPS success", {
            latitude, longitude,
            accuracy: Math.round(accuracy),
            source: "GPS-coarse"
          });
          setUserPos({ lat: latitude, lng: longitude });
          setGeoError("موقعیت با دقت کمتر");
          setSort((s) => (s === "newest" ? "distance" : s));
          // Wider view for less precise location
          const delta = 0.05;
          const initial = {
            north: latitude + delta,
            south: latitude - delta,
            east: longitude + delta,
            west: longitude - delta,
          };
          setBounds(initial);
          setAppliedBounds(initial);
          return;
        } catch (err2) {
          console.debug("geo: LOW accuracy failed too, trying IP", err2);
          
          // Last try: IP-based location (least accurate)
          try {
            const resp = await fetch("https://ipwho.is/");
            if (resp.ok) {
              const j = await resp.json();
              const latitude = parseFloat(j.latitude || j.lat);
              const longitude = parseFloat(j.longitude || j.lon);
              if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
                console.debug("geo: IP-based location success", {
                  latitude, longitude,
                  source: "IP-fallback"
                });
                setUserPos({ lat: latitude, lng: longitude });
                setGeoError("موقعیت تقریبی از روی IP تعیین شد (دقت خیلی کم)");
                setSort((s) => (s === "newest" ? "distance" : s));
                // Much wider view for IP-based location
                const delta = 0.5;
                const initial = {
                  north: latitude + delta,
                  south: latitude - delta,
                  east: longitude + delta,
                  west: longitude - delta,
                };
                setBounds(initial);
                setAppliedBounds(initial);
                return;
              }
            }
          } catch {
            // ignore IP lookup errors
          }
        }

        if (err && err.code === 1) {
          console.warn("geo: browser geolocation permission denied", err);
          setGeoError(
            "اجازه موقعیت رد شد – می‌توانید بعداً از دکمه ‘موقعیت من’ استفاده کنید."
          );
        } else {
          console.warn("geo: browser geolocation failed", err);
          setGeoError("دریافت موقعیت ممکن نشد.");
        }
      }
    })();
  }, [askedGeo]);

  // Persist state to URL on changes (when mapDirty is false = applied)
  useEffect(() => {
    if (mapDirty) return; // only save applied state (during debounce we wait)
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

  // Reset and fetch when filters/bounds/query change
  useEffect(() => {
    setItems([]);
    setPage(1);
  }, [appliedBounds, filters, query, sort]);

  // Auto-apply bounds after user stops panning/zooming (debounce)
  useEffect(() => {
    if (!mapDirty || !bounds) return;
    if (boundsDebounceRef.current) clearTimeout(boundsDebounceRef.current);
    boundsDebounceRef.current = setTimeout(() => {
      setAppliedBounds(bounds);
      setMapDirty(false);
    }, 600); // 600ms idle after move
    return () => {
      if (boundsDebounceRef.current) clearTimeout(boundsDebounceRef.current);
    };
  }, [mapDirty, bounds]);

  // Debounce search typing
  useEffect(() => {
    const t = setTimeout(() => setQuery(typingQuery), 350);
    return () => clearTimeout(t);
  }, [typingQuery]);

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      setLoading(true);
      const res = await fetchCrafts(effectiveParams);
      if (ignore) return;
      setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
      setTotal(res.total);
      setHasMore((res.page || 1) * (res.limit || limit) < (res.total || 0));
      // If DB is empty in dev, auto-seed once and refetch
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
          // ignore seeding errors silently in UI
        }
      }
      if (!ignore) setLoading(false);
    };
    run();
    return () => {
      ignore = true;
    };
  }, [effectiveParams, triedSeed, page, limit]);

  // Desktop layout unchanged, mobile uses bottom sheet over full map
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
            <FilterChips
              filters={filters}
              onClear={(key) => {
                if (key === "__all__") {
                  setFilters({
                    city: "",
                    foodType: "",
                    cookingTime: "",
                    difficulty: "",
                    isVegetarian: false,
                  });
                } else {
                  setFilters({
                    ...filters,
                    [key]: key === "isVegetarian" ? false : "",
                  });
                }
              }}
            />
          </div>
          <div className="flex-1 overflow-y-auto thin-scrollbar">
            <RecipeList items={items} loading={loading} />
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
            onLocate={() => {
              (async () => {
                const tryGeo = (options = {}) =>
                  new Promise((resolve, reject) => {
                    try {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => resolve({ ok: true, pos }),
                        (err) => reject(err),
                        options
                      );
                    } catch (e) {
                      reject(e);
                    }
                  });

                // First: Try high accuracy GPS
                try {
                  const r = await tryGeo({
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 30000
                  });
                  const { latitude, longitude, accuracy } = r.pos.coords;
                  console.debug("geo: locate button - HIGH accuracy GPS success", {
                    latitude, longitude,
                    accuracy: Math.round(accuracy),
                    source: "GPS-precise"
                  });
                  setUserPos({ lat: latitude, lng: longitude });
                  setSort((s) => (s === "newest" ? "distance" : s));
                  setGeoError("");
                  return;
                } catch (err) {
                  console.debug("geo: locate button - HIGH accuracy failed, trying LOW", err);
                  
                  // Second: Try low accuracy GPS
                  try {
                    const r = await tryGeo({
                      enableHighAccuracy: false,
                      timeout: 5000,
                      maximumAge: 60000
                    });
                    const { latitude, longitude, accuracy } = r.pos.coords;
                    console.debug("geo: locate button - LOW accuracy GPS success", {
                      latitude, longitude,
                      accuracy: Math.round(accuracy),
                      source: "GPS-coarse"
                    });
                    setUserPos({ lat: latitude, lng: longitude });
                    setSort((s) => (s === "newest" ? "distance" : s));
                    setGeoError("موقعیت با دقت کمتر");
                    return;
                  } catch (err2) {
                    console.debug("geo: locate button - LOW accuracy failed too, trying IP", err2);
                    
                    // Last: Try IP-based location
                    try {
                      const resp = await fetch("https://ipwho.is/");
                      if (resp.ok) {
                        const j = await resp.json();
                        const latitude = parseFloat(j.latitude || j.lat);
                        const longitude = parseFloat(j.longitude || j.lon);
                        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
                          console.debug("geo: locate button - IP location success", {
                            latitude, longitude,
                            source: "IP-fallback"
                          });
                          setUserPos({ lat: latitude, lng: longitude });
                          setSort((s) => (s === "newest" ? "distance" : s));
                          setGeoError("موقعیت تقریبی از روی IP تعیین شد (دقت خیلی کم)");
                          return;
                        }
                      }
                    } catch {
                      // ignore IP errors
                    }
                    console.warn("geo: locate button - all methods failed");
                    setGeoError("پیدا کردن موقعیت ممکن نشد");
                  }
                }
              })();
            }}
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

      {/* Mobile full-screen map + draggable sheet */}
      <div className="md:hidden relative h-full w-full">
        <div className="absolute inset-0">
          <Map
            center={userPos}
            items={items}
            onMoveEnd={({ bounds }) => {
              setBounds(bounds);
              setMapDirty(true);
            }}
            showMyLocationButton
            onLocate={() => {
              (async () => {
                const tryGeo = (options = {}) =>
                  new Promise((resolve, reject) => {
                    try {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => resolve({ ok: true, pos }),
                        (err) => reject(err),
                        options
                      );
                    } catch (e) {
                      reject(e);
                    }
                  });

                try {
                  const r = await tryGeo({
                    enableHighAccuracy: true,
                    timeout: 7000,
                  });
                  const { latitude, longitude } = r.pos.coords;
                  setUserPos({ lat: latitude, lng: longitude });
                  setSort((s) => (s === "newest" ? "distance" : s));
                  setGeoError("");
                } catch {
                  try {
                    const resp = await fetch("https://ipwho.is/");
                    if (resp.ok) {
                      const j = await resp.json();
                      const latitude = parseFloat(j.latitude || j.lat);
                      const longitude = parseFloat(j.longitude || j.lon);
                      if (
                        Number.isFinite(latitude) &&
                        Number.isFinite(longitude)
                      ) {
                        setUserPos({ lat: latitude, lng: longitude });
                        setSort((s) => (s === "newest" ? "distance" : s));
                        setGeoError(
                          "موقعیت تقریبی از روی IP تعیین شد (دقت کمتر)"
                        );
                        return;
                      }
                    }
                  } catch {
                    // ignore
                  }
                  setGeoError("عدم دسترسی به موقعیت");
                }
              })();
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
                {toFa(total)} دستور در این محدوده
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
                      priceRange: "",
                      forSale: false,
                    });
                  } else {
                    setFilters({
                      ...filters,
                      [key]: key === "isVegetarian" ? false : "",
                    });
                  }
                }}
              />
            </div>
          }
        >
          <RecipeList items={items} loading={loading} />
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

export default Home;
