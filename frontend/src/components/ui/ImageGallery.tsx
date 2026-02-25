import type { FC } from "react";
import cn from "classnames";
import { toAbsoluteMediaUrl } from "../../services/media";

const GALLERY_FALLBACK =
  "data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22450%22 viewBox=%220 0 800 450%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23FAFAF7%22/%3E%3Cg fill=%22%232E2E2E%22 font-family=%22sans-serif%22 font-size=%2220%22 text-anchor=%22middle%22%3E%3Ctext x=%22400%22 y=%22232%22%3E%D8%A8%D8%AF%D9%88%D9%86 %D8%AA%D8%B5%D9%88%DB%8C%D8%B1%3C/text%3E%3C/g%3E%3C/svg%3E";

interface ImageGalleryProps {
  images: string[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  fallback?: string;
  showFallbackBadge?: boolean;
  alt?: string;
}

export const ImageGallery: FC<ImageGalleryProps> = ({
  images,
  currentIndex,
  onIndexChange,
  fallback,
  showFallbackBadge,
  alt,
}) => {
  if (!images?.length && !fallback) return null;

  const displayedImage =
    (images[currentIndex] ? toAbsoluteMediaUrl(images[currentIndex]) : "") ||
    (fallback ? toAbsoluteMediaUrl(fallback) : GALLERY_FALLBACK);
  const hasMultipleImages = images.length > 1;

  return (
    <div className="mt-4 space-y-2">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-nakhsha-border/30">
        <img
          src={displayedImage}
          alt={alt || "تصویر محصول"}
          className="w-full h-full object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = GALLERY_FALLBACK;
          }}
        />

        {showFallbackBadge && (
          <div className="absolute top-2 right-2 px-2 py-1 text-xs bg-nakhsha-text/80 text-white rounded">
            تصویر نمونه
          </div>
        )}
      </div>

      {hasMultipleImages && (
        <div className="grid grid-cols-6 gap-2">
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => onIndexChange(idx)}
              className={cn(
                "relative aspect-square overflow-hidden rounded bg-nakhsha-border/30",
                "hover:ring-2 hover:ring-primary-500 transition-all",
                idx === currentIndex && "ring-2 ring-primary-600",
              )}
            >
              <img
                src={toAbsoluteMediaUrl(img)}
                alt={`تصویر ${idx + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = GALLERY_FALLBACK;
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
