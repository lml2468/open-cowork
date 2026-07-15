import { useTranslation } from 'react-i18next';
import { Layers, Folder, FileDiff, type LucideIcon } from 'lucide-react';

export type PanelTab = 'artifacts' | 'files' | 'changes';

interface PanelTabsProps {
  active: PanelTab;
  onChange: (tab: PanelTab) => void;
}

const TABS: Array<{ id: PanelTab; icon: LucideIcon; labelKey: string }> = [
  { id: 'artifacts', icon: Layers, labelKey: 'context.tabs.artifacts' },
  { id: 'files', icon: Folder, labelKey: 'context.tabs.files' },
  { id: 'changes', icon: FileDiff, labelKey: 'context.tabs.changes' },
];

/** Segmented tab bar for the workspace panel (Artifacts / Files / Changes). */
export function PanelTabs({ active, onChange }: PanelTabsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border-muted shrink-0">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-caption font-medium transition-colors ${
              isActive
                ? 'bg-surface-active text-text-primary'
                : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{t(tab.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
