import React, { useEffect, useState } from 'react';
import { Plus, Save, X } from 'lucide-react';
import type { AutomodConfig, ContentLocks } from '../shared/types.ts';

interface AutomodPanelProps {
  automod: AutomodConfig;
  onSave: (next: AutomodConfig) => Promise<void>;
}

const LOCK_LABELS: { key: keyof ContentLocks; label: string; hint: string }[] = [
  { key: 'stickers', label: 'Stickers', hint: 'Impide enviar paquetes de stickers' },
  { key: 'gifs', label: 'GIFs y animaciones', hint: 'Bloquea animaciones MP4/GIF' },
  { key: 'media', label: 'Fotos y videos', hint: 'Restringe archivos multimedia' },
  { key: 'documents', label: 'Documentos', hint: 'Bloquea PDFs, ZIP y ejecutables' },
  { key: 'voice', label: 'Notas de voz y audio', hint: 'Bloquea mensajes de voz' },
  { key: 'all', label: 'Modo silencio total', hint: 'Solo administradores pueden escribir' },
];

export const AutomodPanel: React.FC<AutomodPanelProps> = ({ automod, onSave }) => {
  const [draft, setDraft] = useState<AutomodConfig>(automod);
  const [newDomain, setNewDomain] = useState('');
  const [newWord, setNewWord] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(automod);
  }, [automod]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const addDomain = () => {
    const clean = newDomain.trim().toLowerCase().replace(/^https?:\/\//, '');
    if (!clean || draft.allowedDomains.includes(clean)) return;
    setDraft({ ...draft, allowedDomains: [...draft.allowedDomains, clean] });
    setNewDomain('');
  };

  const addBadWord = () => {
    const clean = newWord.trim().toLowerCase();
    if (!clean || draft.badWords.includes(clean)) return;
    setDraft({ ...draft, badWords: [...draft.badWords, clean] });
    setNewWord('');
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Auto-Moderación y Sanciones</h2>
          <p className="text-sm text-slate-500">
            Reglas automáticas ejecutadas antes de que el spam afecte a tu grupo privado.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar reglas'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Anti-Flood */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Control Anti-Flood</h3>
              <p className="text-xs text-slate-500">Frena ráfagas de mensajes consecutivos.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.antiFloodEnabled}
                onChange={(e) => setDraft({ ...draft, antiFloodEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Activo
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Máx. mensajes</label>
              <input
                type="number"
                min={2}
                max={30}
                value={draft.floodMaxMessages}
                onChange={(e) =>
                  setDraft({ ...draft, floodMaxMessages: Number(e.target.value) || 5 })
                }
                className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ventana (seg)</label>
              <input
                type="number"
                min={2}
                max={60}
                value={draft.floodWindowSec}
                onChange={(e) =>
                  setDraft({ ...draft, floodWindowSec: Number(e.target.value) || 8 })
                }
                className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Sanción</label>
              <select
                value={draft.floodAction}
                onChange={(e) =>
                  setDraft({ ...draft, floodAction: e.target.value as AutomodConfig['floodAction'] })
                }
                className="w-full text-sm border border-slate-200 rounded-md px-2.5 py-1.5 bg-white"
              >
                <option value="mute">Silenciar</option>
                <option value="warn">Advertir</option>
                <option value="kick">Expulsar</option>
              </select>
            </div>
          </div>
        </section>

        {/* Warns Threshold */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Sistema de Advertencias (Warns)</h3>
            <p className="text-xs text-slate-500">
              Define cuántos avisos tolera el bot antes de aplicar una sanción automática.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Límite de warns</label>
              <input
                type="number"
                min={1}
                max={10}
                value={draft.maxWarns}
                onChange={(e) => setDraft({ ...draft, maxWarns: Number(e.target.value) || 3 })}
                className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Al alcanzar límite</label>
              <select
                value={draft.maxWarnAction}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    maxWarnAction: e.target.value as AutomodConfig['maxWarnAction'],
                  })
                }
                className="w-full text-sm border border-slate-200 rounded-md px-2.5 py-1.5 bg-white"
              >
                <option value="mute">Silenciar</option>
                <option value="kick">Expulsar</option>
                <option value="ban">Banear</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Duración mute (min)</label>
              <input
                type="number"
                min={1}
                max={10080}
                value={draft.muteDurationMin}
                onChange={(e) =>
                  setDraft({ ...draft, muteDurationMin: Number(e.target.value) || 30 })
                }
                className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
              />
            </div>
          </div>
        </section>

        {/* Anti-Links & Forwards */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Anti-Links y Reenvíos</h3>
              <p className="text-xs text-slate-500">
                Protege el grupo privado de invitaciones a otros canales y URLs externas.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.antiLinksEnabled}
                onChange={(e) => setDraft({ ...draft, antiLinksEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              Activo
            </label>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-100 text-xs">
            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.blockTelegramLinks}
                onChange={(e) => setDraft({ ...draft, blockTelegramLinks: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-sky-600"
              />
              Bloquear enlaces t.me / telegram.me aunque existan dominios permitidos
            </label>
            <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.blockForwards}
                onChange={(e) => setDraft({ ...draft, blockForwards: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-sky-600"
              />
              Bloquear mensajes reenviados desde canales o bots externos
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <label className="text-xs font-medium text-slate-700">Acción al detectar enlace</label>
            <select
              value={draft.linksAction}
              onChange={(e) =>
                setDraft({ ...draft, linksAction: e.target.value as AutomodConfig['linksAction'] })
              }
              className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white"
            >
              <option value="delete">Solo eliminar</option>
              <option value="warn">Eliminar + Advertir</option>
              <option value="mute">Eliminar + Silenciar</option>
            </select>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="text-xs font-medium text-slate-700">Dominios permitidos (Lista blanca)</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDomain();
                  }
                }}
                placeholder="ej. youtube.com"
                className="flex-1 text-xs font-mono border border-slate-200 rounded-md px-3 py-1.5"
              />
              <button
                type="button"
                onClick={addDomain}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                <Plus className="w-3.5 h-3.5" />
                Añadir
              </button>
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
              {draft.allowedDomains.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">Sin dominios en lista blanca.</div>
              ) : (
                draft.allowedDomains.map((dom) => (
                  <div key={dom} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="font-mono text-slate-700">{dom}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          allowedDomains: draft.allowedDomains.filter((d) => d !== dom),
                        })
                      }
                      className="text-slate-400 hover:text-rose-600"
                      aria-label={`Eliminar dominio ${dom}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Bad Words Filter */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Filtro de Palabras Prohibidas</h3>
              <p className="text-xs text-slate-500">
                Detecta términos de estafa, insultos o spam dentro del texto.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.badWordsEnabled}
                onChange={(e) => setDraft({ ...draft, badWordsEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-sky-600"
              />
              Activo
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <label className="text-xs font-medium text-slate-700">Acción automática</label>
            <select
              value={draft.badWordsAction}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  badWordsAction: e.target.value as AutomodConfig['badWordsAction'],
                })
              }
              className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white"
            >
              <option value="delete">Solo eliminar</option>
              <option value="warn">Eliminar + Advertir</option>
              <option value="mute">Eliminar + Silenciar</option>
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addBadWord();
                  }
                }}
                placeholder="Añadir término prohibido..."
                className="flex-1 text-xs font-mono border border-slate-200 rounded-md px-3 py-1.5"
              />
              <button
                type="button"
                onClick={addBadWord}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              >
                <Plus className="w-3.5 h-3.5" />
                Añadir
              </button>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-md max-h-48 overflow-y-auto">
              {draft.badWords.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">No hay términos configurados.</div>
              ) : (
                draft.badWords.map((word) => (
                  <div key={word} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="font-mono text-slate-700">{word}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          badWords: draft.badWords.filter((w) => w !== word),
                        })
                      }
                      className="text-slate-400 hover:text-rose-600"
                      aria-label={`Eliminar palabra ${word}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Content Locks */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Bloqueos de Contenido (Locks)</h3>
          <p className="text-xs text-slate-500">
            También puedes alternarlos en vivo desde Telegram usando `/lock stickers` o `/unlock all`.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {LOCK_LABELS.map((item) => {
            const active = draft.locks[item.key];
            return (
              <label
                key={item.key}
                className={`flex items-start justify-between gap-3 p-3.5 rounded-md border cursor-pointer transition-colors ${
                  active ? 'bg-amber-50/50 border-amber-300' : 'bg-slate-50/50 border-slate-200'
                }`}
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900">{item.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{item.hint}</div>
                </div>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      locks: { ...draft.locks, [item.key]: e.target.checked },
                    })
                  }
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-sky-600"
                />
              </label>
            );
          })}
        </div>
      </section>
    </form>
  );
};
