import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Trash2, FolderOpen, GraduationCap, Lock } from 'lucide-react';
import { usePersonas } from '../store/selectors';
import { useAppStore } from '../store';
import type { Persona, PersonaSaveInput } from '../types';

const EMPTY_DRAFT: PersonaSaveInput = { name: '', systemPrompt: '' };

function toDraft(p: Persona): PersonaSaveInput {
  return {
    id: p.id,
    name: p.name,
    icon: p.icon,
    description: p.description,
    scenarios: p.scenarios,
    recommendedSkills: p.recommendedSkills,
    recommendedConnectors: p.recommendedConnectors,
    model: p.model,
    systemPrompt: p.systemPrompt,
  };
}

const csv = (arr?: string[]) => (arr ?? []).join(', ');
const parseCsv = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Persona (expert) manager: list builtin (read-only) + user personas, create/edit/delete user
 * ones (name/icon/description/system prompt/scenarios/recommended skills), and open the personas
 * folder. Uses the personas.* IPC; refreshes the store on change. Opened from the composer
 * PersonaSelector's "manage" entry (store flag showPersonaManager).
 */
export function PersonaManagerModal() {
  const { t } = useTranslation();
  const personas = usePersonas();
  const loadPersonas = useAppStore((s) => s.loadPersonas);
  const setShowPersonaManager = useAppStore((s) => s.setShowPersonaManager);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonaSaveInput>(EMPTY_DRAFT);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => personas.find((p) => p.id === selectedId) ?? null,
    [personas, selectedId]
  );
  const readOnly = !isNew && !!selected?.builtin;

  useEffect(() => {
    if (isNew) return;
    if (selected) setDraft(toDraft(selected));
  }, [selected, isNew]);

  const startNew = () => {
    setIsNew(true);
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
  };

  const pick = (id: string) => {
    setIsNew(false);
    setSelectedId(id);
    setError(null);
  };

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.systemPrompt.trim()) {
      setError(t('persona.manager.namePromptRequired'));
      return;
    }
    if (!window.electronAPI) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await window.electronAPI.personas.save(draft);
      await loadPersonas();
      setIsNew(false);
      setSelectedId(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || selected.builtin || !window.electronAPI) return;
    if (!window.confirm(t('persona.manager.deleteConfirm', { name: selected.name }))) return;
    setBusy(true);
    try {
      await window.electronAPI.personas.delete(selected.id);
      await loadPersonas();
      setSelectedId(null);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={() => setShowPersonaManager(false)}>
      <div
        className="flex h-[80vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-background shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* List */}
        <div className="flex w-64 flex-col border-r border-border-muted">
          <div className="flex items-center justify-between gutter-x py-4 border-b border-border-muted">
            <span className="text-title text-text-primary">{t('persona.manager.title')}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {personas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p.id)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  !isNew && selectedId === p.id ? 'bg-accent/10' : 'hover:bg-surface-hover'
                }`}
              >
                <GraduationCap className="w-4 h-4 flex-shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">
                  {p.name}
                </span>
                {p.builtin && <Lock className="w-3 h-3 flex-shrink-0 text-text-muted" />}
              </button>
            ))}
          </div>
          <div className="flex gap-2 border-t border-border-muted p-2">
            <button
              type="button"
              onClick={startNew}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-body-sm text-accent hover:bg-surface-hover transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('persona.manager.new')}
            </button>
            <button
              type="button"
              onClick={() => window.electronAPI?.personas.openDir()}
              title={t('persona.manager.openDir')}
              className="icon-btn"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gutter-x py-4 border-b border-border-muted">
            <span className="text-body-sm text-text-muted">
              {isNew
                ? t('persona.manager.newExpert')
                : selected
                  ? readOnly
                    ? t('persona.manager.viewingBuiltin')
                    : t('persona.manager.editing')
                  : t('persona.manager.selectHint')}
            </span>
            <button type="button" onClick={() => setShowPersonaManager(false)} className="icon-btn">
              <X className="w-4 h-4" />
            </button>
          </div>

          {isNew || selected ? (
            <div className="flex-1 space-y-4 overflow-y-auto gutter-x py-5">
              <Field label={t('persona.manager.name')}>
                <input
                  className="input"
                  value={draft.name}
                  disabled={readOnly}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label={t('persona.manager.icon')}>
                <input
                  className="input"
                  placeholder="code / pen-line / wrench …"
                  value={draft.icon ?? ''}
                  disabled={readOnly}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                />
              </Field>
              <Field label={t('persona.manager.description')}>
                <input
                  className="input"
                  value={draft.description ?? ''}
                  disabled={readOnly}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </Field>
              <Field label={t('persona.manager.systemPrompt')}>
                <textarea
                  className="input min-h-40 resize-y font-mono text-body-sm"
                  value={draft.systemPrompt}
                  disabled={readOnly}
                  onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                />
              </Field>
              <Field label={t('persona.manager.scenarios')}>
                <input
                  className="input"
                  placeholder="daily, coding, design"
                  value={csv(draft.scenarios)}
                  disabled={readOnly}
                  onChange={(e) => setDraft({ ...draft, scenarios: parseCsv(e.target.value) })}
                />
              </Field>
              <Field label={t('persona.manager.recommendedSkills')}>
                <input
                  className="input"
                  placeholder="check, dev-prep"
                  value={csv(draft.recommendedSkills)}
                  disabled={readOnly}
                  onChange={(e) =>
                    setDraft({ ...draft, recommendedSkills: parseCsv(e.target.value) })
                  }
                />
              </Field>

              {error && <p className="text-body-sm text-red-500">{error}</p>}

              {!readOnly && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={busy}
                    className="btn-primary"
                  >
                    {t('common.save')}
                  </button>
                  {selected && !selected.builtin && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={busy}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-body-sm text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('common.delete')}
                    </button>
                  )}
                </div>
              )}
              {readOnly && (
                <p className="text-caption text-text-muted">{t('persona.manager.builtinHint')}</p>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-body-sm text-text-muted">
              {t('persona.manager.selectHint')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-label uppercase text-text-muted">{label}</span>
      {children}
    </label>
  );
}
