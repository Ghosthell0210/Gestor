import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  UserPlus,
  RotateCcw,
  ShieldAlert,
  Link2Off,
  Flame,
  Sticker,
  Pin,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Siren,
  Terminal,
  X,
} from 'lucide-react';
import { BUILTIN_COMMANDS } from '../shared/commandsCatalog.ts';
import type {
  BotDatabase,
  BotRuntimeInfo,
  MessageContentType,
} from '../shared/types.ts';

interface OverviewSimulatorProps {
  db: BotDatabase;
  runtime: BotRuntimeInfo;
  onSendMessage: (actorId: string, text: string, contentType: MessageContentType) => Promise<void>;
  onSimulateJoin: (name: string, username: string) => Promise<void>;
  onCallbackClick: (actorId: string, callbackData: string) => Promise<void>;
  onResetSimulator: () => Promise<void>;
  onDisableRaidMode: () => Promise<void>;
}

const CONTENT_TYPES: { value: MessageContentType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'forward', label: 'Reenvío' },
  { value: 'sticker', label: 'Sticker' },
  { value: 'gif', label: 'GIF' },
  { value: 'media', label: 'Foto / Video' },
  { value: 'document', label: 'Archivo' },
  { value: 'voice', label: 'Audio' },
];

const QUICK_COMMANDS = [
  '/help',
  '/rules',
  '/daily',
  '/trivia',
  '/ahorcado',
  '/calculo',
  '/shop',
  '/lluvia 100 4',
  '/sorteo 5 1 Pase VIP',
  '/encuesta ¿Evento hoy? | Sí | Mañana',
];

export const OverviewSimulator: React.FC<OverviewSimulatorProps> = ({
  db,
  runtime,
  onSendMessage,
  onSimulateJoin,
  onCallbackClick,
  onResetSimulator,
  onDisableRaidMode,
}) => {
  const [actorId, setActorId] = useState<string>(db.members[0]?.id ?? '1001001');
  const [text, setText] = useState('');
  const [contentType, setContentType] = useState<MessageContentType>('text');
  const [busy, setBusy] = useState(false);

  const [joinName, setJoinName] = useState('Sofía Herrera');
  const [joinUsername, setJoinUsername] = useState('sofia_h');
  const [showCommandsMenu, setShowCommandsMenu] = useState(false);

  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!db.members.some((m) => m.id === actorId) && db.members[0]) {
      setActorId(db.members[0].id);
    }
  }, [db.members, actorId]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [db.simulatorMessages.length]);

  const activeActor = db.members.find((m) => m.id === actorId) ?? db.members[0];
  const verifiedCount = db.members.filter((m) => m.status === 'verified').length;
  const pinnedMsg = [...db.simulatorMessages].reverse().find((m) => m.pinned && !m.deleted);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeActor || busy) return;
    const payloadText =
      text.trim() || (contentType !== 'text' ? `[Contenido simulado: ${contentType}]` : '');
    if (!payloadText) return;
    setBusy(true);
    try {
      await onSendMessage(activeActor.id, payloadText, contentType);
      setText('');
      setContentType('text');
      setShowCommandsMenu(false);
    } finally {
      setBusy(false);
    }
  };

  const isTypingSlash = text.startsWith('/') && !text.includes(' ');
  const slashQuery = isTypingSlash ? text.slice(1).toLowerCase() : '';
  const allAvailableCommands = [
    ...BUILTIN_COMMANDS.map((c) => ({
      trigger: `/${c.command}`,
      usage: c.usage,
      description: c.description,
      categoryLabel: c.adminOnly ? 'Admin' : c.category === 'grupo' ? 'Grupo' : 'Juego',
      adminOnly: c.adminOnly,
    })),
    ...db.customCommands
      .filter((c) => c.enabled)
      .map((c) => ({
        trigger: c.trigger,
        usage: c.trigger,
        description: c.response.slice(0, 90),
        categoryLabel: c.adminOnly ? 'Personalizado · Admin' : 'Personalizado',
        adminOnly: c.adminOnly,
      })),
  ];
  const filteredCommands = allAvailableCommands.filter((item) => {
    if (!slashQuery) return true;
    return (
      item.trigger.toLowerCase().includes(slashQuery) ||
      item.description.toLowerCase().includes(slashQuery)
    );
  });
  const commandsPopoverOpen = showCommandsMenu || isTypingSlash;

  const insertCommand = (trigger: string) => {
    setText(`${trigger} `);
    setShowCommandsMenu(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleTriggerFlood = async () => {
    const testUser = db.members.find((m) => m.role === 'member' && m.status === 'verified') ?? activeActor;
    if (!testUser || busy) return;
    setBusy(true);
    try {
      const burstCount = db.automod.floodMaxMessages + 1;
      for (let i = 1; i <= burstCount; i++) {
        await onSendMessage(testUser.id, `Mensaje rápido de prueba #${i}`, 'text');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTriggerRaid = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const count = db.security.raidJoinThreshold;
      for (let i = 1; i <= count; i++) {
        const suffix = Math.floor(Math.random() * 900 + 100);
        await onSimulateJoin(`Bot Raid ${i}`, `raid_usr_${suffix}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTriggerSpamLink = async () => {
    const testUser = db.members.find((m) => m.role === 'member' && m.status === 'verified') ?? activeActor;
    if (!testUser || busy) return;
    setBusy(true);
    try {
      await onSendMessage(testUser.id, 'Únete gratis aquí https://t.me/canal_spam_externo', 'text');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinName.trim() || !joinUsername.trim() || busy) return;
    setBusy(true);
    try {
      await onSimulateJoin(joinName.trim(), joinUsername.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {db.security.raidModeActive && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-sm font-medium text-rose-900">
            <Siren className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              Modo Emergencia Anti-Raid ACTIVO · Los nuevos ingresos se retienen para revisión manual.
            </span>
          </div>
          <button
            type="button"
            onClick={onDisableRaidMode}
            className="px-3.5 py-1.5 text-xs font-medium text-rose-800 bg-white border border-rose-300 hover:bg-rose-100 rounded-md whitespace-nowrap"
          >
            Desactivar emergencia
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <section
        aria-label="Indicadores del grupo"
        className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-slate-200"
      >
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Miembros verificados</div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {verifiedCount}
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {db.members.length} registrados
            </span>
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Spam y raids bloqueados</div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {db.stats.blockedSpamCount}
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {db.stats.raidsBlocked} raids · {db.stats.totalWarningsIssued} warns
            </span>
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Partidas y eventos</div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
              {db.stats.totalGamesPlayed}
            </span>
            <span className="text-xs text-slate-600 font-mono tabular-nums">
              {db.entertainment.gamesEnabled ? `Cooldown ${db.entertainment.gameCooldownSec}s` : 'Juegos pausados'}
            </span>
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Motor de conexión</div>
          <div className="mt-1.5 flex items-center gap-2">
            {runtime.telegramConnected ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-sm font-semibold text-slate-900 truncate">
                  Long Polling · @{runtime.botUsername}
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm font-semibold text-slate-900 truncate">
                  Modo Simulador Local
                </span>
              </>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Slow Mode: {db.security.slowModeSec}s · Captcha: {db.settings.captchaMode}
          </div>
        </div>
      </section>

      {/* Main Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Simulator Window */}
        <section className="xl:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/70">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 truncate">
                {db.settings.groupName}
              </h2>
              <p className="text-xs text-slate-500">
                Simulador completo · Moderación + Entretenimiento ({db.entertainment.currencyName})
              </p>
            </div>
            <button
              type="button"
              onClick={onResetSimulator}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpiar chat
            </button>
          </div>

          {pinnedMsg && (
            <div className="px-5 py-2.5 border-b border-slate-200 bg-sky-50/60 flex items-center gap-2 text-xs text-slate-700">
              <Pin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="font-medium text-sky-900 shrink-0">Fijado:</span>
              <span className="truncate">{pinnedMsg.text.replace(/^Mensaje fijado:\s*/i, '')}</span>
            </div>
          )}

          <div className="h-[460px] overflow-y-auto p-5 space-y-3 bg-slate-50/40">
            {db.simulatorMessages.map((msg) => {
              if (msg.senderRole === 'system') {
                return (
                  <div key={msg.id} className="py-1.5 text-center">
                    <span className="text-xs text-slate-500">{msg.text}</span>
                  </div>
                );
              }

              const isBot = msg.senderRole === 'bot';
              const timeStr = new Date(msg.timestamp).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg border px-3.5 py-2.5 text-sm ${
                      msg.deleted
                        ? 'bg-slate-100 border-slate-200 text-slate-400'
                        : isBot
                          ? 'bg-white border-slate-200 text-slate-800'
                          : 'bg-sky-50 border-sky-200 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs mb-1">
                      <span className="font-semibold text-slate-900">{msg.senderName}</span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className="text-slate-500 font-mono">@{msg.senderUsername}</span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className="text-slate-500 uppercase font-mono text-[11px]">
                        {msg.senderRole}
                      </span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className="text-slate-400 font-mono tabular-nums">{timeStr}</span>
                    </div>

                    {msg.deleted ? (
                      <div className="flex items-center gap-1.5 text-xs italic text-slate-500">
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Mensaje eliminado por moderación</span>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap leading-relaxed break-words">
                        {msg.messageType !== 'text' && (
                          <span className="block text-xs font-mono text-sky-700 mb-0.5">
                            [{msg.messageType.toUpperCase()}]
                          </span>
                        )}
                        {msg.text}
                      </div>
                    )}

                    {msg.buttons && msg.buttons.length > 0 && !msg.deleted && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                        {msg.buttons.map((btn, idx) =>
                          btn.url ? (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded"
                            >
                              {btn.text}
                            </span>
                          ) : (
                            <button
                              key={idx}
                              type="button"
                              onClick={() =>
                                btn.callbackData && activeActor && onCallbackClick(activeActor.id, btn.callbackData)
                              }
                              className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded transition-colors whitespace-nowrap"
                            >
                              {btn.text}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={feedEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="relative p-4 border-t border-slate-200 bg-white space-y-3">
            {commandsPopoverOpen && filteredCommands.length > 0 && (
              <div className="absolute left-4 right-4 bottom-full mb-2 bg-white border border-slate-200 rounded-lg shadow-lg z-20 overflow-hidden">
                <div className="px-3.5 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">
                    Menú de comandos preconfigurados ({filteredCommands.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCommandsMenu(false);
                      if (isTypingSlash) setText('');
                    }}
                    className="text-slate-400 hover:text-slate-700"
                    aria-label="Cerrar menú de comandos"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {filteredCommands.map((cmd) => (
                    <button
                      key={cmd.trigger}
                      type="button"
                      onClick={() => insertCommand(cmd.trigger)}
                      className="w-full px-3.5 py-2 text-left hover:bg-sky-50 flex items-baseline justify-between gap-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-semibold text-sky-700">
                          {cmd.usage}
                        </span>
                        <p className="text-xs text-slate-600 truncate">{cmd.description}</p>
                      </div>
                      <span className="text-[11px] text-slate-500 shrink-0 font-medium">
                        {cmd.categoryLabel}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-slate-600 shrink-0" htmlFor="sim-actor">
                Actuar como:
              </label>
              <select
                id="sim-actor"
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
                className="text-xs border border-slate-200 rounded-md px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {db.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} (@{m.username}) · {m.role.toUpperCase()} · Nv.{m.level} · {m.coins} {db.entertainment.currencyName}
                  </option>
                ))}
              </select>

              <select
                aria-label="Tipo de mensaje"
                value={contentType}
                onChange={(e) => setContentType(e.target.value as MessageContentType)}
                className="text-xs border border-slate-200 rounded-md px-2.5 py-1.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                {CONTENT_TYPES.map((ct) => (
                  <option key={ct.value} value={ct.value}>
                    Tipo: {ct.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setShowCommandsMenu((prev) => !prev)}
                className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-colors whitespace-nowrap ${
                  commandsPopoverOpen
                    ? 'border-sky-300 bg-sky-50 text-sky-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                Comandos (/)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribe / para ver todos los comandos o envía un mensaje..."
                className="flex-1 min-w-0 text-sm border border-slate-200 rounded-md px-3.5 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4" />
                Enviar
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-slate-500 mr-1">Atajos:</span>
              {QUICK_COMMANDS.map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  onClick={() => setText(cmd)}
                  className="px-2 py-1 text-xs font-mono text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </form>
        </section>

        {/* Right Column */}
        <aside className="xl:col-span-4 space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Simular solicitud de grupo privado</h3>
              <p className="mt-1 text-xs text-slate-500">
                Prueba el flujo de ingreso (`chat_join_request`), captcha y bienvenida automática.
              </p>
            </div>
            <form onSubmit={handleJoinSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="join-name">
                  Nombre completo
                </label>
                <input
                  id="join-name"
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-md px-3 py-1.5 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="join-user">
                  Usuario Telegram
                </label>
                <input
                  id="join-user"
                  type="text"
                  value={joinUsername}
                  onChange={(e) => setJoinUsername(e.target.value)}
                  className="w-full text-sm font-mono border border-slate-200 rounded-md px-3 py-1.5 text-slate-900"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" />
                Simular solicitud de ingreso
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Pruebas de defensa y estrés</h3>
              <p className="mt-1 text-xs text-slate-500">
                Verifica Anti-Raid, Anti-Flood, Anti-Links y filtro de palabras en tiempo real.
              </p>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                disabled={busy}
                onClick={handleTriggerRaid}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <Siren className="w-4 h-4 text-rose-600" />
                  Simular ataque Raid ({db.security.raidJoinThreshold} ingresos)
                </span>
                <span className="font-mono text-rose-600">Ejecutar</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleTriggerFlood}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-600" />
                  Simular ráfaga Anti-Flood ({db.automod.floodMaxMessages + 1} msgs)
                </span>
                <span className="font-mono text-slate-400">Ejecutar</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleTriggerSpamLink}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <Link2Off className="w-4 h-4 text-rose-600" />
                  Enviar enlace t.me no autorizado
                </span>
                <span className="font-mono text-slate-400">Ejecutar</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  activeActor &&
                  onSendMessage(activeActor.id, 'Oferta de casino y criptoregalo gratis', 'text')
                }
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  Probar filtro de palabras prohibidas
                </span>
                <span className="font-mono text-slate-400">Ejecutar</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  activeActor && onSendMessage(activeActor.id, '[Sticker animado]', 'sticker')
                }
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <Sticker className="w-4 h-4 text-sky-600" />
                  Enviar Sticker (probar bloqueo)
                </span>
                <span className="font-mono text-slate-400">Ejecutar</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
