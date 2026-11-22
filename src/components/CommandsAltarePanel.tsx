import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Plus,
  Save,
  Trash2,
  Server,
  Terminal,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { BUILTIN_COMMANDS, type CommandCategory } from '../shared/commandsCatalog.ts';
import type { BotRuntimeInfo, CustomCommand } from '../shared/types.ts';

interface CommandsAltarePanelProps {
  commands: CustomCommand[];
  runtime: BotRuntimeInfo;
  onSaveCommands: (next: CustomCommand[]) => Promise<void>;
  onDownloadZip: () => void;
}

export const CommandsAltarePanel: React.FC<CommandsAltarePanelProps> = ({
  commands,
  runtime,
  onSaveCommands,
  onDownloadZip,
}) => {
  const [draft, setDraft] = useState<CustomCommand[]>(commands);
  const [trigger, setTrigger] = useState('/');
  const [response, setResponse] = useState('');
  const [adminOnly, setAdminOnly] = useState(false);
  const [deleteTrigger, setDeleteTrigger] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<'all' | CommandCategory>('all');
  const [cmdSearch, setCmdSearch] = useState('');

  useEffect(() => {
    setDraft(commands);
  }, [commands]);

  const addCommand = () => {
    const cleanTrigger = trigger.trim().toLowerCase();
    const cleanResp = response.trim();
    if (!cleanTrigger || cleanTrigger.length < 2) return;
    if (!cleanTrigger.startsWith('/') && !cleanTrigger.startsWith('!')) return;
    if (!cleanResp) return;
    if (draft.some((c) => c.trigger.toLowerCase() === cleanTrigger)) return;

    const item: CustomCommand = {
      id: `cmd-${Date.now()}`,
      trigger: cleanTrigger,
      response: cleanResp,
      adminOnly,
      deleteTrigger,
      enabled: true,
      usageCount: 0,
    };
    setDraft([...draft, item]);
    setTrigger('/');
    setResponse('');
    setAdminOnly(false);
    setDeleteTrigger(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveCommands(draft);
    } finally {
      setSaving(false);
    }
  };

  const copyText = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const filteredBuiltins = BUILTIN_COMMANDS.filter((c) => {
    if (catFilter !== 'all' && c.category !== catFilter) return false;
    const q = cmdSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      c.command.toLowerCase().includes(q) ||
      c.usage.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      {/* Built-in Telegram Menu Commands Catalog */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Comandos Preconfigurados (Menú / de Telegram)
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              El bot registra estos {BUILTIN_COMMANDS.length} comandos automáticamente en Telegram al iniciar (sin configurar <span className="font-mono">@BotFather</span> manualmente).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex border border-slate-200 rounded-md overflow-hidden bg-slate-50">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'grupo', label: 'Grupo' },
                  { id: 'entretenimiento', label: 'Juegos' },
                  { id: 'admin', label: 'Admin' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCatFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    catFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={cmdSearch}
                onChange={(e) => setCmdSearch(e.target.value)}
                placeholder="Buscar comando..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
          {filteredBuiltins.map((item) => (
            <div
              key={item.command}
              className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-slate-50/70"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-sky-700">{item.usage}</span>
                  <span className="text-slate-400" aria-hidden="true">·</span>
                  <span className="text-slate-500">
                    {item.adminOnly ? 'Solo Administradores' : 'Todos los miembros'}
                  </span>
                </div>
                <p className="text-slate-600">{item.description}</p>
              </div>
              <button
                type="button"
                onClick={() => copyText(`builtin-${item.command}`, `/${item.command}`)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors shrink-0"
              >
                {copiedKey === `builtin-${item.command}` ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    /{item.command}
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Custom Commands Section */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Comandos Personalizados</h2>
            <p className="text-sm text-slate-500">
              Crea respuestas rápidas con prefijo <span className="font-mono">/</span> o{' '}
              <span className="font-mono">!</span> usando{' '}
              <span className="font-mono">{'{nombre}'}</span>,{' '}
              <span className="font-mono">{'{usuario}'}</span> y{' '}
              <span className="font-mono">{'{grupo}'}</span>.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar comandos'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Add New Command */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Añadir nuevo comando</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Disparador</label>
              <input
                type="text"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                placeholder="/pagos o !horario"
                className="w-full text-sm font-mono border border-slate-200 rounded-md px-3 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Respuesta del bot
              </label>
              <textarea
                rows={3}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Hola {nombre}, consulta la guía en..."
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2"
              />
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-700">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adminOnly}
                  onChange={(e) => setAdminOnly(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-sky-600"
                />
                Solo administradores
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteTrigger}
                  onChange={(e) => setDeleteTrigger(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-sky-600"
                />
                Borrar mensaje del usuario
              </label>
            </div>
            <button
              type="button"
              onClick={addCommand}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar a la lista
            </button>
          </div>

          {/* Commands List */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {draft.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No hay comandos personalizados aún. Añade el primero desde el formulario lateral.
              </div>
            ) : (
              draft.map((cmd) => (
                <div key={cmd.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-slate-900">{cmd.trigger}</span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className="text-slate-500">
                        {cmd.adminOnly ? 'Solo Admin' : 'Todos'}
                      </span>
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-slate-500">
                        {cmd.usageCount} usos
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap break-words">
                      {cmd.response}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cmd.enabled}
                        onChange={(e) =>
                          setDraft(
                            draft.map((c) =>
                              c.id === cmd.id ? { ...c, enabled: e.target.checked } : c
                            )
                          )
                        }
                        className="w-4 h-4 rounded border-slate-300 text-sky-600"
                      />
                      Activo
                    </label>
                    <button
                      type="button"
                      onClick={() => setDraft(draft.filter((c) => c.id !== cmd.id))}
                      className="text-slate-400 hover:text-rose-600"
                      aria-label={`Eliminar comando ${cmd.trigger}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Altare Deployment Section */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Despliegue 24/7 en Altare</h2>
            <p className="text-sm text-slate-500 mt-1">
              El paquete exportado incluye únicamente el bot autónomo en Node.js con Long Polling, tu configuración actual y almacenamiento local en <span className="font-mono">data/bot-db.json</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadZip}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Descargar paquete Altare (.zip)
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
              <Terminal className="w-4 h-4 text-sky-600" />
              1. Comando de arranque (Startup)
            </div>
            <p className="text-slate-600 leading-relaxed">
              Crea un servidor <strong>Node.js</strong> en Altare, sube los archivos del ZIP (sin <span className="font-mono">node_modules</span>) y usa:
            </p>
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded px-3 py-2 font-mono text-slate-800">
              <span>node index.js</span>
              <button
                type="button"
                onClick={() => copyText('startup', 'node index.js')}
                className="text-slate-500 hover:text-slate-900"
                aria-label="Copiar comando de inicio"
              >
                {copiedKey === 'startup' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
              <Server className="w-4 h-4 text-sky-600" />
              2. Variables de Entorno
            </div>
            <p className="text-slate-600 leading-relaxed">
              Añádelas en la sección <strong>Variables / Environment</strong> de Altare (nunca las escribas en el código):
            </p>
            <ul className="space-y-1.5 font-mono text-slate-700 bg-slate-50 border border-slate-200 rounded p-3">
              <li>TELEGRAM_BOT_TOKEN=tu_token</li>
              <li>ADMIN_USER_IDS=123456789</li>
              <li>GROUP_CHAT_ID=-1001234567890</li>
            </ul>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
              <ShieldCheck className="w-4 h-4 text-sky-600" />
              3. Permisos en @BotFather y Grupo
            </div>
            <ul className="space-y-1.5 text-slate-600 leading-relaxed list-disc pl-4">
              <li>En <strong>@BotFather</strong> usa <span className="font-mono">/setprivacy → Disable</span> para leer y moderar mensajes.</li>
              <li>Nombra al bot <strong>Administrador</strong> del grupo privado con permisos de eliminar, restringir, banear y aprobar ingresos.</li>
              <li>
                Estado actual en este entorno:{' '}
                <strong className="text-slate-900">
                  {runtime.telegramConnected ? `Conectado (@${runtime.botUsername})` : 'Simulador local activo'}
                </strong>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};
