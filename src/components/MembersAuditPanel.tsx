import React, { useMemo, useState } from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  Ban,
  VolumeX,
  AlertTriangle,
  Shield,
  Award,
  User,
} from 'lucide-react';
import type { AuditLogEntry, AuditSource, MemberRecord, MemberStatus } from '../shared/types.ts';

interface MembersAuditPanelProps {
  members: MemberRecord[];
  auditLogs: AuditLogEntry[];
  maxWarns: number;
  onMemberAction: (
    memberId: string,
    action: 'warn' | 'unwarn' | 'mute' | 'unmute' | 'kick' | 'ban' | 'unban' | 'set_vip' | 'set_member' | 'approve',
    reason?: string
  ) => Promise<void>;
}

const STATUS_META: Record<
  MemberStatus,
  { label: string; colorClass: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  verified: { label: 'Verificado', colorClass: 'text-emerald-700', Icon: CheckCircle2 },
  pending_captcha: { label: 'Esperando Captcha', colorClass: 'text-amber-700', Icon: Clock },
  pending_approval: { label: 'Solicitud pendiente', colorClass: 'text-sky-700', Icon: Clock },
  muted: { label: 'Silenciado', colorClass: 'text-amber-700', Icon: VolumeX },
  kicked: { label: 'Expulsado', colorClass: 'text-rose-700', Icon: AlertTriangle },
  banned: { label: 'Baneado', colorClass: 'text-rose-700', Icon: Ban },
};

export const MembersAuditPanel: React.FC<MembersAuditPanelProps> = ({
  members,
  auditLogs,
  maxWarns,
  onMemberAction,
}) => {
  const [memberSearch, setMemberSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'restricted' | 'pending'>('all');
  const [logSourceFilter, setLogSourceFilter] = useState<'all' | AuditSource>('all');
  const [logSearch, setLogSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return members.filter((m) => {
      if (statusFilter === 'verified' && m.status !== 'verified') return false;
      if (
        statusFilter === 'restricted' &&
        m.status !== 'muted' &&
        m.status !== 'kicked' &&
        m.status !== 'banned'
      ) {
        return false;
      }
      if (
        statusFilter === 'pending' &&
        m.status !== 'pending_captcha' &&
        m.status !== 'pending_approval'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    });
  }, [members, memberSearch, statusFilter]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return auditLogs.filter((l) => {
      if (logSourceFilter !== 'all' && l.source !== logSourceFilter) return false;
      if (!q) return true;
      return (
        l.action.toLowerCase().includes(q) ||
        l.actor.toLowerCase().includes(q) ||
        l.target.toLowerCase().includes(q) ||
        l.detail.toLowerCase().includes(q)
      );
    });
  }, [auditLogs, logSourceFilter, logSearch]);

  const triggerAction = async (
    id: string,
    action: Parameters<MembersAuditPanelProps['onMemberAction']>[1]
  ) => {
    setBusyId(id);
    try {
      await onMemberAction(id, action);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Members Directory */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Directorio de Miembros</h2>
            <p className="text-sm text-slate-500">
              Administra advertencias, permisos VIP, aprobaciones y sanciones en tiempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Buscar usuario o ID..."
                className="pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'verified', label: 'Verificados' },
                  { id: 'pending', label: 'Pendientes' },
                  { id: 'restricted', label: 'Sancionados' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Miembro</th>
                  <th className="py-2.5 px-4">Rol</th>
                  <th className="py-2.5 px-4">Estado</th>
                  <th className="py-2.5 px-4 text-right">Warns</th>
                  <th className="py-2.5 px-4 text-right">Mensajes</th>
                  <th className="py-2.5 px-4 text-right">Acciones de moderación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center text-slate-500">
                      No hay miembros que coincidan con el filtro aplicado.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((m) => {
                    const meta = STATUS_META[m.status];
                    const StatusIcon = meta.Icon;
                    const isBusy = busyId === m.id;
                    const isAdmin = m.role === 'admin';

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors h-11">
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900">{m.name}</div>
                          <div className="text-slate-500 font-mono">
                            @{m.username} · {m.id}
                          </div>
                        </td>

                        <td className="py-2.5 px-4">
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                            {m.role === 'admin' ? (
                              <Shield className="w-3.5 h-3.5 text-sky-600" />
                            ) : m.role === 'vip' ? (
                              <Award className="w-3.5 h-3.5 text-amber-600" />
                            ) : (
                              <User className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            {m.role === 'admin' ? 'Admin' : m.role === 'vip' ? 'VIP' : 'Miembro'}
                          </span>
                        </td>

                        <td className="py-2.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 font-medium ${meta.colorClass}`}>
                            <StatusIcon className="w-3.5 h-3.5" />
                            {meta.label}
                          </span>
                        </td>

                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-800">
                          {m.warns}/{maxWarns}
                        </td>

                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                          {m.messageCount}
                        </td>

                        <td className="py-2.5 px-4 text-right">
                          {isAdmin ? (
                            <span className="text-slate-400">Protegido (Admin)</span>
                          ) : (
                            <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                              {(m.status === 'pending_approval' || m.status === 'pending_captcha') && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => triggerAction(m.id, 'approve')}
                                  className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded whitespace-nowrap"
                                >
                                  Aprobar
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => triggerAction(m.id, 'warn')}
                                className="px-2 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 rounded whitespace-nowrap"
                              >
                                +1 Warn
                              </button>

                              {m.warns > 0 && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => triggerAction(m.id, 'unwarn')}
                                  className="px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded whitespace-nowrap"
                                >
                                  -1 Warn
                                </button>
                              )}

                              {m.status === 'muted' ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => triggerAction(m.id, 'unmute')}
                                  className="px-2 py-1 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded whitespace-nowrap"
                                >
                                  Quitar Mute
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => triggerAction(m.id, 'mute')}
                                  className="px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded whitespace-nowrap"
                                >
                                  Mute
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  triggerAction(m.id, m.role === 'vip' ? 'set_member' : 'set_vip')
                                }
                                className="px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded whitespace-nowrap"
                              >
                                {m.role === 'vip' ? 'Quitar VIP' : 'Dar VIP'}
                              </button>

                              {m.status === 'banned' || m.status === 'kicked' ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => triggerAction(m.id, 'unban')}
                                  className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded whitespace-nowrap"
                                >
                                  Desbanear
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => triggerAction(m.id, 'ban')}
                                  className="px-2 py-1 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded whitespace-nowrap"
                                >
                                  Ban
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Audit Log */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Registro de Auditoría</h2>
            <p className="text-sm text-slate-500">
              Trazabilidad completa de acciones automáticas, comandos en Telegram y cambios desde el panel.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Filtrar eventos..."
                className="pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Todos' },
                  { id: 'telegram', label: 'Telegram' },
                  { id: 'simulator', label: 'Simulador' },
                  { id: 'panel', label: 'Panel' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLogSourceFilter(tab.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    logSourceFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="py-2.5 px-4">Hora</th>
                  <th className="py-2.5 px-4">Origen</th>
                  <th className="py-2.5 px-4">Acción</th>
                  <th className="py-2.5 px-4">Actor</th>
                  <th className="py-2.5 px-4">Objetivo</th>
                  <th className="py-2.5 px-4">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center text-slate-500">
                      No hay registros de auditoría para el filtro actual.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const timeStr = new Date(log.timestamp).toLocaleString('es-ES', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const sevClass =
                      log.severity === 'danger'
                        ? 'text-rose-700 font-semibold'
                        : log.severity === 'warning'
                          ? 'text-amber-700 font-semibold'
                          : 'text-slate-800 font-medium';

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {timeStr}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 uppercase whitespace-nowrap">
                          {log.source}
                        </td>
                        <td className={`py-2.5 px-4 whitespace-nowrap ${sevClass}`}>{log.action}</td>
                        <td className="py-2.5 px-4 text-slate-700 whitespace-nowrap">{log.actor}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                          {log.target}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">{log.detail}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
