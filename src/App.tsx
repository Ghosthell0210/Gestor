import React, { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Download,
  Menu,
  MessageSquareCode,
  Shield,
  TerminalSquare,
  Users,
  UserCheck,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type {
  AutomodConfig,
  BotSettings,
  BotStateSnapshot,
  CustomCommand,
  MessageContentType,
} from './shared/types.ts';
import { OverviewSimulator } from './components/OverviewSimulator.tsx';
import { AutomodPanel } from './components/AutomodPanel.tsx';
import { WelcomeCaptchaPanel } from './components/WelcomeCaptchaPanel.tsx';
import { MembersAuditPanel } from './components/MembersAuditPanel.tsx';
import { CommandsAltarePanel } from './components/CommandsAltarePanel.tsx';

type NavTab = 'overview' | 'automod' | 'welcome' | 'members' | 'altare';

const NAV_ITEMS: {
  id: NavTab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'overview', label: 'Resumen y Simulador', Icon: MessageSquareCode },
  { id: 'automod', label: 'Auto-Moderación', Icon: Shield },
  { id: 'welcome', label: 'Bienvenida y Captcha', Icon: UserCheck },
  { id: 'members', label: 'Miembros y Registro', Icon: Users },
  { id: 'altare', label: 'Comandos y Altare', Icon: TerminalSquare },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<BotStateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);

  const showToast = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ text, kind });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 3000);
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('No se pudo cargar el estado del bot.');
      const data = (await res.json()) as BotStateSnapshot;
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const apiMutate = async (url: string, method: 'PUT' | 'POST', body?: unknown, successMsg?: string) => {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Error al guardar cambios.');
      }
      if (data.database && data.runtime) {
        setSnapshot({ database: data.database, runtime: data.runtime });
      }
      if (successMsg) showToast(successMsg, 'ok');
      else if (data.toast) showToast(data.toast, 'ok');
      else if (data.summary) showToast(data.summary, 'ok');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error inesperado', 'err');
    }
  };

  const handleSaveSettings = async (next: BotSettings) => {
    await apiMutate('/api/settings', 'PUT', next, 'Configuración de bienvenida y acceso guardada.');
  };

  const handleSaveAutomod = async (next: AutomodConfig) => {
    await apiMutate('/api/automod', 'PUT', next, 'Reglas de Auto-Moderación guardadas.');
  };

  const handleSaveCommands = async (next: CustomCommand[]) => {
    await apiMutate('/api/commands', 'PUT', { commands: next }, 'Comandos personalizados guardados.');
  };

  const handleMemberAction = async (
    memberId: string,
    action: 'warn' | 'unwarn' | 'mute' | 'unmute' | 'kick' | 'ban' | 'unban' | 'set_vip' | 'set_member' | 'approve',
    reason?: string
  ) => {
    await apiMutate(`/api/members/${encodeURIComponent(memberId)}/action`, 'POST', { action, reason });
  };

  const handleSendMessage = async (actorId: string, text: string, contentType: MessageContentType) => {
    await apiMutate('/api/simulator/message', 'POST', { actorId, text, contentType });
  };

  const handleSimulateJoin = async (name: string, username: string) => {
    await apiMutate('/api/simulator/join', 'POST', { name, username }, `Solicitud de @${username} simulada.`);
  };

  const handleCallbackClick = async (actorId: string, callbackData: string) => {
    await apiMutate('/api/simulator/callback', 'POST', { actorId, callbackData });
  };

  const handleResetSimulator = async () => {
    await apiMutate('/api/simulator/reset', 'POST', {}, 'Simulador reiniciado.');
  };

  const handleDownloadAltareZip = () => {
    const link = document.createElement('a');
    link.href = '/api/export/altare.zip';
    link.download = 'centinela-tg-altare.zip';
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('Descargando paquete listo para Altare...', 'ok');
  };

  const activeNavItem = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar (260px desktop) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[260px] bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-sky-600 text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <span className="font-display font-bold text-base tracking-tight text-slate-900 whitespace-nowrap truncate">
              CentinelaTG
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden text-slate-500 hover:text-slate-900"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.Icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <div className="font-medium text-slate-700">Almacenamiento local</div>
          <div className="font-mono text-[11px] truncate">data/bot-db.json · Long Polling</div>
        </div>
      </aside>

      {/* Main Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left + Single primary CTA on right */}
        <header className="h-16 px-4 sm:px-6 bg-white border-b border-slate-200 flex items-center justify-between gap-6 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-md hover:bg-slate-100"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">Grupo Privado</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{activeNavItem.label}</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadAltareZip}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar para Altare (.zip)
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1360px] w-full mx-auto">
          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 bg-white border border-slate-200 rounded-lg" />
                ))}
              </div>
              <div className="h-96 bg-white border border-slate-200 rounded-lg" />
            </div>
          ) : error || !snapshot ? (
            <div className="bg-white border border-rose-200 rounded-lg p-6 text-sm text-rose-700 flex items-center justify-between gap-4">
              <span>{error ?? 'No fue posible cargar la información del servidor.'}</span>
              <button
                type="button"
                onClick={fetchState}
                className="px-3 py-1.5 text-xs font-medium bg-rose-50 hover:bg-rose-100 rounded-md whitespace-nowrap"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewSimulator
                  db={snapshot.database}
                  runtime={snapshot.runtime}
                  onSendMessage={handleSendMessage}
                  onSimulateJoin={handleSimulateJoin}
                  onCallbackClick={handleCallbackClick}
                  onResetSimulator={handleResetSimulator}
                />
              )}
              {activeTab === 'automod' && (
                <AutomodPanel
                  automod={snapshot.database.automod}
                  onSave={handleSaveAutomod}
                />
              )}
              {activeTab === 'welcome' && (
                <WelcomeCaptchaPanel
                  settings={snapshot.database.settings}
                  onSave={handleSaveSettings}
                />
              )}
              {activeTab === 'members' && (
                <MembersAuditPanel
                  members={snapshot.database.members}
                  auditLogs={snapshot.database.auditLogs}
                  maxWarns={snapshot.database.automod.maxWarns}
                  onMemberAction={handleMemberAction}
                />
              )}
              {activeTab === 'altare' && (
                <CommandsAltarePanel
                  commands={snapshot.database.customCommands}
                  runtime={snapshot.runtime}
                  onSaveCommands={handleSaveCommands}
                  onDownloadZip={handleDownloadAltareZip}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Feedback Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-md border shadow-sm transition-opacity duration-150 ${
            toast.kind === 'err'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          {toast.kind === 'err' ? (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
