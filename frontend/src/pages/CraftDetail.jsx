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

export default function CraftDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentRating, setCommentRating] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [comments, setComments] = useState([]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchCraftById(id)
      .then((d) => {
        if (!mounted) return;
        setData(
          d
            ? { ...d, _liked: d.liked || false, _disliked: d.disliked || false }
            : null
        );
        setComments(d && Array.isArray(d.comments) ? d.comments : []);
      })
      .finally(() => mounted && setLoading(false));
    return () => (mounted = false);
  }, [id]);

  if (loading)
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        در حال بارگذاری…
      </div>
    );
  if (!data)
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        محصول پیدا نشد.{" "}
        <Link className="text-primary-600" to="/">
          بازگشت
        </Link>
      </div>
    );

  const imgs = Array.isArray(data.images) ? data.images : [];
  const primaryImage = imgs[imgIdx] || imgs[0] || PLACEHOLDER;

  const onDelete = async () => {
    if (deleting) return;
    if (!window.confirm("حذف این محصول؟")) return;
    try {
      setDeleting(true);
      await deleteCraft(id);
      navigate("/");
    } catch (e) {
      console.error(e);
      alert("حذف ناموفق بود.");
    } finally {
      setDeleting(false);
    }
  };

  const onLike = async () => {
    if (likeLoading) return;
    setLikeLoading(true);
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
      console.warn(e);
    } finally {
      setLikeLoading(false);
    }
  };

  const onDislike = async () => {
    if (likeLoading) return;
    setLikeLoading(true);
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
      console.warn(e);
    } finally {
      setLikeLoading(false);
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
      setComments((p) => [res, ...p]);
      setCommentText("");
      setCommentRating("");
    } catch (e) {
      console.error(e);
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
      user &&
      (user.role === "admin" ||
        (data?.artisan?.id && user.id === data.artisan.id) ||
        String(target.user) === String(user.id));
    if (!canDelete) return alert("اجازه حذف ندارید");
    if (!window.confirm("حذف نظر؟")) return;
    try {
      await deleteComment(id, cid);
      setComments((p) => p.filter((c) => c.id !== cid));
    } catch (e) {
      console.error(e);
      alert("حذف نظر ناموفق بود");
    }
  };

  const renderComment = (c) => {
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
              <span className="text-gray-400">{"★".repeat(5 - c.rating)}</span>
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
  };

  return (
    <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 p-4">
      <section className="bg-white rounded-lg border p-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold">{data.title}</h1>
          <CraftMeta
            timeFa={
              data.craftingTime?.total ? `${data.craftingTime.total} دقیقه` : ""
            }
            type={data.type}
            size={data.dimensions}
            category={data.category}
          />
        </div>

        <div className="mt-3 flex items-center gap-3 justify-end">
          <button
            onClick={onLike}
            disabled={!user || likeLoading}
            className={`flex items-center gap-1 text-xs px-3 py-1 rounded border transition ${
              data._liked
                ? "bg-green-600 text-white border-green-600"
                : "hover:bg-green-50"
            } disabled:opacity-50`}
            title="پسندیدم"
          >
            <span>{data.totalLikes || 0}</span>
          </button>
          <button
            onClick={onDislike}
            disabled={!user || likeLoading}
            className={`flex items-center gap-1 text-xs px-3 py-1 rounded border transition ${
              data._disliked
                ? "bg-red-600 text-white border-red-600"
                : "hover:bg-red-50"
            } disabled:opacity-50`}
            title="نپسندیدم"
          >
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
        </div>

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
            {comments.length === 0 ? (
              <li className="text-[11px] text-gray-400">هنوز نظری ثبت نشده.</li>
            ) : (
              comments.map(renderComment)
            )}
          </ul>
        </div>
      </aside>
    </div>
  );
}
