import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCraft, uploadImage, reverseGeocode } from "../services/crafts";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MapPicker = ({ value, onChange }) => {
  const id = "map-picker";
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);

  // keep latest handler without re-subscribing the map
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // init map once
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el || mapRef.current) return;
    const map = L.map(el).setView([32.4279, 53.688], 6);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    const placeMarker = (lat, lng, fire = true) => {
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const ll = markerRef.current.getLatLng();
        onChangeRef.current?.({ lat: ll.lat, lng: ll.lng });
      });
      if (fire) onChangeRef.current?.({ lat, lng });
    };
    const onClick = (e) => {
      const { lat, lng } = e.latlng;
      placeMarker(lat, lng, true);
    };
    map.on("click", onClick);
    setTimeout(() => map.invalidateSize(), 0);
    return () => {
      try {
        map.off("click", onClick);
        map.remove();
      } catch {
        // ignore cleanup errors
      }
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // reflect external value on marker without firing onChange
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (value?.lat && value?.lng) {
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = L.marker([value.lat, value.lng], {
        draggable: true,
      }).addTo(map);
      markerRef.current.on("dragend", () => {
        const ll = markerRef.current.getLatLng();
        onChangeRef.current?.({ lat: ll.lat, lng: ll.lng });
      });
    }
  }, [value?.lat, value?.lng]);

  return <div id={id} className="w-full h-64 rounded-md" />;
};

const CreateRecipe = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    description: "",
    ingredients: [{ name: "", amount: "", unit: "" }],
    instructions: [{ step: "1", title: "", description: "" }],
    images: [],
    cookingTime: { total: "0" },
    difficulty: "متوسط",
    servings: "2",
    category: "خورش",
    tags: [],
    isVegetarian: false,
    location: { city: "تهران", neighborhood: "", lat: 35.735, lng: 51.41 },
  });
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState({});
  const [addressPreview, setAddressPreview] = useState("");
  const [submitError, setSubmitError] = useState("");

  // Unified input style
  const inputClass =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500/60 focus:border-primary-500 placeholder:text-gray-400";

  const updateArrayField = (key, idx, patch) => {
    setForm((f) => ({
      ...f,
      [key]: f[key].map((x, i) => (i === idx ? { ...x, ...patch } : x)),
    }));
  };

  const addRow = (key, row) =>
    setForm((f) => ({ ...f, [key]: [...f[key], row] }));
  const removeRow = (key, idx) =>
    setForm((f) => ({ ...f, [key]: f[key].filter((_, i) => i !== idx) }));

  const onPickImages = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const f of files) {
        try {
          const url = await uploadImage(f);
          urls.push(url);
        } catch {
          // skip failed file
        }
      }
      if (urls.length)
        setForm((f) => ({
          ...f,
          images: [...(f.images || []), ...urls].slice(0, 12),
        }));
    } catch {
      alert("آپلود تصویر ناموفق بود.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const addImageByUrl = () => {
    const url = prompt("لینک تصویر را وارد کنید:");
    if (!url) return;
    setForm((f) => ({ ...f, images: [...(f.images || []), url].slice(0, 12) }));
  };

  const setAsCover = (i) => {
    setForm((f) => {
      const arr = [...(f.images || [])];
      if (i < 0 || i >= arr.length) return f;
      const [img] = arr.splice(i, 1);
      return { ...f, images: [img, ...arr] };
    });
  };

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = "عنوان الزامی است";
    if ((form.description || "").trim().length < 10)
      errs.description = "توضیحات حداقل ۱۰ کاراکتر";
    if ((Number(form.servings) || 0) < 1) errs.servings = "حداقل ۱";
    if ((Number(form.cookingTime.total) || 0) < 0) errs.total = "نامعتبر";
    if (!form.location?.lat || !form.location?.lng)
      errs.location = "لطفاً موقعیت را روی نقشه انتخاب کنید";
    return errs;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = {
        title: form.title,
        description: form.description,
        ingredients: (form.ingredients || [])
          .filter(
            (x) =>
              (x?.name || "").trim() &&
              (x?.amount || "").trim() &&
              (x?.unit || "").trim()
          )
          .map((x) => ({
            name: String(x.name).trim(),
            amount: String(x.amount).trim(),
            unit: String(x.unit).trim(),
          })),
        instructions: (form.instructions || [])
          .filter((x) => (x?.description || "").trim())
          .map((x, i) => ({
            step: Number(x.step) || i + 1,
            title: (x.title || "").trim() || undefined,
            description: String(x.description).trim(),
          })),
        images: form.images.filter(Boolean),
        cookingTime: {
          total: Math.max(0, Number(form.cookingTime.total) || 0),
        },
        difficulty: form.difficulty,
        servings: Math.max(1, Number(form.servings) || 1),
        category: form.category,
        tags: form.tags,
        isVegetarian: form.isVegetarian,
        location: {
          city: form.location.city,
          neighborhood: form.location.neighborhood,
          lat: form.location.lat,
          lng: form.location.lng,
        },
      };
      const { id } = await createCraft(payload);
      navigate(`/craft/${id}`);
    } catch (e) {
      const st = e?.response?.status;
      const body = e?.response?.data;
      let msg =
        "ثبت ناموفق. اتصال به سرور برقرار نیست یا ورودی‌ها نامعتبر است.";
      if (st === 401) msg = "برای ثبت باید وارد شوید.";
      else if (st === 400 && (body?.message || body?.details)) {
        msg =
          body?.message === "Validation error" && Array.isArray(body?.details)
            ? `خطا در اعتبارسنجی: ${body.details[0]}`
            : body?.message || msg;
      }
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Reverse geocode when marker set
  const latVal = form.location?.lat;
  const lngVal = form.location?.lng;
  useEffect(() => {
    if (!latVal || !lngVal) return;
    let ignore = false;
    reverseGeocode(latVal, lngVal).then((a) => {
      if (ignore) return;
      setAddressPreview(a.displayName || "");
      // Auto-fill city/neighborhood from geocode
      setForm((f) => ({
        ...f,
        location: {
          ...f.location,
          city: a.city || f.location.city,
          neighborhood: a.neighborhood || f.location.neighborhood,
        },
      }));
    });
    return () => {
      ignore = true;
    };
  }, [latVal, lngVal]);

  // Live validation on key fields
  useEffect(() => {
    setErrors(validate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.title,
    form.description,
    form.servings,
    form.cookingTime.total,
    latVal,
    lngVal,
  ]);

  return (
    <div className="h-full overflow-y-auto thin-scrollbar">
      <div className="max-w-[900px] mx-auto p-4">
        <h1 className="text-xl font-bold mb-4">ثبت محصول/اثر جدید</h1>
        <form onSubmit={onSubmit} className="space-y-6">
          {/* Sticky action bar */}
          <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-white/95 backdrop-blur border-b flex items-center justify-between shadow-sm">
            <div className="text-sm font-medium text-gray-700">
              فرم ثبت محصول
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="shrink-0 whitespace-nowrap px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={submitting || uploading}
                className="shrink-0 whitespace-nowrap px-6 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-lg border-2 border-red-700"
                style={{
                  backgroundColor:
                    submitting || uploading ? "#9ca3af" : "#dc2626",
                  color: "white",
                  borderColor: submitting || uploading ? "#6b7280" : "#b91c1c",
                }}
              >
                <span style={{ color: "white", fontWeight: "bold" }}>
                  {submitting ? "در حال ثبت…" : "ثبت"}
                </span>
              </button>
            </div>
          </div>
          {submitError && (
            <div className="mt-3 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {submitError}
            </div>
          )}
          <div className="bg-white rounded-2xl shadow-sm border p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">
              عنوان
              <input
                className={inputClass}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
              {errors.title && (
                <div className="text-[11px] text-red-600 mt-1">
                  {errors.title}
                </div>
              )}
            </label>
            <label className="text-sm">
              سختی
              <select
                className={inputClass}
                value={form.difficulty}
                onChange={(e) =>
                  setForm({ ...form, difficulty: e.target.value })
                }
              >
                <option>آسان</option>
                <option>متوسط</option>
                <option>سخت</option>
              </select>
            </label>
            <label className="text-sm">
              نفرات
              <input
                type="number"
                inputMode="numeric"
                min={1}
                className={inputClass}
                value={form.servings}
                onChange={(e) => setForm({ ...form, servings: e.target.value })}
              />
              {errors.servings && (
                <div className="text-[11px] text-red-600 mt-1">
                  {errors.servings}
                </div>
              )}
            </label>
            <label className="text-sm">
              دسته
              <select
                className={inputClass}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option>خورش</option>
                <option>کباب</option>
                <option>برنج</option>
                <option>دسر</option>
                <option>نوشیدنی</option>
                <option>پیش غذا</option>
                <option>سالاد</option>
                <option>سوپ</option>
                <option>نان</option>
              </select>
            </label>
          </div>

          <label className="text-sm block bg-white rounded-2xl shadow-sm border p-4">
            توضیحات
            <textarea
              className={`${inputClass} h-28`}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
            {errors.description && (
              <div className="text-[11px] text-red-600 mt-1">
                {errors.description}
              </div>
            )}
          </label>

          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">مواد اولیه</div>
              <button
                type="button"
                className="text-primary-600 text-xs"
                onClick={() =>
                  addRow("ingredients", { name: "", amount: "", unit: "" })
                }
              >
                + افزودن
              </button>
            </div>
            <div className="space-y-2">
              {form.ingredients.map((ing, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <input
                    placeholder="نام"
                    className="border rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
                    value={ing.name}
                    onChange={(e) =>
                      updateArrayField("ingredients", i, {
                        name: e.target.value,
                      })
                    }
                  />
                  <input
                    placeholder="مقدار"
                    className="border rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
                    value={ing.amount}
                    onChange={(e) =>
                      updateArrayField("ingredients", i, {
                        amount: e.target.value,
                      })
                    }
                  />
                  <div className="flex gap-2">
                    <input
                      placeholder="واحد"
                      className="border rounded-lg px-2 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
                      value={ing.unit}
                      onChange={(e) =>
                        updateArrayField("ingredients", i, {
                          unit: e.target.value,
                        })
                      }
                    />
                    <button
                      type="button"
                      className="text-red-600 text-xs"
                      onClick={() => removeRow("ingredients", i)}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">مراحل ساخت / برنامه</div>
              <button
                type="button"
                className="text-primary-600 text-xs"
                onClick={() =>
                  addRow("instructions", {
                    step: form.instructions.length + 1,
                    title: "",
                    description: "",
                  })
                }
              >
                + افزودن
              </button>
            </div>
            <div className="space-y-2">
              {form.instructions.map((st, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 md:grid-cols-[100px_200px_1fr_auto] items-start gap-2"
                >
                  <input
                    type="number"
                    min={1}
                    className="border rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
                    value={st.step}
                    onChange={(e) =>
                      updateArrayField("instructions", i, {
                        step: e.target.value,
                      })
                    }
                  />
                  <input
                    placeholder="عنوان مرحله (اختیاری)"
                    className="border rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
                    value={st.title || ""}
                    onChange={(e) =>
                      updateArrayField("instructions", i, {
                        title: e.target.value,
                      })
                    }
                  />
                  <textarea
                    placeholder="توضیح مرحله"
                    className="border rounded-lg px-2 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
                    value={st.description}
                    onChange={(e) =>
                      updateArrayField("instructions", i, {
                        description: e.target.value,
                      })
                    }
                  />
                  <button
                    type="button"
                    className="text-red-600 text-xs"
                    onClick={() => removeRow("instructions", i)}
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-sm">
              <div className="flex items-center justify-between">
                <label>تصاویر</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addImageByUrl}
                    className="text-xs border rounded px-2 py-1 bg-gray-50"
                  >
                    افزودن از لینک
                  </button>
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                    <span className="border rounded px-2 py-1 bg-gray-50">
                      آپلود
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={onPickImages}
                    />
                  </label>
                </div>
              </div>
              {uploading && (
                <div className="text-xs text-gray-500 mt-1">در حال آپلود…</div>
              )}
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(form.images || []).map((u, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={u}
                      alt="img"
                      className="w-full h-24 object-cover rounded-lg border"
                    />
                    <div className="absolute inset-1 flex items-start justify-between opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            images: f.images.filter((_, idx) => idx !== i),
                          }))
                        }
                        className="text-[10px] px-2 py-0.5 rounded bg-white/85 border"
                      >
                        حذف
                      </button>
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => setAsCover(i)}
                          className="text-[10px] px-2 py-0.5 rounded bg-white/85 border"
                        >
                          کاور
                        </button>
                      )}
                    </div>
                    {i === 0 && (
                      <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        کاور
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <label className="text-sm">
              مدت زمان (دقیقه)
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.cookingTime.total}
                onChange={(e) =>
                  setForm({
                    ...form,
                    cookingTime: { ...form.cookingTime, total: e.target.value },
                  })
                }
              />
              {errors.total && (
                <div className="text-[11px] text-red-600 mt-1">
                  {errors.total}
                </div>
              )}
            </label>
            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isVegetarian}
                onChange={(e) =>
                  setForm({ ...form, isVegetarian: e.target.checked })
                }
              />
              دست‌ساز
            </label>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <div className="text-sm font-medium mb-2">انتخاب موقعیت</div>
              <MapPicker
                value={{ lat: form.location.lat, lng: form.location.lng }}
                onChange={(pos) =>
                  setForm({
                    ...form,
                    location: { ...form.location, lat: pos.lat, lng: pos.lng },
                  })
                }
              />
              {addressPreview && (
                <div className="text-[11px] text-gray-600 mt-2">
                  {addressPreview}
                </div>
              )}
              {errors.location && (
                <div className="text-[11px] text-red-600 mt-1">
                  {errors.location}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm block">
                شهر
                <input
                  className={inputClass}
                  value={form.location.city}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      location: { ...form.location, city: e.target.value },
                    })
                  }
                />
              </label>
              <label className="text-sm block">
                محله
                <input
                  className={inputClass}
                  value={form.location.neighborhood}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      location: {
                        ...form.location,
                        neighborhood: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="submit"
              disabled={submitting || uploading}
              className="px-8 py-4 rounded-lg text-base font-bold bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-lg border-2 border-red-700"
              style={{
                backgroundColor:
                  submitting || uploading ? "#9ca3af" : "#dc2626",
                color: "white",
                borderColor: submitting || uploading ? "#6b7280" : "#b91c1c",
              }}
            >
              <span style={{ color: "white", fontWeight: "bold" }}>
                {submitting ? "در حال ثبت…" : "ثبت محصول"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateRecipe;
