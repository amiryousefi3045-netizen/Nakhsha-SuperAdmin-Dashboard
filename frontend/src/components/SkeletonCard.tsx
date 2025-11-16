/**
 * SkeletonCard - Lightweight skeleton loader for craft cards
 * Used during data fetching to show placeholder content
 * No external dependencies - pure Tailwind CSS animation
 */

const SkeletonCard = () => (
  <div className="group block bg-white rounded-2xl overflow-hidden shadow-sm p-0 animate-pulse motion-safe:animate-[pulse_2s_ease-in-out_infinite] motion-reduce:opacity-75">
    {/* Image placeholder */}
    <div className="w-full aspect-[4/3] bg-nakhsha-border/30 rounded-2xl animate-shimmer" />

    {/* Content placeholder */}
    <div className="p-4 space-y-3">
      {/* Title skeleton - 2 lines */}
      <div className="space-y-2">
        <div className="h-4 bg-gray-200 rounded-full w-full animate-pulse" />
        <div className="h-4 bg-nakhsha-border/30 rounded-full w-3/4 animate-pulse" />
      </div>

      {/* Category badge skeleton */}
      <div className="h-6 bg-nakhsha-border/30 rounded-full w-24 animate-pulse" />

      {/* Distance & location skeleton */}
      <div className="space-y-2">
        <div className="h-5 bg-nakhsha-border/30 rounded-full w-32 animate-pulse" />
        <div className="h-4 bg-gray-200 rounded-full w-full animate-pulse" />
      </div>

      {/* Button skeleton */}
      <div className="pt-2">
        <div className="h-9 bg-nakhsha-border/30 rounded-full w-full animate-pulse" />
      </div>
    </div>
  </div>
);

export default SkeletonCard;
