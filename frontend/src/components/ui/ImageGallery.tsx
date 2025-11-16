import React from "react";
import cn from "classnames";

interface ImageGalleryProps {
  images: string[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  fallback?: string;
  showFallbackBadge?: boolean;
  alt?: string;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({
  images,
  currentIndex,
  onIndexChange,
  fallback,
  showFallbackBadge,
  alt,
}) => {
  if (!images?.length && !fallback) return null;

  const displayedImage = images[currentIndex] || fallback;
  const hasMultipleImages = images.length > 1;

  return (
    <div className="mt-4 space-y-2">
      <div className="relative aspect-video overflow-hidden rounded-lg bg-nakhsha-border/30">
        <img
          src={displayedImage}
          alt={alt || "تصویر محصول"}
          className="w-full h-full object-contain"
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
                idx === currentIndex && "ring-2 ring-primary-600"
              )}
            >
              <img
                src={img}
                alt={`تصویر ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
