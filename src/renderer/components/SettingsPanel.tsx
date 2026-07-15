import { useState, useEffect } from 'react';
import {
  X,
  Settings,
  ShieldCheck,
  Wifi,
  AlertCircle,
  Globe,
  ChevronRight,
  BrainCircuit,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWindowSize } from '../hooks/useWindowSize';
import { RemoteControlPanel } from './RemoteControlPanel';
import { useAppStore } from '../store';
import { SettingsAPI } from './settings/SettingsAPI';
import { SettingsSecurity } from './settings/SettingsSecurity';
import { SettingsGeneral } from './settings/SettingsGeneral';
import { SettingsLogs } from './settings/SettingsLogs';
import { SettingsMemory } from './settings/SettingsMemory';

interface SettingsPanelProps {
  onClose: () => void;
  initialTab?: 'api' | 'security' | 'memory' | 'remote' | 'logs' | 'general';
}

type TabId = 'api' | 'security' | 'memory' | 'remote' | 'logs' | 'general';

const VALID_TABS = new Set<TabId>(['api', 'security', 'memory', 'remote', 'logs', 'general']);

/** Map external / legacy tab ids (e.g. the old `sandbox` tab) onto current ids. */
function normalizeTabId(raw: string | null | undefined): TabId | null {
  if (!raw) return null;
  if (raw === 'sandbox') return 'security';
  return VALID_TABS.has(raw as TabId) ? (raw as TabId) : null;
}

export function SettingsPanel({ onClose, initialTab = 'api' }: SettingsPanelProps) {
  const { t } = useTranslation();
  const { width } = useWindowSize();
  const compactSidebar = width < 900;
  // Read settingsTab from store at mount time so external navigation (nav-server)
  // takes effect even before this component mounts.
  const storeTab = useAppStore((s) => s.settingsTab);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const resolvedInitial = normalizeTabId(storeTab) ?? initialTab;

  const [activeTab, setActiveTab] = useState<TabId>(resolvedInitial);
  // Track which tabs have been viewed at least once (for lazy loading)
  const [viewedTabs, setViewedTabs] = useState<Set<TabId>>(new Set([resolvedInitial]));
  const [appVersion, setAppVersion] = useState('');
  useEffect(() => {
    try {
      const v = window.electronAPI?.getVersion?.();
      if (v instanceof Promise) v.then(setAppVersion);
      else if (v) setAppVersion(v);
    } catch {
      /* ignore */
    }
  }, []);

  // Consume the store signal and apply tab in one effect
  useEffect(() => {
    const normalized = normalizeTabId(storeTab);
    if (normalized) {
      setActiveTab(normalized);
      setSettingsTab(null);
    }
  }, [storeTab, setSettingsTab]);

  // Mark tab as viewed when it becomes active
  useEffect(() => {
    if (!viewedTabs.has(activeTab)) {
      setViewedTabs((prev) => new Set([...prev, activeTab]));
    }
  }, [activeTab]);

  const tabs = [
    {
      id: 'api' as TabId,
      label: t('settings.apiSettings'),
      icon: Settings,
      description: t('settings.apiSettingsDesc'),
    },
    {
      id: 'security' as TabId,
      label: t('security.tabTitle'),
      icon: ShieldCheck,
      description: t('security.tabDesc'),
    },
    {
      id: 'memory' as TabId,
      label: t('settings.memory'),
      icon: BrainCircuit,
      description: t('settings.memoryDesc'),
    },
    {
      id: 'remote' as TabId,
      label: t('settings.remote', '远程控制'),
      icon: Wifi,
      description: t('settings.remoteDesc', '通过飞书等平台远程使用'),
    },
    {
      id: 'logs' as TabId,
      label: t('settings.logs'),
      icon: AlertCircle,
      description: t('settings.logsDesc'),
    },
    {
      id: 'general' as TabId,
      label: t('settings.general'),
      icon: Globe,
      description: t('settings.generalDesc'),
    },
  ];
  const activeTabMeta = tabs.find((tab) => tab.id === activeTab);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <div
        className={`${compactSidebar ? 'w-14' : 'w-52 lg:w-60'} bg-background-secondary/88 border-r border-border-muted flex flex-col flex-shrink-0`}
      >
        {!compactSidebar && (
          <div className="px-4 pt-5 pb-4 border-b border-border-muted">
            <p className="text-label uppercase text-text-muted">{t('settings.title')}</p>
            <h2 className="mt-1 text-heading font-semibold text-text-primary">Open Cowork</h2>
            <p className="mt-1 text-caption text-text-muted">{t('settings.panelDesc')}</p>
          </div>
        )}
        <div className={`flex-1 ${compactSidebar ? 'p-1.5 space-y-1' : 'p-3 space-y-1.5'}`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={compactSidebar ? tab.label : undefined}
              className={`w-full flex items-center ${compactSidebar ? 'justify-center p-2.5' : 'gap-3 px-3.5 py-3'} rounded-lg text-left transition-colors active:scale-[0.98] border-l-2 border-transparent ${
                activeTab === tab.id
                  ? 'bg-accent/10 text-text-primary font-medium border-accent'
                  : 'hover:bg-surface-hover text-text-secondary hover:text-text-primary'
              }`}
            >
              <tab.icon className="w-4.5 h-4.5 flex-shrink-0" />
              {!compactSidebar && (
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-medium truncate">{tab.label}</p>
                  <p className="text-caption text-text-muted line-clamp-2 mt-0.5">
                    {tab.description}
                  </p>
                </div>
              )}
              {!compactSidebar && activeTab === tab.id && (
                <ChevronRight className="w-4 h-4 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
        <div className={`${compactSidebar ? 'p-1.5' : 'p-4'} border-t border-border-muted`}>
          <button
            onClick={onClose}
            className={`w-full py-2 ${compactSidebar ? 'px-2' : 'px-4'} rounded-lg bg-background hover:bg-background transition-colors text-text-secondary text-body-sm`}
            title={compactSidebar ? t('common.close') : undefined}
          >
            {compactSidebar ? <X className="w-4 h-4 mx-auto" /> : t('common.close')}
          </button>
          {!compactSidebar && (
            <p className="text-caption text-text-muted text-center mt-2 select-text">
              v{appVersion}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex items-center justify-between gutter-x py-4 border-b border-border-muted flex-shrink-0 bg-background/88 backdrop-blur-sm">
          <div>
            <p className="text-label uppercase text-text-muted">{t('settings.title')}</p>
            <h3 className="mt-1 text-title font-semibold text-text-primary">
              {activeTabMeta?.label}
            </h3>
            {activeTabMeta?.description && (
              <p className="mt-1 text-body-sm text-text-muted max-w-[36rem]">
                {activeTabMeta.description}
              </p>
            )}
          </div>
          <button onClick={onClose} className="icon-btn p-2">
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden gutter-x py-6 lg:py-8">
          <div className="max-w-content-narrow w-full min-w-0 mx-auto">
            <div className={activeTab === 'api' ? '' : 'hidden'}>
              {viewedTabs.has('api') && (
                <>
                  <SettingsAPI />
                </>
              )}
            </div>
            <div className={activeTab === 'security' ? '' : 'hidden'}>
              {viewedTabs.has('security') && <SettingsSecurity />}
            </div>
            <div className={activeTab === 'memory' ? '' : 'hidden'}>
              {viewedTabs.has('memory') && <SettingsMemory />}
            </div>
            <div className={activeTab === 'remote' ? '' : 'hidden'}>
              {viewedTabs.has('remote') && <RemoteControlPanel isActive={activeTab === 'remote'} />}
            </div>
            <div className={activeTab === 'logs' ? '' : 'hidden'}>
              {viewedTabs.has('logs') && <SettingsLogs isActive={activeTab === 'logs'} />}
            </div>
            <div className={activeTab === 'general' ? '' : 'hidden'}>
              {viewedTabs.has('general') && <SettingsGeneral />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
