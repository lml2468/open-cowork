import { memo } from 'react';

interface SkeletonProps {
  /** Extra Tailwind classes for sizing/shape (e.g. `h-4 w-24 rounded-full`). */
  className?: string;
}

/**
 * Shimmer placeholder block. Uses `animate-pulse`, which is neutralized by the
 * global `prefers-reduced-motion` rule in `globals.css`, so it honors reduced
 * motion automatically.
 */
export const Skeleton = memo(function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-surface-active/60 rounded-lg ${className}`} />;
});

interface SkeletonCardProps {
  /** Number of placeholder rows to render. */
  count?: number;
}

/** A list of card-shaped skeletons for async list surfaces (skills/connectors). */
export const SkeletonCardList = memo(function SkeletonCardList({ count = 3 }: SkeletonCardProps) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border-subtle bg-surface p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-3 h-3 rounded-full" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="mt-3 ml-6 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
});
