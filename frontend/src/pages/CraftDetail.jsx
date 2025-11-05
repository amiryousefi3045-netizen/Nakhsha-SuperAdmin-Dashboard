import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  fetchCraftById,
  deleteCraft,
  toggleLike,
  toggleDislike,
  addComment,
  deleteComment,
} from "../services/crafts";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import CraftMeta from "../components/CraftMeta";
import { useAuth } from "../hooks/useAuth";

const PLACEHOLDER =
  "data:image/svg+xml;utf8,\
  <svg xmlns='http://www.w3.org/2000/svg' width='800' height='256' viewBox='0 0 800 256'>\
    <rect width='100%' height='100%' fill='%23e5e7eb'/>\
    <g fill='%239ca3af' font-family='sans-serif' font-size='20' text-anchor='middle'>\
      <text x='400' y='132'>بدون تصویر</text>\
    </g>\
  </svg>";

const CATEGORY_FALLBACKS = {
  "قالی و قالیچه":
    "https://images.unsplash.com/photo-1604908176997-431c3a7280e5?w=1200&q=60",
  سفال: "https://images.unsplash.com/photo-1604908554200-4d8f8d9ba4b3?w=1200&q=60",
  خاتم: "https://images.unsplash.com/photo-1617191517009-bb4d9c504761?w=1200&q=60",
  مینا: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200&q=60",
  گلیم: "https://images.unsplash.com/photo-1551024709-8f23befc6cf7?w=1200&q=60",
  "چرم دست‌دوز":
    "https://images.unsplash.com/photo-1604908207268-1a2fba9b5d7f?w=1200&q=60",
  میناکاری:
    "https://images.unsplash.com/photo-1549931319-420c83f9b21d?w=1200&q=60",
  فیروزه‌کوبی:
    "https://images.unsplash.com/photo-1544025162-d76694265947?w=1200&q=60",
};

const MiniMap = ({ lat, lng, title }) => {
  useEffect(() => {
    if (typeof lat !== "number" || typeof lng !== "number") return;
    const el = document.getElementById("mini-map");
    if (!el) return;
    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
    }).setView([lat, lng], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(
      map
    );
    L.marker([lat, lng])
      .addTo(map)
      .bindPopup(title || "");
    setTimeout(() => map.invalidateSize(), 0);
    return () => map.remove();
  }, [lat, lng, title]);
  return <div id="mini-map" className="w-full h-48 rounded-md" />;
};

const CraftDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [likeState, setLikeState] = useState({ loading: false });
  const [commentText, setCommentText] = useState("");
  const [commentRating, setCommentRating] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [comments, setComments] = useState([]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    fetchCraftById(id).then((d) => {
      if (ignore) return;
      if (d) {
        setData({
          ...d,
          _liked: d.liked || false,
          _disliked: d.disliked || false,
        });
        setComments(Array.isArray(d.comments) ? d.comments : []);
      } else {
        setData(d);
      }
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        در حال بارگذاری…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        محصول پیدا نشد.{" "}
        <Link className="text-primary-600" to="/">
          بازگشت
        </Link>
      </div>
    );
  }

  const totalMinutes = data.craftingTime?.total;
  const timeFa = totalMinutes ? `${totalMinutes} دقیقه` : "";
  const imgs = Array.isArray(data.images) ? data.images : [];
  const realImage = imgs[0];
  const fallbackByCategory = CATEGORY_FALLBACKS[data.category];
  const primaryImage =
    imgs[imgIdx] || realImage || fallbackByCategory || PLACEHOLDER;
  const isFallback = !realImage;

  const onDelete = async () => {
    if (deleting) return;
    const ok = window.confirm("حذف این محصول؟");
    if (!ok) return;
    try {
      setDeleting(true);
      await deleteCraft(id);
      navigate("/");
    } catch {
      alert("حذف ناموفق بود.");
    } finally {
      setDeleting(false);
    }
  };

  const onLike = async () => {
    if (likeState.loading || !data) return;
    setLikeState((s) => ({ ...s, loading: true }));
    try {
      const res = await toggleLike(id);
      setData((d) =>
        d
          ? {
              ...d,
              totalLikes: res.totalLikes,
              totalDislikes: res.totalDislikes,
              _liked: res.liked,
              _disliked: res.liked ? false : d._disliked,
            }
          : d
      );
    } catch (e) {
      console.warn("like failed", e);
    } finally {
      setLikeState({ loading: false });
    }
  };

  const onDislike = async () => {
    if (likeState.loading || !data) return;
    setLikeState((s) => ({ ...s, loading: true }));
    try {
      const res = await toggleDislike(id);
      setData((d) =>
        d
          ? {
              ...d,
              totalLikes: res.totalLikes,
              totalDislikes: res.totalDislikes,
              _disliked: res.disliked,
              _liked: res.disliked ? false : d._liked,
            }
          : d
      );
    } catch (e) {
      console.warn("dislike failed", e);
    } finally {
      setLikeState({ loading: false });
    }
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!user || commentBusy || !commentText.trim()) return;
    setCommentBusy(true);
    try {
      const res = await addComment(id, {
        text: commentText.trim(),
        rating: commentRating ? Number(commentRating) : undefined,
      });
      setComments((prev) => [res, ...prev]);
      setCommentText("");
      setCommentRating("");
    } catch {
      alert("ثبت نظر ناموفق بود");
    } finally {
      setCommentBusy(false);
    }
  };

  const removeComment = async (cid) => {
    if (!user) return;
    const target = comments.find((c) => c.id === cid);
    if (!target) return;
    const canDelete =
      user.role === "admin" ||
      (data?.author?.id && user.id === data.author.id) ||
      String(target.user) === String(user.id);
    if (!canDelete) return alert("اجازه حذف ندارید");
    const ok = window.confirm("حذف نظر؟");
    if (!ok) return;
    try {
      await deleteComment(id, cid);
      setComments((prev) => prev.filter((c) => c.id !== cid));
    } catch {
      alert("حذف نظر ناموفق بود");
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 p-4">
      {/* Left - content */}
      <section className="bg-white rounded-lg border p-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold">{data.title}</h1>
          <CraftMeta
            timeFa={timeFa}
            type={data.type}
            size={data.dimensions}
            category={data.category}
          />
        </div>
        {/* Like / Dislike Bar */}
        <div className="mt-3 flex items-center gap-3 justify-end">
          <button
            onClick={onLike}
            disabled={!user || likeState.loading}
            className={`flex items-center gap-1 text-xs px-3 py-1 rounded border transition ${
              data._liked
                ? "bg-green-600 text-white border-green-600"
                : "hover:bg-green-50"
            } disabled:opacity-50`}
            title="پسندیدم"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M2 12.5C2 10.57 3.57 9 5.5 9h3.58l-.63-3.06-.02-.23c0-.31.13-.61.33-.82L10.83 3l4.92 4.92c.18.18.29.43.29.71V19c0 1.1-.9 2-2 2H8c-.89 0-1.64-.58-1.89-1.39L3.14 13.4A3.49 3.49 0 0 1 2 12.5Z" />
            </svg>
            <span>{data.totalLikes || 0}</span>
          </button>
          <button
            onClick={onDislike}
            disabled={!user || likeState.loading}
            className={`flex items-center gap-1 text-xs px-3 py-1 rounded border transition ${
              data._disliked
                ? "bg-red-600 text-white border-red-600"
                : "hover:bg-red-50"
            } disabled:opacity-50`}
            title="نپسندیدم"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M22 11.5c0 1.93-1.57 3.5-3.5 3.5h-3.58l.63 3.06.02.23c0 .31-.13.61-.33.82L13.17 21l-4.92-4.92A1 1 0 0 1 8 15.37V5c0-1.1.9-2 2-2h4.99c.89 0 1.64.58 1.89 1.39l2.97 6.21c.16.33.15.7.15.9Z" />
            </svg>
            <span>{data.totalDislikes || 0}</span>
          </button>
        </div>
        <div className="relative mt-4">
          <img
            src={primaryImage}
            alt={data.title}
            className="w-full h-64 object-cover rounded-md"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = PLACEHOLDER;
            }}
          />
          {imgs.length > 1 && (
            <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2">
              <button
                className="bg-white/80 hover:bg-white text-xs px-2 py-1 rounded"
                onClick={() =>
                  setImgIdx((i) => (i - 1 + imgs.length) % imgs.length)
                }
              >
                قبلی
              </button>
              <button
                className="bg-white/80 hover:bg-white text-xs px-2 py-1 rounded"
                onClick={() => setImgIdx((i) => (i + 1) % imgs.length)}
              >
                بعدی
              </button>
            </div>
          )}
          {isFallback && (
            <span className="absolute top-3 left-3 px-2 py-1 rounded bg-amber-100 text-amber-800 text-xs">
              بدون عکس واقعی
            </span>
          )}
        </div>
        {imgs.length > 1 && (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {imgs.map((u, i) => (
              <button
                key={i}
                className={`w-16 h-16 flex-shrink-0 rounded border ${
                  i === imgIdx ? "ring-2 ring-primary-600" : ""
                }`}
                onClick={() => setImgIdx(i)}
                title={`تصویر ${i + 1}`}
              >
                <img
                  src={u}
                  alt="thumb"
                  className="w-full h-full object-cover rounded"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = PLACEHOLDER;
                  }}
                />
              </button>
            ))}
          </div>
        )}
        <p className="text-sm text-gray-700 mt-4 leading-7">
          {data.description}
        </p>

        <h2 className="text-base font-semibold mt-6">مواد و متریال</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {(data.materials || []).map((mat, i) => (
            <li key={i} className="flex justify-between border-b pb-1">
              <span>{mat.name}</span>
              <span className="text-gray-600">
                {mat.amount} {mat.unit}
              </span>
            </li>
          ))}
        </ul>

        <h2 className="text-base font-semibold mt-6">مراحل ساخت</h2>
        <ol className="mt-2 space-y-3 text-sm list-decimal pr-4">
          {(data.craftingSteps || []).map((st, i) => (
            <li key={i}>
              <div className="font-medium">
                مرحله {st.step}
                {st.title ? (
                  <span className="mx-2 text-gray-900 font-semibold">
                    : {st.title}
                  </span>
                ) : null}
              </div>
              <div className="text-gray-700 leading-7">{st.description}</div>
              {st.image && (
                <img
                  src={st.image}
                  alt="step"
                  className="w-full rounded mt-2"
                />
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Right - info & map */}
      <aside className="space-y-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-200" />
            <div>
              <div className="text-sm font-medium">
                {data.artisan?.name || "—"}
              </div>
              <div className="text-xs text-gray-500">
                ثبت شده در{" "}
                {new Date(data.createdAt).toLocaleDateString("fa-IR")}
              </div>
            </div>
          </div>
          {user && (user.role === "admin" || user.id === data.artisan?.id) && (
            <div className="mt-3 flex gap-2">
              <Link
                to={`/craft/${id}/edit`}
                className="px-3 py-1.5 rounded border text-xs"
              >
                ویرایش
              </Link>
              <button
                onClick={onDelete}
                disabled={deleting}
                className="px-3 py-1.5 rounded border text-xs text-red-600 disabled:opacity-50"
              >
                {deleting ? "در حال حذف…" : "حذف"}
              </button>
            </div>
          )}
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-700">محل تولید اثر</div>
          <div className="text-sm text-gray-700">محل عرضه محصول</div>
          <div className="text-xs text-gray-500 mt-1">
            {data.location?.city}
            {data.location?.neighborhood
              ? `، ${data.location.neighborhood}`
              : ""}
          </div>
          {typeof data.location?.coordinates?.[1] === "number" && (
            <div className="mt-3">
              <MiniMap
                lat={data.location.coordinates[1]}
                lng={data.location.coordinates[0]}
                title={data.title}
              />
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm font-semibold">برچسب‌ها</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {(data.tags || []).map((t, i) => (
              <span
                key={i}
                className="px-2 py-1 rounded-full bg-gray-100 text-gray-700"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Comments */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">نظرات کاربران</h3>
            <span className="text-[11px] text-gray-500">{comments.length}</span>
          </div>
          {user ? (
            <form onSubmit={submitComment} className="space-y-2 mb-4">
              <textarea
                className="w-full border rounded p-2 text-xs resize-none h-20"
                placeholder="نظر شما..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                maxLength={2000}
              />
              <div className="flex items-center gap-2 text-xs justify-between">
                <button
                  type="submit"
                  disabled={commentBusy || !commentText.trim()}
                  className="bg-black hover:bg-gray-800 text-white text-xs px-3 py-1.5 rounded disabled:opacity-50 order-2"
                >
                  {commentBusy ? "در حال ارسال…" : "ارسال"}
                </button>
                <select
                  className="border rounded px-2 py-1 order-1"
                  value={commentRating}
                  onChange={(e) => setCommentRating(e.target.value)}
                >
                  <option value="">امتیاز</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </form>
          ) : (
            <div className="text-xs text-gray-500 mb-3">
              برای ثبت نظر وارد شوید.
            </div>
          )}
          <ul className="space-y-3 max-h-80 overflow-y-auto thin-scrollbar pr-1">
            {comments.length === 0 && (
              <li className="text-[11px] text-gray-400">هنوز نظری ثبت نشده.</li>
            )}
            {comments.map((c) => {
              const canDelete =
                user &&
                (user.role === "admin" ||
                  (data?.artisan?.id && user.id === data.artisan.id) ||
                  String(c.user) === String(user.id));
              return (
                <li
                  key={c.id}
                  className="border rounded p-2 text-[11px] bg-gray-50 flex flex-col gap-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700 truncate max-w-[120px]">
                      {String(c.user).slice(0, 10)}
                    </span>
                    {c.rating && (
                      <span className="text-amber-600 font-medium">
                        {"★".repeat(c.rating)}
                        <span className="text-gray-400">
                          {"★".repeat(5 - c.rating)}
                        </span>
                      </span>
                    )}
                    <span className="text-gray-400 ml-auto">
                      {new Date(c.createdAt).toLocaleDateString("fa-IR")}
                    </span>
                  </div>
                  <div className="text-gray-700 leading-5 whitespace-pre-wrap">
                    {c.text}
                  </div>
                  {canDelete && (
                    <div className="text-left mt-1">
                      <button
                        onClick={() => removeComment(c.id)}
                        className="text-[10px] text-red-600 hover:underline"
                      >
                        حذف
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
};

export default CraftDetail;
