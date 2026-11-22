import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { BotSettings } from '../shared/types.ts';

interface WelcomeCaptchaPanelProps {
  settings: BotSettings;
  onSave: (next: BotSettings) => Promise<void>;
}

export const WelcomeCaptchaPanel: React.FC<WelcomeCaptchaPanelProps> = ({ settings, onSave }) => {
  const [draft, setDraft] = useState<BotSettings>(settings);
  const [btnText, setBtnText] = useState('');
  const [btnUrl, setBtnUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const addButton = () => {
    const t = btnText.trim();
    const u = btnUrl.trim();
    if (!t || (!u.startsWith('https://') && !u.startsWith('http://'))) return;
    setDraft({ ...draft, welcomeButtons: [...draft.welcomeButtons, { text: t, url: u }] });
    setBtnText('');
    setBtnUrl('');
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Bienvenida, Captcha y Acceso Privado</h2>
          <p className="text-sm text-slate-500">
            Configura cómo aprueba solicitudes el bot (`chat_join_request`) y verifica a nuevos miembros.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Access & Captcha */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Control de Acceso y Verificación</h3>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nombre visible del grupo privado
            </label>
            <input
              type="text"
              value={draft.groupName}
              onChange={(e) => setDraft({ ...draft, groupName: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Solicitudes de ingreso (PV)
              </label>
              <select
                value={draft.approveJoinRequests}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    approveJoinRequests: e.target.value as BotSettings['approveJoinRequests'],
                  })
                }
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white"
              >
                <option value="auto_captcha">Aprobar + Exigir Captcha</option>
                <option value="manual">Aprobación manual de Admin</option>
                <option value="auto_all">Aprobar directo sin Captcha</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Modo de Captcha</label>
              <select
                value={draft.captchaMode}
                onChange={(e) =>
                  setDraft({ ...draft, captchaMode: e.target.value as BotSettings['captchaMode'] })
                }
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white"
              >
                <option value="math">Reto matemático (3 botones)</option>
                <option value="button">Botón único "Soy humano"</option>
                <option value="off">Desactivado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tiempo límite Captcha (segundos)
              </label>
              <input
                type="number"
                min={15}
                max={600}
                value={draft.captchaTimeoutSec}
                onChange={(e) =>
                  setDraft({ ...draft, captchaTimeoutSec: Number(e.target.value) || 120 })
                }
                className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 pt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.cleanServiceMessages}
                onChange={(e) => setDraft({ ...draft, cleanServiceMessages: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-sky-600"
              />
              Eliminar avisos de "se unió / salió del grupo"
            </label>
          </div>
        </section>

        {/* Rules & Scheduled Announcements */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Normas (/rules) y Anuncio Periódico</h3>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Texto de normas del grupo
            </label>
            <textarea
              rows={4}
              value={draft.rulesText}
              onChange={(e) => setDraft({ ...draft, rulesText: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.scheduledAnnouncementEnabled}
                  onChange={(e) =>
                    setDraft({ ...draft, scheduledAnnouncementEnabled: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-300 text-sky-600"
                />
                Publicar recordatorio automático en el grupo
              </label>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Cada (min):</span>
                <input
                  type="number"
                  min={15}
                  max={1440}
                  value={draft.scheduledAnnouncementIntervalMin}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      scheduledAnnouncementIntervalMin: Number(e.target.value) || 180,
                    })
                  }
                  className="w-20 font-mono tabular-nums border border-slate-200 rounded-md px-2 py-1"
                />
              </div>
            </div>

            <textarea
              rows={2}
              value={draft.scheduledAnnouncementText}
              onChange={(e) => setDraft({ ...draft, scheduledAnnouncementText: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2"
            />
          </div>
        </section>
      </div>

      {/* Welcome Message & Inline Buttons */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Mensaje de Bienvenida y Botones Inline</h3>
            <p className="text-xs text-slate-500">
              Variables disponibles: <span className="font-mono">{'{nombre}'}</span> ·{' '}
              <span className="font-mono">{'{usuario}'}</span> ·{' '}
              <span className="font-mono">{'{grupo}'}</span>
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.welcomeEnabled}
              onChange={(e) => setDraft({ ...draft, welcomeEnabled: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-sky-600"
            />
            Enviar bienvenida
          </label>
        </div>

        <textarea
          rows={3}
          value={draft.welcomeMessage}
          onChange={(e) => setDraft({ ...draft, welcomeMessage: e.target.value })}
          className="w-full text-sm border border-slate-200 rounded-md px-3 py-2"
        />

        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="text-xs font-medium text-slate-700">Botones de enlace adjuntos</div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <input
              type="text"
              value={btnText}
              onChange={(e) => setBtnText(e.target.value)}
              placeholder="Texto del botón (ej. Normas)"
              className="sm:col-span-2 text-xs border border-slate-200 rounded-md px-3 py-1.5"
            />
            <input
              type="url"
              value={btnUrl}
              onChange={(e) => setBtnUrl(e.target.value)}
              placeholder="https://t.me/..."
              className="sm:col-span-2 text-xs font-mono border border-slate-200 rounded-md px-3 py-1.5"
            />
            <button
              type="button"
              onClick={addButton}
              className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
            >
              <Plus className="w-3.5 h-3.5" />
              Añadir botón
            </button>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
            {draft.welcomeButtons.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500">Sin botones configurados.</div>
            ) : (
              draft.welcomeButtons.map((b, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="font-medium text-slate-900">{b.text}</span>
                    <span className="text-slate-400" aria-hidden="true">·</span>
                    <span className="font-mono text-slate-500 truncate">{b.url}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        welcomeButtons: draft.welcomeButtons.filter((_, i) => i !== idx),
                      })
                    }
                    className="text-slate-400 hover:text-rose-600 shrink-0"
                    aria-label={`Eliminar botón ${b.text}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </form>
  );
};
