import { useEffect, useRef, useState, type FC } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchCraftById, updateCraft, uploadImage } from "../services/crafts";
import type { CraftUpdateRequest } from "../types/api";
import { reverseGeocode } from "../services/media";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface LatLng {
  lat: number;
  lng: number;
}

interface MapPickerProps {
  value: LatLng | null;
  onChange: (pos: LatLng) => void;
}

const MapPicker: FC<MapPickerProps> = ({ value, onChange }) => {
  const id = "map-picker-edit";
  const mapRef = useRef<ReturnType<typeof L.map> | null>(null);
  const markerRef = useRef<ReturnType<typeof L.marker> | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const el = document.getElementById(id);
    if (!el || mapRef.current) return;
    const map = L.map(el).setView([32.4279, 53.688], 6);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const placeMarker = (lat: number, lng: number, fire = true) => {
      if (markerRef.current) markerRef.current.remove();
      markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const ll = markerRef.current!.getLatLng();
        onChangeRef.current?.({ lat: ll.lat, lng: ll.lng });
      });
      if (fire) onChangeRef.current?.({ lat, lng });
    };

    const onClick = (e: { latlng: { lat: number; lng: number } }) =>
      placeMarker(e.latlng.lat, e.latlng.lng);
    map.on("click", onClick);
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      try {
        map.off("click", onClick);
        map.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value?.lat || !value?.lng) return;
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = L.marker([value.lat, value.lng], {
      draggable: true,
    }).addTo(map);
    markerRef.current.on("dragend", () => {
      const ll = markerRef.current!.getLatLng();
      onChangeRef.current?.({ lat: ll.lat, lng: ll.lng });
    });
  }, [value?.lat, value?.lng]);

  return <div id={id} className="w-full h-64 rounded-md" />;
};

// ---- Form types ----
interface Ingredient {
  name: string;
  amount: string;
  unit: string;
}
interface Instruction {
  step: string;
  title: string;
  description: string;
}
interface CraftFormState {
  title: string;
  description: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  images: string[];
  cookingTime: { total: string };
  difficulty: string;
  servings: string;
  category: string;
  tags: string[];
  isVegetarian: boolean;
  location: { city: string; neighborhood: string; lat: number; lng: number };
}
type FormErrors = Partial<Record<string, string>>;

const EditCraft: FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<CraftFormState | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [addressPreview, setAddressPreview] = useState("");
  const [submitError, setSubmitError] = useState("");

  const inputClass =
    "mt-1 w-full rounded-lg border border-nakhsha-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500/60 focus:border-primary-500 placeholder:text-nakhsha-text/40 hover:border-primary-400";

  // Load existing craft
  useEffect(() => {
    if (!id) return;
    let ignore = false;
    setLoading(true);
    fetchCraftById(id).then((d: unknown) => {
      if (ignore) return;
      if (!d) {
        setLoading(false);
        return;
      }
      const craft = d as Record<string, unknown>;
      const loc = (craft.location as Record<string, unknown>) || {};
      const coords = loc.coordinates as [number, number] | undefined;
      setForm({
        title: String(craft.title || ""),
        description: String(craft.description || ""),
        ingredients:
          Array.isArray(craft.ingredients) && craft.ingredients.length
            ? (craft.ingredients as Ingredient[])
            : [{ name: "", amount: "", unit: "" }],
        instructions:
          Array.isArray(craft.instructions) && craft.instructions.length
            ? (craft.instructions as Array<Record<string, unknown>>).map(
                (x) => ({
                  step: String(x.step || 1),
                  title: String(x.title || ""),
                  description: String(x.description || ""),
                }),
              )
            : [{ step: "1", title: "", description: "" }],
        images:
          Array.isArray(craft.images) && (craft.images as string[]).length
            ? (craft.images as string[]).slice(0, 12)
            : [],
        cookingTime: {
          total: String(
            (craft.cookingTime as Record<string, unknown>)?.total ?? 0,
          ),
        },
        difficulty: String(craft.difficulty || "متوسط"),
        servings: String(craft.servings || 2),
        category: String(craft.category || "خورش"),
        tags: Array.isArray(craft.tags) ? (craft.tags as string[]) : [],
        isVegetarian: !!craft.isVegetarian,
        location: {
          city: String(loc.city || "تهران"),
          neighborhood: String(loc.neighborhood || ""),
          lat: typeof coords?.[1] === "number" ? coords[1] : 35.735,
          lng: typeof coords?.[0] === "number" ? coords[0] : 51.41,
        },
      });
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [id]);

  const updateArrayField = <T,>(
    key: "ingredients" | "instructions",
    idx: number,
    patch: Partial<T>,
  ) => {
    setForm((f) =>
      f
        ? {
            ...f,
            [key]: (f[key] as T[]).map((x, i) =>
              i === idx ? { ...x, ...patch } : x,
            ),
          }
        : f,
    );
  };

  const addRow = (
    key: "ingredients" | "instructions",
    row: Ingredient | Instruction,
  ) =>
    setForm((f) =>
      f
        ? { ...f, [key]: [...(f[key] as (Ingredient | Instruction)[]), row] }
        : f,
    );

  const removeRow = (key: "ingredients" | "instructions", idx: number) =>
    setForm((f) =>
      f
        ? {
            ...f,
            [key]: (f[key] as (Ingredient | Instruction)[]).filter(
              (_, i) => i !== idx,
            ),
          }
        : f,
    );

  const onPickImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files) {
        try {
          urls.push(await uploadImage(file));
        } catch {
          /* skip */
        }
      }
      if (urls.length)
        setForm((f) =>
          f ? { ...f, images: [...(f.images || []), ...urls].slice(0, 12) } : f,
        );
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
    setForm((f) =>
      f ? { ...f, images: [...(f.images || []), url].slice(0, 12) } : f,
    );
  };

  const setAsCover = (i: number) => {
    setForm((f) => {
      if (!f) return f;
      const arr = [...(f.images || [])];
      if (i < 0 || i >= arr.length) return f;
      const [img] = arr.splice(i, 1);
      return { ...f, images: [img, ...arr] };
    });
  };

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    if (!form?.title?.trim()) errs.title = "عنوان الزامی است";
    if ((form?.description || "").trim().length < 10)
      errs.description = "توضیحات حداقل ۱۰ کاراکتر";
    if ((Number(form?.servings) || 0) < 1) errs.servings = "حداقل ۱";
    if ((Number(form?.cookingTime?.total) || 0) < 0) errs.total = "نامعتبر";
    if (!form?.location?.lat || !form?.location?.lng)
      errs.location = "لطفاً موقعیت را روی نقشه انتخاب کنید";
    const badIng = (form?.ingredients || []).find(
      (x) => x.name && (!x.amount || !x.unit),
    );
    if (badIng)
      errs.ingredients = "برای موادِ دارای نام، مقدار و واحد را هم وارد کنید";
    return errs;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = {
        title: form.title,
        description: form.description,
        ingredients: form.ingredients.filter(
          (x) => x.name.trim() && x.amount.trim() && x.unit.trim(),
        ),
        instructions: form.instructions
          .filter((x) => x.description.trim())
          .map((x, i) => ({
            step: Number(x.step) || i + 1,
            title: x.title.trim() || undefined,
            description: x.description.trim(),
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
          coordinates:
            typeof form.location.lng === "number" &&
            typeof form.location.lat === "number"
              ? [form.location.lng, form.location.lat]
              : undefined,
        },
      };
      await updateCraft(id!, payload as CraftUpdateRequest);
      navigate(`/craft/${id}?_=${Date.now()}`);
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { details?: string[] } };
      };
      let msg =
        e?.response?.status === 401
          ? "برای ویرایش باید وارد شوید."
          : "ذخیره ناموفق. اتصال به سرور برقرار نیست یا ورودی‌ها نامعتبر است.";
      const details = e?.response?.data?.details;
      if (Array.isArray(details) && details.length)
        msg += `\n${details.join("؛ ")}`;
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const latVal = form?.location?.lat;
  const lngVal = form?.location?.lng;

  useEffect(() => {
    if (!latVal || !lngVal) return;
    let ignore = false;
    reverseGeocode(latVal, lngVal).then((a) => {
      if (ignore) return;
      setAddressPreview((a as { displayName?: string }).displayName || "");
      setForm((f) =>
        f
          ? {
              ...f,
              location: {
                ...f.location,
                city: (a as { city?: string }).city || f.location.city,
                neighborhood:
                  (a as { neighborhood?: string }).neighborhood ||
                  f.location.neighborhood,
              },
            }
          : f,
      );
    });
    return () => {
      ignore = true;
    };
  }, [latVal, lngVal]);

  useEffect(() => {
    if (form) setErrors(validate());
  }, [
    form?.title,
    form?.description,
    form?.servings,
    form?.cookingTime?.total,
    latVal,
    lngVal,
  ]);

  if (loading || !form) {
    return (
      <div className="p-6 text-center text-sm text-nakhsha-text/60">
        در حال بارگذاری…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto thin-scrollbar">
      <div className="max-w-[900px] mx-auto p-4">
        <h1 className="text-xl font-bold mb-4">ویرایش محصول / اثر</h1>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-nakhsha-bg/95 backdrop-blur border-b flex items-center justify-between shadow-sm border-nakhsha-border">
            <div className="text-sm font-medium text-nakhsha-text">
              فرم ویرایش محصول
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="shrink-0 whitespace-nowrap px-4 py-2 rounded-lg border border-nakhsha-border text-sm text-nakhsha-text hover:bg-nakhsha-bg transition-colors"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={submitting || uploading}
                className="shrink-0 whitespace-nowrap px-6 py-2 rounded-lg text-sm font-bold disabled:bg-nakhsha-border/40 disabled:cursor-not-allowed transition-colors shadow-lg border-2"
                style={{
                  backgroundColor:
                    submitting || uploading
                      ? "var(--color-muted)"
                      : "var(--color-destructive)",
                  color: "white",
                  borderColor:
                    submitting || uploading
                      ? "var(--color-muted)"
                      : "var(--color-destructive-dark)",
                }}
              >
                <span style={{ color: "white", fontWeight: "bold" }}>
                  {submitting ? "در حال ذخیره…" : "ذخیره تغییرات"}
                </span>
              </button>
            </div>
          </div>

          {submitError && (
            <div className="mt-3 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {submitError}
            </div>
          )}

          <div className="bg-nakhsha-bg rounded-2xl shadow-sm border border-nakhsha-border p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <label className="text-sm block bg-nakhsha-bg rounded-2xl shadow-sm border border-nakhsha-border p-4">
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

          <div className="bg-nakhsha-bg rounded-2xl shadow-sm border border-nakhsha-border p-4">
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
                    className="border border-nakhsha-border rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
                    value={ing.name}
                    onChange={(e) =>
                      updateArrayField<Ingredient>("ingredients", i, {
                        name: e.target.value,
                      })
                    }
                  />
                  <input
                    placeholder="مقدار"
                    className="border rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
                    value={ing.amount}
                    onChange={(e) =>
                      updateArrayField<Ingredient>("ingredients", i, {
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
                        updateArrayField<Ingredient>("ingredients", i, {
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
              {errors.ingredients && (
                <div className="text-[11px] text-red-600 mt-1">
                  {errors.ingredients}
                </div>
              )}
            </div>
          </div>

          <div className="bg-nakhsha-bg rounded-2xl shadow-sm border border-nakhsha-border p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">مراحل ساخت / برنامه</div>
              <button
                type="button"
                className="text-primary-600 text-xs"
                onClick={() =>
                  addRow("instructions", {
                    step: String(form.instructions.length + 1),
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
                      updateArrayField<Instruction>("instructions", i, {
                        step: e.target.value,
                      })
                    }
                  />
                  <input
                    placeholder="عنوان مرحله (اختیاری)"
                    className="border rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
                    value={st.title || ""}
                    onChange={(e) =>
                      updateArrayField<Instruction>("instructions", i, {
                        title: e.target.value,
                      })
                    }
                  />
                  <textarea
                    placeholder="توضیح مرحله"
                    className="border rounded-lg px-2 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
                    value={st.description}
                    onChange={(e) =>
                      updateArrayField<Instruction>("instructions", i, {
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

          <div className="bg-nakhsha-bg rounded-2xl shadow-sm border border-nakhsha-border p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-sm">
              <div className="flex items-center justify-between">
                <label>تصاویر</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={addImageByUrl}
                    className="text-xs border rounded px-2 py-1 border-nakhsha-border bg-nakhsha-bg"
                  >
                    افزودن از لینک
                  </button>
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                    <span className="border rounded px-2 py-1 border-nakhsha-border bg-nakhsha-bg">
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
                <div className="text-xs text-nakhsha-text/60 mt-1">
                  در حال آپلود…
                </div>
              )}
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(form.images || []).map((u, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={u}
                      alt="img"
                      className="w-full h-24 object-cover rounded-lg border border-nakhsha-border"
                    />
                    <div className="absolute inset-1 flex items-start justify-between opacity-0 group-hover:opacity-100 transition">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) =>
                            f
                              ? {
                                  ...f,
                                  images: f.images.filter(
                                    (_, idx) => idx !== i,
                                  ),
                                }
                              : f,
                          )
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

          <div className="bg-nakhsha-bg rounded-2xl shadow-sm border border-nakhsha-border p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
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
                <div className="text-[11px] text-nakhsha-text/60 mt-2">
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
              className="px-8 py-4 rounded-lg text-base font-bold disabled:bg-nakhsha-border/40 disabled:cursor-not-allowed transition-colors shadow-lg border-2"
              style={{
                backgroundColor:
                  submitting || uploading
                    ? "var(--color-muted)"
                    : "var(--color-destructive)",
                color: "white",
                borderColor:
                  submitting || uploading
                    ? "var(--color-muted)"
                    : "var(--color-destructive-dark)",
              }}
            >
              <span style={{ color: "white", fontWeight: "bold" }}>
                {submitting ? "در حال ذخیره…" : "ذخیره تغییرات"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditCraft;
