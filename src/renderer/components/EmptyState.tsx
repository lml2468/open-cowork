import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  /** Line icon shown in the centered glyph badge. */
  icon: LucideIcon;
  /** Short, encouraging headline. */
  title: string;
  /** One-line supporting copy. */
  description?: string;
  /** Optional single primary call-to-action. */
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  /** Vertical padding preset — `compact` for inline lists, `full` for whole panes. */
  size?: 'compact' | 'full';
}

/**
 * Reusable friendly empty-state: centered line-icon + encouragement + one CTA.
 * Gives default (unconfigured) surfaces an intentional look rather than a blank
 * void.
 */
export const EmptyState = memo(function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'full',
}: EmptyStateProps) {
  const ActionIcon = action?.icon;
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 ${
        size === 'full' ? 'py-16' : 'py-10'
      }`}
    >
      <div className="w-14 h-14 rounded-4xl flex items-center justify-center bg-surface border border-border-subtle shadow-soft mb-4">
        <Icon className="w-6 h-6 text-text-muted" />
      </div>
      <p className="text-body font-medium text-text-primary">{title}</p>
      {description && (
        <p className="mt-1.5 text-body-sm text-text-muted max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="btn btn-primary mt-5 px-4 py-2 rounded-2xl"
        >
          {ActionIcon && <ActionIcon className="w-4 h-4" />}
          <span>{action.label}</span>
        </button>
      )}
    </div>
  );
});
