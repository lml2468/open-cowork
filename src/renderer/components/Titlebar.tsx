import { Minus, Square, X, Copy, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveSessionTitle } from '../store/selectors';

const isMac = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';

export function Titlebar() {
  const { t } = useTranslation();
  const [isMaximized, setIsMaximized] = useState(false);
  const activeSessionTitle = useActiveSessionTitle();

  const handleMinimize = () => {
    window.electronAPI?.window.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.window.maximize();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    window.electronAPI?.window.close();
  };

  return (
    <div
      className={`h-10 bg-background-secondary border-b border-border flex items-center justify-between gap-3 titlebar-drag shrink-0 pr-1 ${
        isMac ? 'pl-20' : 'pl-3'
      }`}
    >
      {/* macOS: Traffic lights are positioned by trafficLightPosition, we just need left padding */}

      {/* Breadcrumb: brand + active-session title. Reclaims the dead drag bar. */}
      <div className="flex items-center gap-1.5 min-w-0 select-none">
        <span className="text-caption font-medium uppercase tracking-wide text-text-muted">
          {t('window.brand')}
        </span>
        {activeSessionTitle && (
          <>
            <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
            <span className="text-body-sm font-medium text-text-secondary truncate">
              {activeSessionTitle}
            </span>
          </>
        )}
      </div>

      {/* Window Controls (for Windows/Linux - macOS uses native traffic lights) */}
      {!isMac && (
        <div className="flex items-center titlebar-no-drag h-full">
          <button
            onClick={handleMinimize}
            className="w-12 h-full flex items-center justify-center hover:bg-surface transition-colors"
            title={t('window.minimize')}
          >
            <Minus className="w-4 h-4 text-text-secondary" />
          </button>
          <button
            onClick={handleMaximize}
            className="w-12 h-full flex items-center justify-center hover:bg-surface transition-colors"
            title={isMaximized ? t('window.restore') : t('window.maximize')}
          >
            {isMaximized ? (
              <Copy className="w-3.5 h-3.5 text-text-secondary" />
            ) : (
              <Square className="w-3.5 h-3.5 text-text-secondary" />
            )}
          </button>
          <button
            onClick={handleClose}
            className="w-12 h-full flex items-center justify-center hover:bg-error transition-colors group"
            title={t('window.close')}
          >
            <X className="w-4 h-4 text-text-secondary group-hover:text-white" />
          </button>
        </div>
      )}
    </div>
  );
}
