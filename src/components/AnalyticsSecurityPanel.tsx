import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Save,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import type {
  AnalyticsBucket,
  BotStats,
  MemberRecord,
  SecurityConfig,
} from '../shared/types.ts';

interface AnalyticsSecurityPanelProps {
  security: SecurityConfig;
  analytics: AnalyticsBucket[];
  stats: BotStats;
  members: MemberRecord[];
  currencyName: string;
  onSaveSecurity: (next: SecurityConfig) => Promise<void>;
  onDownloadBackup: () => void;
  onRestoreBackup: (jsonText: string) => Promise<void>;
}

export const AnalyticsSecurityPanel: React.FC<AnalyticsSecurityPanelProps> = ({
  security,
  analytics,
  stats,
  members,
  currencyName,
  onSaveSecurity,
  onDownloadBackup,
  onRestoreBackup,
}) => {
  const [draft, setDraft] = useState<SecurityConfig>(security);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(security);
  }, [security]);

  const maxMessages = Math.max(
    10,
    ...analytics.map((b) => Math.max(b.messages, b.blocked + b.warnings, b.gamesPlayed))
  );

  const topMembers = [...members].sort((a, b) => b.xp - a.xp).slice(0, 5);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveSecurity(draft);
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    try {
      const text = await file.text();
      await onRestoreBackup(text);
    } finally {
      setRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Analytics Chart + Top Ranking */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-8 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Actividad del Grupo por Franja</h2>
              <p className="text-xs text-slate-500">
                Comparativa entre mensajes válidos, bloqueos de AutoMod y partidas de entretenimiento.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-600 inline-block" />
                Mensajes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600 inline-block" />
                Juegos
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-600 inline-block" />
                Bloqueos / Warns
              </span>
            </div>
          </div>

          <div className="pt-2">
            <div className="grid grid-cols-8 gap-2 sm:gap-3 items-end h-48 border-b border-slate-200 pb-2">
              {analytics.slice(-8).map((bucket, idx) => {
                const msgH = Math.round((bucket.messages / maxMessages) * 100);
                const gameH = Math.round((bucket.gamesPlayed / maxMessages) * 100);
                const modH = Math.round(((bucket.blocked + bucket.warnings) / maxMessages) * 100);
                return (
                  <div key={`${bucket.label}-${idx}`} className="flex flex-col items-center gap-1.5 h-full justify-end">
                    <div className="w-full flex items-end justify-center gap-1 h-40">
                      <div
                        title={`${bucket.messages} mensajes`}
                        style={{ height: `${Math.max(4, msgH)}%` }}
                        className="w-2.5 sm:w-3 bg-sky-600 rounded-t transition-all"
                      />
                      <div
                        title={`${bucket.gamesPlayed} juegos`}
                        style={{ height: `${Math.max(4, gameH)}%` }}
                        className="w-2.5 sm:w-3 bg-emerald-600 rounded-t transition-all"
                      />
                      <div
                        title={`${bucket.blocked + bucket.warnings} bloqueos/warns`}
                        style={{ height: `${Math.max(4, modH)}%` }}
                        className="w-2.5 sm:w-3 bg-rose-600 rounded-t transition-all"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-8 gap-2 sm:gap-3 pt-2 text-center">
              {analytics.slice(-8).map((bucket, idx) => (
                <div key={`lbl-${bucket.label}-${idx}`} className="text-[11px] font-mono tabular-nums text-slate-500">
                  {bucket.label}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-100 text-xs">
            <div>
              <span className="text-slate-500">Total mensajes</span>
              <div className="text-base font-semibold font-mono tabular-nums text-slate-900">
                {stats.totalMessagesProcessed}
              </div>
            </div>
            <div>
              <span className="text-slate-500">Partidas jugadas</span>
              <div className="text-base font-semibold font-mono tabular-nums text-slate-900">
                {stats.totalGamesPlayed}
              </div>
            </div>
            <div>
              <span className="text-slate-500">Raids frenados</span>
              <div className="text-base font-semibold font-mono tabular-nums text-slate-900">
                {stats.raidsBlocked}
              </div>
            </div>
          </div>
        </section>

        {/* Top XP & Economy Leaderboard */}
        <section className="xl:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Líderes del Grupo Privado</h3>
            <p className="text-xs text-slate-500">Ranking actualizado por XP, saldo y reputación.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {topMembers.map((m, i) => (
              <div key={m.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">
                    {i + 1}. {m.name}
                  </div>
                  <div className="font-mono text-slate-500 truncate">
                    @{m.username} · +{m.reputation} rep
                  </div>
                </div>
                <div className="text-right shrink-0 font-mono tabular-nums">
                  <div className="font-semibold text-slate-900">Nv.{m.level} ({m.xp} XP)</div>
                  <div className="text-slate-500">{m.coins} {currencyName}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Anti-Raid & Slow Mode Configuration */}
      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Protección Anti-Raid y Modo Lento</h3>
            <p className="text-xs text-slate-500">
              Detecta avalanchas de cuentas nuevas y activa un bloqueo de emergencia automáticamente.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-md whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Guardando...' : 'Guardar seguridad'}
          </button>
        </div>

        {draft.raidModeActive && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-md flex flex-wrap items-center justify-between gap-3 text-xs text-rose-800">
            <div className="flex items-center gap-2 font-medium">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              Modo Emergencia Anti-Raid ACTIVO: las nuevas solicitudes están retenidas para revisión manual.
            </div>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, raidModeActive: false })}
              className="px-3 py-1.5 font-medium bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 rounded"
            >
              Desactivar emergencia (recuerda guardar)
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-md cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-slate-900">Detección Anti-Raid</div>
              <div className="text-xs text-slate-500">Activa emergencia por ráfaga</div>
            </div>
            <input
              type="checkbox"
              checked={draft.antiRaidEnabled}
              onChange={(e) => setDraft({ ...draft, antiRaidEnabled: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-sky-600"
            />
          </label>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Umbral de ingresos
            </label>
            <input
              type="number"
              min={2}
              max={50}
              value={draft.raidJoinThreshold}
              onChange={(e) => setDraft({ ...draft, raidJoinThreshold: Number(e.target.value) || 5 })}
              className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Ventana Anti-Raid (seg)
            </label>
            <input
              type="number"
              min={5}
              max={120}
              value={draft.raidWindowSec}
              onChange={(e) => setDraft({ ...draft, raidWindowSec: Number(e.target.value) || 20 })}
              className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Acción de emergencia
            </label>
            <select
              value={draft.raidAction}
              onChange={(e) =>
                setDraft({ ...draft, raidAction: e.target.value as SecurityConfig['raidAction'] })
              }
              className="w-full text-sm border border-slate-200 rounded-md px-2.5 py-1.5 bg-white"
            >
              <option value="manual_approval">Retener solicitudes (manual)</option>
              <option value="lock_all">Retener + Silenciar chat total</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Modo lento global (segundos entre mensajes)
            </label>
            <input
              type="number"
              min={0}
              max={300}
              value={draft.slowModeSec}
              onChange={(e) => setDraft({ ...draft, slowModeSec: Number(e.target.value) || 0 })}
              className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-md px-3 py-1.5"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 pt-5 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.alertOnRaid}
              onChange={(e) => setDraft({ ...draft, alertOnRaid: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-sky-600"
            />
            Enviar aviso al grupo cuando se dispare Anti-Raid
          </label>

          <label className="flex items-center gap-2 text-xs text-rose-700 font-medium pt-5 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.raidModeActive}
              onChange={(e) => setDraft({ ...draft, raidModeActive: e.target.checked })}
              className="w-4 h-4 rounded border-rose-300 text-rose-600"
            />
            Activar modo emergencia manualmente
          </label>
        </div>
      </form>

      {/* Backups Export & Restore */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <h3 className="text-sm font-semibold text-slate-900">Copia de Seguridad y Restauración (bot-db.json)</h3>
          <p className="text-xs text-slate-500 mt-1">
            Exporta un respaldo completo de miembros, XP, monedas, normas, tienda y comandos personalizados antes de migrar o reiniciar tu contenedor en Altare.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onDownloadBackup}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar Backup (.json)
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={restoring}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            {restoring ? 'Restaurando...' : 'Restaurar desde .json'}
          </button>
        </div>
      </section>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <AlertTriangle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>
          Al restaurar un archivo de respaldo, todas las reglas y saldos se validan en el servidor antes de sobrescribir la base local.
        </span>
      </div>
    </div>
  );
};
