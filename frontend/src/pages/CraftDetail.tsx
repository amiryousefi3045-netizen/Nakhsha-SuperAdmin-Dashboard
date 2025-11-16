import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  fetchCraftById,
  deleteCraft,
  toggleLike,
  toggleDislike,
  addComment,
  deleteComment,
  type CraftResponse,
  type CommentResponse,
} from "../services/crafts";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import CraftMeta from "../components/CraftMeta";
import { useAuth } from "../hooks/useAuth";
import { useAsync } from "../hooks/useAsync";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ImageGallery } from "../components/ui/ImageGallery";
import { Alert } from "../components/ui/Alert";

const PLACEHOLDER_SVG =
  "data:image/svg+xml;utf8,\
  <svg xmlns='http://www.w3.org/2000/svg' width='800' height='256' viewBox='0 0 800 256'>\
    <rect width='100%' height='100%' fill='%23FAFAF7'/>\
    <g fill='%232E2E2E' font-family='sans-serif' font-size='20' text-anchor='middle'>\
      <text x='400' y='132'>بدون تصویر</text>\
    </g>\
  </svg>";

interface MiniMapProps {
  lat: number;
  lng: number;
  title?: string;
}

const MiniMap: React.FC<MiniMapProps> = ({ lat, lng, title }) => {
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

    // Fix Leaflet render issues in container
    requestAnimationFrame(() => map.invalidateSize());

    return () => map.remove();
  }, [lat, lng, title]);

  return <div id="mini-map" className="w-full h-48 rounded-md" />;
};

export const CraftDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState<CraftResponse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [likeState, setLikeState] = useState({ loading: false });
  const [commentText, setCommentText] = useState("");
  const [commentRating, setCommentRating] = useState<string>("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [comments, setComments] = useState<CommentResponse[]>([]);

  const { loading, error } = useAsync(async () => {
    if (!id) return;
    const response = await fetchCraftById(id);
    if (response) {
      setData({
        ...response,
        _liked: response.liked || false,
        _disliked: response.disliked || false,
      });
      setComments(Array.isArray(response.comments) ? response.comments : []);
    }
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 text-center">
        <Alert variant="info" message="در حال بارگذاری…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <Alert variant="error" message="خطا در بارگذاری محصول" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center">
        <Alert
          variant="warning"
          message={
            <>
              محصول پیدا نشد.{" "}
              <Link className="text-primary-600 hover:underline" to="/">
                بازگشت به صفحه اصلی
              </Link>
            </>
          }
        />
      </div>
    );
  }

  const totalMinutes = data.craftingTime?.total;
  const timeFa = totalMinutes ? `${totalMinutes} دقیقه` : "";
  const imgs = Array.isArray(data.images) ? data.images : [];
  const realImage = imgs[0];
  const isFallback = !realImage;

  const onDelete = async () => {
    if (deleting) return;

    const ok = window.confirm("آیا از حذف این محصول مطمئن هستید؟");
    if (!ok) return;

    try {
      setDeleting(true);
      if (!id) return;
      await deleteCraft(id!);
      navigate("/", {
        state: { message: "محصول با موفقیت حذف شد" },
      });
    } catch (err) {
      Alert({
        variant: "error",
        message: "حذف محصول با خطا مواجه شد",
        duration: 3000,
      });
    } finally {
      setDeleting(false);
    }
  };

  const onLike = async () => {
    if (likeState.loading || !data || !id) return;

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
    } catch (err) {
      console.warn("Like failed:", err);
      Alert({
        variant: "error",
        message: "ثبت پسند با خطا مواجه شد",
        duration: 2000,
      });
    } finally {
      setLikeState({ loading: false });
    }
  };

  const onDislike = async () => {
    if (likeState.loading || !data || !id) return;

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
    } catch (err) {
      console.warn("Dislike failed:", err);
      Alert({
        variant: "error",
        message: "ثبت نپسندیدن با خطا مواجه شد",
        duration: 2000,
      });
    } finally {
      setLikeState({ loading: false });
    }
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || commentBusy || !commentText.trim() || !id) return;

    setCommentBusy(true);
    try {
      const res = await addComment(id, {
        text: commentText.trim(),
        rating: commentRating ? Number(commentRating) : undefined,
      });
      setComments((prev) => [res, ...prev]);
      setCommentText("");
      setCommentRating("");
      Alert({
        variant: "success",
        message: "نظر شما با موفقیت ثبت شد",
        duration: 2000,
      });
    } catch (err) {
      Alert({
        variant: "error",
        message: "ثبت نظر با خطا مواجه شد",
        duration: 3000,
      });
    } finally {
      setCommentBusy(false);
    }
  };

  const removeComment = async (cid: string) => {
    if (!user || !id) return;

    const target = comments.find((c) => c.id === cid);
    if (!target) return;

    const canDelete =
      user.role === "admin" ||
      (data?.artisan?.id && user.id === data.artisan.id) ||
      String(target.user) === String(user.id);

    if (!canDelete) {
      Alert({
        variant: "error",
        message: "شما اجازه حذف این نظر را ندارید",
        duration: 2000,
      });
      return;
    }

    const ok = window.confirm("آیا از حذف این نظر مطمئن هستید؟");
    if (!ok) return;

    try {
      await deleteComment(id, cid);
      setComments((prev) => prev.filter((c) => c.id !== cid));
      Alert({
        variant: "success",
        message: "نظر با موفقیت حذف شد",
        duration: 2000,
      });
    } catch (err) {
      Alert({
        variant: "error",
        message: "حذف نظر با خطا مواجه شد",
        duration: 2000,
      });
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 p-4">
      <Card className="bg-nakhsha-bg rounded-lg border border-nakhsha-border p-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold">{data.title}</h1>
          <CraftMeta
            timeFa={timeFa}
            type={data.type}
            size={data.dimensions}
            category={data.category}
          />
        </div>

        <div className="mt-3 flex items-center gap-3 justify-end">
          <Button
            onClick={onLike}
            disabled={!user || likeState.loading}
            variant={data._liked ? "success" : "outline"}
            title="پسندیدم"
            className="flex items-center gap-1"
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
          </Button>

          <Button
            onClick={onDislike}
            disabled={!user || likeState.loading}
            variant={data._disliked ? "error" : "outline"}
            title="نپسندیدم"
            className="flex items-center gap-1"
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
          </Button>
        </div>

        <ImageGallery
          images={imgs}
          currentIndex={imgIdx}
          onIndexChange={setImgIdx}
          fallback={PLACEHOLDER_SVG}
          showFallbackBadge={isFallback}
          alt={data.title}
        />

        <div className="prose prose-sm mt-4 text-nakhsha-text">
          <p className="leading-7">{data.description}</p>

          <h2 className="text-base font-semibold mt-6">مواد و متریال</h2>
          <ul className="mt-2 space-y-2">
            {(data.materials || []).map((mat, i) => (
              <li
                key={i}
                className="flex justify-between border-b pb-1 border-nakhsha-border"
              >
                <span>{mat.name}</span>
                <span className="text-nakhsha-text/60">
                  {mat.amount} {mat.unit}
                </span>
              </li>
            ))}
          </ul>

          <h2 className="text-base font-semibold mt-6">مراحل ساخت</h2>
          <ol className="mt-2 space-y-3 list-decimal pr-4">
            {(data.craftingSteps || []).map((st, i) => (
              <li key={i}>
                <div className="font-medium">
                  مرحله {st.step}
                  {st.title && (
                    <span className="mx-2 text-nakhsha-text font-semibold">
                      : {st.title}
                    </span>
                  )}
                </div>
                <div className="text-nakhsha-text leading-7">
                  {st.description}
                </div>
                {st.image && (
                  <img
                    src={st.image}
                    alt={`مرحله ${st.step}`}
                    className="w-full rounded mt-2"
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <aside className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-nakhsha-border/30" />
            <div>
              <div className="text-sm font-medium">
                {data.artisan?.name || "—"}
              </div>
              <time
                className="text-xs text-nakhsha-text/60"
                dateTime={data.createdAt || ""}
              >
                ثبت شده در{" "}
                {new Date(data.createdAt || "").toLocaleDateString("fa-IR")}
              </time>
            </div>
          </div>

          {user && (user.role === "admin" || user.id === data.artisan?.id) && (
            <div className="mt-3 flex gap-2">
              <Button
                as={Link}
                to={`/craft/${id}/edit`}
                variant="outline"
                size="sm"
              >
                ویرایش
              </Button>
              <Button
                onClick={onDelete}
                disabled={deleting}
                variant="error"
                size="sm"
              >
                {deleting ? "در حال حذف…" : "حذف"}
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="text-sm text-nakhsha-text">محل تولید اثر</div>
          <div className="text-sm text-nakhsha-text">محل عرضه محصول</div>
          <div className="text-xs text-nakhsha-text/60 mt-1">
            {(data.location as any)?.city}
            {(data.location as any)?.neighborhood &&
              `، ${(data.location as any).neighborhood}`}
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
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold">برچسب‌ها</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(data.tags || []).map((tag, i) => (
              <span
                key={i}
                className="px-2 py-1 text-xs rounded-full bg-primary-50 text-primary-700"
              >
                {tag}
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">نظرات کاربران</h3>
            <span className="text-[11px] text-nakhsha-text/60">
              {comments.length}
            </span>
          </div>

          {user ? (
            <form onSubmit={submitComment} className="space-y-2 mb-4">
              <textarea
                className="w-full border rounded p-2 text-xs resize-none h-20"
                placeholder="نظر شما..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                maxLength={2000}
                required
              />

              <div className="flex items-center gap-2 text-xs justify-between">
                <Button
                  type="submit"
                  disabled={commentBusy || !commentText.trim()}
                  variant="primary"
                  size="sm"
                  className="order-2"
                >
                  {commentBusy ? "در حال ارسال…" : "ارسال"}
                </Button>

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
            <Alert
              variant="info"
              message="برای ثبت نظر وارد شوید"
              className="mb-3"
            />
          )}

          <ul className="space-y-3 max-h-80 overflow-y-auto thin-scrollbar pr-1">
            {comments.length === 0 ? (
              <li className="text-[11px] text-nakhsha-text/40">
                هنوز نظری ثبت نشده.
              </li>
            ) : (
              comments.map((c) => {
                const canDelete =
                  user &&
                  (user.role === "admin" ||
                    (data?.artisan?.id && user.id === data.artisan.id) ||
                    String(c.user) === String(user.id));

                return (
                  <li
                    key={c.id}
                    className="border rounded p-2 text-[11px] border-nakhsha-border bg-nakhsha-bg flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-nakhsha-text truncate max-w-[120px]">
                        {String(c.user).slice(0, 10)}
                      </span>

                      {c.rating && (
                        <span className="text-amber-600 font-medium">
                          {"★".repeat(c.rating)}
                          <span className="text-nakhsha-text/40">
                            {"★".repeat(5 - c.rating)}
                          </span>
                        </span>
                      )}

                      <time
                        className="text-nakhsha-text/40 ml-auto"
                        dateTime={c.createdAt}
                      >
                        {new Date(c.createdAt).toLocaleDateString("fa-IR")}
                      </time>
                    </div>

                    <div className="text-nakhsha-text leading-5 whitespace-pre-wrap">
                      {c.text}
                    </div>

                    {canDelete && (
                      <div className="text-left mt-1">
                        <Button
                          onClick={() => removeComment(c.id)}
                          variant="text"
                          size="xs"
                          className="text-red-600 hover:underline"
                        >
                          حذف
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </Card>
      </aside>
    </div>
  );
};

export default CraftDetail;
