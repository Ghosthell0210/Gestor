import crypto from 'node:crypto';
import { store } from './storage.ts';
import type {
  AuditSeverity,
  AuditSource,
  ContentLocks,
  MemberRecord,
  MemberRole,
  MessageContentType,
  SimulatorButton,
  SimulatorMessage,
} from '../shared/types.ts';

export interface IncomingActor {
  id: string;
  name: string;
  username: string;
  isAdmin?: boolean;
}

export interface IncomingMessageEvent {
  source: AuditSource;
  chatTitle?: string;
  actor: IncomingActor;
  text: string;
  contentType: MessageContentType;
  targetUser?: IncomingActor | null;
  replyToMessageId?: string | null;
  messageId?: string;
}

export interface BotEffect {
  type:
    | 'reply'
    | 'delete_incoming'
    | 'mute_user'
    | 'unmute_user'
    | 'kick_user'
    | 'ban_user'
    | 'unban_user'
    | 'pin_message'
    | 'unpin_message'
    | 'purge_messages'
    | 'approve_join'
    | 'decline_join';
  text?: string;
  buttons?: SimulatorButton[];
  targetUserId?: string;
  durationMin?: number;
  count?: number;
  pinned?: boolean;
}

const URL_REGEX = /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/)([^\s/$.?#].[^\s]*)/gi;

export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

function formatTemplate(
  template: string,
  vars: { nombre: string; usuario: string; grupo: string; warns?: string }
): string {
  return template
    .replaceAll('{nombre}', vars.nombre)
    .replaceAll('{usuario}', vars.usuario)
    .replaceAll('{grupo}', vars.grupo)
    .replaceAll('{warns}', vars.warns ?? '0');
}

class ModerationEngine {
  private floodTracker = new Map<string, number[]>();

  private addLog(
    source: AuditSource,
    action: string,
    actor: string,
    target: string,
    detail: string,
    severity: AuditSeverity = 'info'
  ) {
    const db = store.get();
    db.auditLogs.unshift({
      id: uid('log'),
      timestamp: new Date().toISOString(),
      source,
      action,
      actor,
      target,
      detail,
      severity,
    });
    if (db.auditLogs.length > 200) {
      db.auditLogs.length = 200;
    }
  }

  private pushSimulatorMessage(msg: Omit<SimulatorMessage, 'id' | 'timestamp'>): SimulatorMessage {
    const db = store.get();
    const entry: SimulatorMessage = {
      ...msg,
      id: uid('sim'),
      timestamp: new Date().toISOString(),
    };
    db.simulatorMessages.push(entry);
    if (db.simulatorMessages.length > 120) {
      db.simulatorMessages = db.simulatorMessages.slice(-120);
    }
    return entry;
  }

  private ensureMember(actor: IncomingActor): MemberRecord {
    const db = store.get();
    const existing = db.members.find(
      (m) => m.id === actor.id || (actor.username && m.username.toLowerCase() === actor.username.toLowerCase())
    );
    if (existing) {
      existing.name = actor.name || existing.name;
      if (actor.username) existing.username = actor.username;
      if (actor.isAdmin) existing.role = 'admin';
      existing.lastActiveAt = new Date().toISOString();
      return existing;
    }
    const created: MemberRecord = {
      id: actor.id,
      name: actor.name || 'Usuario',
      username: actor.username || `user_${actor.id}`,
      role: actor.isAdmin ? 'admin' : 'member',
      status: 'verified',
      warns: 0,
      warnHistory: [],
      mutedUntil: null,
      joinedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      messageCount: 0,
    };
    db.members.push(created);
    return created;
  }

  private resolveTargetMember(query: string, explicitTarget?: IncomingActor | null): MemberRecord | null {
    if (explicitTarget) {
      return this.ensureMember(explicitTarget);
    }
    const clean = query.trim().replace(/^@/, '').toLowerCase();
    if (!clean) return null;
    const db = store.get();
    return (
      db.members.find(
        (m) => m.id.toLowerCase() === clean || m.username.toLowerCase() === clean || m.name.toLowerCase() === clean
      ) ?? null
    );
  }

  private applyWarn(
    source: AuditSource,
    target: MemberRecord,
    reason: string,
    by: string
  ): { message: string; escalatedEffect?: BotEffect } {
    const db = store.get();
    target.warns += 1;
    target.warnHistory.unshift({
      id: uid('warn'),
      reason,
      by,
      at: new Date().toISOString(),
    });
    db.stats.totalWarningsIssued += 1;

    const max = db.automod.maxWarns;
    this.addLog(
      source,
      `Advertencia (${target.warns}/${max})`,
      by,
      `@${target.username}`,
      reason,
      target.warns >= max ? 'danger' : 'warning'
    );

    if (target.warns >= max) {
      const action = db.automod.maxWarnAction;
      if (action === 'ban') {
        target.status = 'banned';
        this.addLog(source, 'Baneo automático (Máx. Warns)', 'Sistema', `@${target.username}`, reason, 'danger');
        return {
          message: `@${target.username} alcanzó ${target.warns}/${max} advertencias y fue baneado del grupo. Motivo: ${reason}.`,
          escalatedEffect: { type: 'ban_user', targetUserId: target.id },
        };
      }
      if (action === 'kick') {
        target.status = 'kicked';
        this.addLog(source, 'Expulsión automática (Máx. Warns)', 'Sistema', `@${target.username}`, reason, 'danger');
        return {
          message: `@${target.username} alcanzó ${target.warns}/${max} advertencias y fue expulsado del grupo. Motivo: ${reason}.`,
          escalatedEffect: { type: 'kick_user', targetUserId: target.id },
        };
      }
      const mins = db.automod.muteDurationMin;
      target.status = 'muted';
      target.mutedUntil = new Date(Date.now() + mins * 60_000).toISOString();
      this.addLog(source, `Silencio automático (${mins}m)`, 'Sistema', `@${target.username}`, reason, 'danger');
      return {
        message: `@${target.username} alcanzó ${target.warns}/${max} advertencias y fue silenciado ${mins} min. Motivo: ${reason}.`,
        escalatedEffect: { type: 'mute_user', targetUserId: target.id, durationMin: mins },
      };
    }

    return {
      message: `Advertencia para @${target.username} (${target.warns}/${max}). Motivo: ${reason}.`,
    };
  }

  async handleJoinRequest(source: AuditSource, actor: IncomingActor): Promise<BotEffect[]> {
    const db = store.get();
    const member = this.ensureMember(actor);
    const effects: BotEffect[] = [];
    const groupName = db.settings.groupName;

    if (db.settings.approveJoinRequests === 'manual') {
      member.status = 'pending_approval';
      this.addLog(
        source,
        'Solicitud de ingreso pendiente',
        'Control PV',
        `@${member.username}`,
        'En espera de aprobación manual de un administrador.',
        'info'
      );
      const buttons: SimulatorButton[] = [
        { text: 'Aprobar ingreso', callbackData: `approve_join:${member.id}` },
        { text: 'Rechazar', callbackData: `decline_join:${member.id}` },
      ];
      const text = `Nueva solicitud para entrar a ${groupName}: ${member.name} (@${member.username}). Requiere aprobación de un administrador.`;
      effects.push({ type: 'reply', text, buttons });
      if (source === 'simulator') {
        this.pushSimulatorMessage({
          senderId: 'bot',
          senderName: 'CentinelaTG',
          senderUsername: 'CentinelaTG_bot',
          senderRole: 'bot',
          text,
          messageType: 'text',
          buttons,
        });
      }
      await store.save();
      return effects;
    }

    if (db.settings.captchaMode === 'off' || db.settings.approveJoinRequests === 'auto_all') {
      member.status = 'verified';
      db.stats.captchasPassed += 1;
      effects.push({ type: 'approve_join', targetUserId: member.id });
      this.addLog(source, 'Ingreso aprobado', 'Bienvenida', `@${member.username}`, 'Acceso directo configurado.', 'info');
      if (db.settings.welcomeEnabled) {
        const welcomeText = formatTemplate(db.settings.welcomeMessage, {
          nombre: member.name,
          usuario: `@${member.username}`,
          grupo: groupName,
        });
        const buttons = db.settings.welcomeButtons.map((b) => ({ text: b.text, url: b.url }));
        effects.push({ type: 'reply', text: welcomeText, buttons });
        if (source === 'simulator') {
          this.pushSimulatorMessage({
            senderId: 'bot',
            senderName: 'CentinelaTG',
            senderUsername: 'CentinelaTG_bot',
            senderRole: 'bot',
            text: welcomeText,
            messageType: 'text',
            buttons,
          });
        }
      }
      await store.save();
      return effects;
    }

    // Captcha required
    member.status = 'pending_captcha';
    effects.push({ type: 'approve_join', targetUserId: member.id });
    effects.push({ type: 'mute_user', targetUserId: member.id, durationMin: 5 });

    let challengeText = '';
    let buttons: SimulatorButton[] = [];
    if (db.settings.captchaMode === 'math') {
      const a = 3 + Math.floor(Math.random() * 7);
      const b = 2 + Math.floor(Math.random() * 7);
      const answer = String(a + b);
      member.pendingCaptchaAnswer = answer;
      const wrong1 = String(a + b + 2);
      const wrong2 = String(Math.max(1, a + b - 1));
      const options = [answer, wrong1, wrong2].sort(() => Math.random() - 0.5);
      challengeText = `Verificación de grupo privado para ${member.name} (@${member.username}). Resuelve ${a} + ${b} en menos de ${db.settings.captchaTimeoutSec}s para desbloquear el chat.`;
      buttons = options.map((opt) => ({
        text: `Resultado: ${opt}`,
        callbackData: `verify:${member.id}:${opt}`,
      }));
    } else {
      member.pendingCaptchaAnswer = 'ok';
      challengeText = `Bienvenido/a ${member.name} (@${member.username}). Pulsa el botón inferior en menos de ${db.settings.captchaTimeoutSec}s para confirmar que eres humano.`;
      buttons = [{ text: 'Verificar que soy humano', callbackData: `verify:${member.id}:ok` }];
    }

    this.addLog(
      source,
      'Captcha enviado',
      'Control PV',
      `@${member.username}`,
      `Modo: ${db.settings.captchaMode}`,
      'info'
    );
    effects.push({ type: 'reply', text: challengeText, buttons });
    if (source === 'simulator') {
      this.pushSimulatorMessage({
        senderId: 'bot',
        senderName: 'CentinelaTG',
        senderUsername: 'CentinelaTG_bot',
        senderRole: 'bot',
        text: challengeText,
        messageType: 'text',
        buttons,
      });
    }

    await store.save();
    return effects;
  }

  async handleCallback(
    source: AuditSource,
    actor: IncomingActor,
    callbackData: string
  ): Promise<{ replyText: string; effects: BotEffect[] }> {
    const db = store.get();
    const effects: BotEffect[] = [];

    if (callbackData.startsWith('verify:')) {
      const [, targetId, answer] = callbackData.split(':');
      const member = db.members.find((m) => m.id === targetId);
      if (!member) {
        return { replyText: 'Usuario no encontrado para verificar.', effects };
      }
      if (actor.id !== targetId && !actor.isAdmin) {
        return { replyText: 'Este botón de verificación pertenece a otro miembro.', effects };
      }
      if (member.status !== 'pending_captcha') {
        return { replyText: `@${member.username} ya está verificado.`, effects };
      }
      if (member.pendingCaptchaAnswer && member.pendingCaptchaAnswer !== answer) {
        this.addLog(source, 'Captcha fallido', `@${member.username}`, `@${member.username}`, `Respuesta incorrecta (${answer})`, 'warning');
        return { replyText: 'Respuesta incorrecta. Intenta de nuevo antes de que expire el tiempo.', effects };
      }

      member.status = 'verified';
      member.pendingCaptchaAnswer = undefined;
      member.mutedUntil = null;
      db.stats.captchasPassed += 1;
      effects.push({ type: 'unmute_user', targetUserId: member.id });
      this.addLog(source, 'Verificación completada', 'Captcha', `@${member.username}`, 'Permisos de escritura habilitados.', 'info');

      const welcomeText = db.settings.welcomeEnabled
        ? formatTemplate(db.settings.welcomeMessage, {
            nombre: member.name,
            usuario: `@${member.username}`,
            grupo: db.settings.groupName,
          })
        : `@${member.username} verificado correctamente.`;

      const buttons = db.settings.welcomeEnabled
        ? db.settings.welcomeButtons.map((b) => ({ text: b.text, url: b.url }))
        : [];

      effects.push({ type: 'reply', text: welcomeText, buttons });
      if (source === 'simulator') {
        this.pushSimulatorMessage({
          senderId: 'bot',
          senderName: 'CentinelaTG',
          senderUsername: 'CentinelaTG_bot',
          senderRole: 'bot',
          text: welcomeText,
          messageType: 'text',
          buttons,
        });
      }
      await store.save();
      return { replyText: 'Verificación completada.', effects };
    }

    if (callbackData.startsWith('approve_join:') || callbackData.startsWith('decline_join:')) {
      const isApprove = callbackData.startsWith('approve_join:');
      const targetId = callbackData.split(':')[1];
      const caller = this.ensureMember(actor);
      if (caller.role !== 'admin' && !actor.isAdmin) {
        return { replyText: 'Solo los administradores pueden aprobar o rechazar solicitudes.', effects };
      }
      const target = db.members.find((m) => m.id === targetId);
      if (!target) {
        return { replyText: 'Solicitud no encontrada.', effects };
      }
      if (isApprove) {
        target.status = 'verified';
        db.stats.captchasPassed += 1;
        effects.push({ type: 'approve_join', targetUserId: target.id });
        const text = `Solicitud aprobada por @${caller.username}. Bienvenido/a @${target.username} a ${db.settings.groupName}.`;
        effects.push({ type: 'reply', text });
        this.addLog(source, 'Solicitud aprobada', `@${caller.username}`, `@${target.username}`, 'Ingreso autorizado al grupo PV.', 'info');
        if (source === 'simulator') {
          this.pushSimulatorMessage({
            senderId: 'bot',
            senderName: 'CentinelaTG',
            senderUsername: 'CentinelaTG_bot',
            senderRole: 'bot',
            text,
            messageType: 'text',
          });
        }
      } else {
        target.status = 'kicked';
        effects.push({ type: 'decline_join', targetUserId: target.id });
        const text = `Solicitud de @${target.username} rechazada por @${caller.username}.`;
        effects.push({ type: 'reply', text });
        this.addLog(source, 'Solicitud rechazada', `@${caller.username}`, `@${target.username}`, 'Acceso denegado.', 'warning');
        if (source === 'simulator') {
          this.pushSimulatorMessage({
            senderId: 'bot',
            senderName: 'CentinelaTG',
            senderUsername: 'CentinelaTG_bot',
            senderRole: 'bot',
            text,
            messageType: 'text',
          });
        }
      }
      await store.save();
      return { replyText: isApprove ? 'Solicitud aprobada.' : 'Solicitud rechazada.', effects };
    }

    return { replyText: 'Acción procesada.', effects };
  }

  async processIncoming(event: IncomingMessageEvent): Promise<{
    effects: BotEffect[];
    incomingMessage?: SimulatorMessage;
  }> {
    const db = store.get();
    const effects: BotEffect[] = [];
    const member = this.ensureMember(event.actor);
    const isAdmin = member.role === 'admin' || Boolean(event.actor.isAdmin);
    const isVip = member.role === 'vip';

    // Lift expired mute automatically
    if (member.status === 'muted' && member.mutedUntil) {
      if (new Date(member.mutedUntil).getTime() <= Date.now()) {
        member.status = 'verified';
        member.mutedUntil = null;
      }
    }

    let simMsg: SimulatorMessage | undefined;
    if (event.source === 'simulator') {
      if (member.status === 'banned' || member.status === 'kicked') {
        const blocked = this.pushSimulatorMessage({
          senderId: 'bot',
          senderName: 'CentinelaTG',
          senderUsername: 'CentinelaTG_bot',
          senderRole: 'bot',
          text: `@${member.username} no puede enviar mensajes porque su estado actual es "${member.status}".`,
          messageType: 'text',
        });
        await store.save();
        return { effects: [{ type: 'reply', text: blocked.text }], incomingMessage: blocked };
      }
      if (member.status === 'muted' || member.status === 'pending_captcha') {
        const reason =
          member.status === 'pending_captcha'
            ? 'debe completar la verificación Captcha primero'
            : 'está silenciado temporalmente';
        const blocked = this.pushSimulatorMessage({
          senderId: 'bot',
          senderName: 'CentinelaTG',
          senderUsername: 'CentinelaTG_bot',
          senderRole: 'bot',
          text: `Mensaje de @${member.username} bloqueado: ${reason}.`,
          messageType: 'text',
        });
        await store.save();
        return { effects: [{ type: 'delete_incoming' }, { type: 'reply', text: blocked.text }], incomingMessage: blocked };
      }

      simMsg = this.pushSimulatorMessage({
        senderId: member.id,
        senderName: member.name,
        senderUsername: member.username,
        senderRole: member.role,
        text: event.text,
        messageType: event.contentType,
      });
    }

    db.stats.totalMessagesProcessed += 1;
    member.messageCount += 1;

    const emitBotReply = (text: string, buttons?: SimulatorButton[]) => {
      effects.push({ type: 'reply', text, buttons });
      if (event.source === 'simulator') {
        this.pushSimulatorMessage({
          senderId: 'bot',
          senderName: 'CentinelaTG',
          senderUsername: 'CentinelaTG_bot',
          senderRole: 'bot',
          text,
          messageType: 'text',
          buttons,
        });
      }
    };

    const deleteIncoming = () => {
      effects.push({ type: 'delete_incoming' });
      if (simMsg) simMsg.deleted = true;
    };

    // 1. Auto-Moderation Checks (non-admins)
    if (!isAdmin) {
      // A) Content locks
      const locks = db.automod.locks;
      const lockedByAll = locks.all;
      const lockedByType =
        (event.contentType === 'sticker' && locks.stickers) ||
        (event.contentType === 'gif' && locks.gifs) ||
        (event.contentType === 'media' && locks.media) ||
        (event.contentType === 'document' && locks.documents) ||
        (event.contentType === 'voice' && locks.voice);

      if ((lockedByAll || lockedByType) && !isVip) {
        deleteIncoming();
        db.stats.blockedSpamCount += 1;
        const lockLabel = lockedByAll ? 'bloqueo global de chat' : `bloqueo de ${event.contentType}`;
        this.addLog(event.source, 'Contenido bloqueado', 'AutoMod · Locks', `@${member.username}`, lockLabel, 'warning');
        emitBotReply(`Mensaje eliminado de @${member.username}: ${lockLabel} activo.`);
        await store.save();
        return { effects, incomingMessage: simMsg };
      }

      // B) Anti-Flood
      if (db.automod.antiFloodEnabled && !isVip) {
        const nowMs = Date.now();
        const windowMs = db.automod.floodWindowSec * 1000;
        const history = (this.floodTracker.get(member.id) ?? []).filter((ts) => nowMs - ts <= windowMs);
        history.push(nowMs);
        this.floodTracker.set(member.id, history);

        if (history.length > db.automod.floodMaxMessages) {
          this.floodTracker.set(member.id, []);
          deleteIncoming();
          db.stats.blockedSpamCount += 1;
          if (db.automod.floodAction === 'warn') {
            const res = this.applyWarn(event.source, member, 'Exceso de mensajes rápidos (Anti-Flood)', 'AutoMod · Anti-Flood');
            if (res.escalatedEffect) effects.push(res.escalatedEffect);
            emitBotReply(res.message);
          } else if (db.automod.floodAction === 'kick') {
            member.status = 'kicked';
            effects.push({ type: 'kick_user', targetUserId: member.id });
            this.addLog(event.source, 'Expulsión por Anti-Flood', 'AutoMod · Anti-Flood', `@${member.username}`, `${history.length} msgs en ${db.automod.floodWindowSec}s`, 'danger');
            emitBotReply(`@${member.username} fue expulsado automáticamente por flood.`);
          } else {
            const mins = db.automod.muteDurationMin;
            member.status = 'muted';
            member.mutedUntil = new Date(Date.now() + mins * 60_000).toISOString();
            effects.push({ type: 'mute_user', targetUserId: member.id, durationMin: mins });
            this.addLog(event.source, `Silencio por Anti-Flood (${mins}m)`, 'AutoMod · Anti-Flood', `@${member.username}`, `${history.length} msgs en ${db.automod.floodWindowSec}s`, 'danger');
            emitBotReply(`@${member.username} silenciado ${mins} minutos por enviar mensajes demasiado rápido.`);
          }
          await store.save();
          return { effects, incomingMessage: simMsg };
        }
      }

      // C) Anti-Links & Anti-Forwards
      if (db.automod.antiLinksEnabled && !isVip) {
        const isForwardBlocked = db.automod.blockForwards && event.contentType === 'forward';
        const matchedUrls = event.text.match(URL_REGEX) ?? [];
        const hasDisallowedUrl = matchedUrls.some((rawUrl) => {
          const lower = rawUrl.toLowerCase();
          if (db.automod.blockTelegramLinks && (lower.includes('t.me/') || lower.includes('telegram.me/'))) {
            return true;
          }
          return !db.automod.allowedDomains.some((dom) => lower.includes(dom.toLowerCase()));
        });

        if (isForwardBlocked || hasDisallowedUrl) {
          deleteIncoming();
          db.stats.blockedSpamCount += 1;
          const reason = isForwardBlocked ? 'Reenvío externo no permitido' : 'Enlace externo no autorizado';
          if (db.automod.linksAction === 'warn') {
            const res = this.applyWarn(event.source, member, reason, 'AutoMod · Anti-Links');
            if (res.escalatedEffect) effects.push(res.escalatedEffect);
            emitBotReply(res.message);
          } else if (db.automod.linksAction === 'mute') {
            const mins = db.automod.muteDurationMin;
            member.status = 'muted';
            member.mutedUntil = new Date(Date.now() + mins * 60_000).toISOString();
            effects.push({ type: 'mute_user', targetUserId: member.id, durationMin: mins });
            this.addLog(event.source, `Silencio por enlace (${mins}m)`, 'AutoMod · Anti-Links', `@${member.username}`, reason, 'danger');
            emitBotReply(`@${member.username} silenciado ${mins} min. Motivo: ${reason}.`);
          } else {
            this.addLog(event.source, 'Enlace eliminado', 'AutoMod · Anti-Links', `@${member.username}`, reason, 'warning');
            emitBotReply(`Mensaje eliminado de @${member.username}: ${reason}.`);
          }
          await store.save();
          return { effects, incomingMessage: simMsg };
        }
      }

      // D) Bad Words Filter
      if (db.automod.badWordsEnabled && db.automod.badWords.length > 0) {
        const lowerText = event.text.toLowerCase();
        const hit = db.automod.badWords.find((w) => w.trim().length > 0 && lowerText.includes(w.trim().toLowerCase()));
        if (hit) {
          deleteIncoming();
          db.stats.blockedSpamCount += 1;
          const reason = `Uso de término prohibido ("${hit}")`;
          if (db.automod.badWordsAction === 'warn') {
            const res = this.applyWarn(event.source, member, reason, 'AutoMod · Filtro');
            if (res.escalatedEffect) effects.push(res.escalatedEffect);
            emitBotReply(res.message);
          } else if (db.automod.badWordsAction === 'mute') {
            const mins = db.automod.muteDurationMin;
            member.status = 'muted';
            member.mutedUntil = new Date(Date.now() + mins * 60_000).toISOString();
            effects.push({ type: 'mute_user', targetUserId: member.id, durationMin: mins });
            this.addLog(event.source, `Silencio por filtro (${mins}m)`, 'AutoMod · Filtro', `@${member.username}`, reason, 'danger');
            emitBotReply(`@${member.username} silenciado ${mins} min por lenguaje no permitido.`);
          } else {
            this.addLog(event.source, 'Mensaje filtrado', 'AutoMod · Filtro', `@${member.username}`, reason, 'warning');
            emitBotReply(`Mensaje de @${member.username} eliminado por filtro de palabras.`);
          }
          await store.save();
          return { effects, incomingMessage: simMsg };
        }
      }
    }

    // 2. @admin report shorthand
    const trimmed = event.text.trim();
    if (trimmed.toLowerCase().includes('@admin')) {
      this.addLog(event.source, 'Alerta @admin', `@${member.username}`, 'Staff', trimmed.slice(0, 120), 'warning');
      emitBotReply(`Reporte recibido de @${member.username}. El equipo de administración ha sido notificado.`);
      await store.save();
      return { effects, incomingMessage: simMsg };
    }

    // 3. Built-in & Custom Commands
    if (trimmed.startsWith('/') || trimmed.startsWith('!')) {
      const parts = trimmed.split(/\s+/);
      const rawCmd = parts[0].split('@')[0].toLowerCase();
      const args = parts.slice(1);

      // Check custom commands first
      const custom = db.customCommands.find((c) => c.enabled && c.trigger.toLowerCase() === rawCmd);
      if (custom) {
        if (custom.adminOnly && !isAdmin) {
          emitBotReply('Este comando es exclusivo para administradores.');
        } else {
          if (custom.deleteTrigger) deleteIncoming();
          custom.usageCount += 1;
          const rendered = formatTemplate(custom.response, {
            nombre: member.name,
            usuario: `@${member.username}`,
            grupo: db.settings.groupName,
            warns: `${member.warns}/${db.automod.maxWarns}`,
          });
          emitBotReply(rendered);
        }
        await store.save();
        return { effects, incomingMessage: simMsg };
      }

      // Built-in commands
      switch (rawCmd) {
        case '/start':
        case '/help': {
          const memberCmds = '/rules · /info · /staff · /warns · /report <motivo>';
          const adminCmds =
            '\nComandos Admin: /warn · /unwarn · /mute [min] · /unmute · /kick · /ban · /unban · /vip · /unvip · /lock <tipo> · /unlock <tipo> · /purge [N] · /pin <texto> · /unpin · /setrules · /setwelcome';
          emitBotReply(
            `CentinelaTG activo en ${db.settings.groupName}.\nComandos disponibles: ${memberCmds}${isAdmin ? adminCmds : ''}`
          );
          break;
        }

        case '/rules': {
          emitBotReply(`Normas de ${db.settings.groupName}:\n${db.settings.rulesText}`);
          break;
        }

        case '/setrules': {
          if (!isAdmin) {
            emitBotReply('Solo los administradores pueden modificar las normas.');
            break;
          }
          const nextRules = args.join(' ').trim();
          if (!nextRules) {
            emitBotReply('Uso: /setrules <nuevo texto de normas>');
            break;
          }
          db.settings.rulesText = nextRules;
          this.addLog(event.source, 'Normas actualizadas', `@${member.username}`, db.settings.groupName, nextRules.slice(0, 80), 'info');
          emitBotReply('Normas del grupo actualizadas correctamente.');
          break;
        }

        case '/setwelcome': {
          if (!isAdmin) {
            emitBotReply('Solo los administradores pueden modificar la bienvenida.');
            break;
          }
          const nextWelcome = args.join(' ').trim();
          if (!nextWelcome) {
            emitBotReply('Uso: /setwelcome <texto con {nombre} y {grupo}>');
            break;
          }
          db.settings.welcomeMessage = nextWelcome;
          this.addLog(event.source, 'Bienvenida actualizada', `@${member.username}`, db.settings.groupName, nextWelcome.slice(0, 80), 'info');
          emitBotReply('Mensaje de bienvenida actualizado.');
          break;
        }

        case '/staff': {
          const admins = db.members.filter((m) => m.role === 'admin').map((m) => `@${m.username} (${m.name})`);
          const vips = db.members.filter((m) => m.role === 'vip').map((m) => `@${m.username}`);
          emitBotReply(
            `Administradores: ${admins.join(', ') || 'Sin asignar'}\nMiembros VIP: ${vips.join(', ') || 'Ninguno'}`
          );
          break;
        }

        case '/report': {
          const reason = args.join(' ').trim() || 'Solicitud de revisión en el grupo';
          this.addLog(event.source, 'Reporte de miembro', `@${member.username}`, 'Administración', reason, 'warning');
          emitBotReply(`Reporte registrado por @${member.username}: "${reason}". Un administrador lo revisará pronto.`);
          break;
        }

        case '/info': {
          const target = args[0] ? this.resolveTargetMember(args[0], event.targetUser) : member;
          if (!target) {
            emitBotReply('Usuario no encontrado. Usa /info @usuario o responde a su mensaje.');
            break;
          }
          emitBotReply(
            `Ficha de ${target.name} (@${target.username})\nID: ${target.id} · Rol: ${target.role.toUpperCase()} · Estado: ${target.status}\nAdvertencias: ${target.warns}/${db.automod.maxWarns} · Mensajes: ${target.messageCount}`
          );
          break;
        }

        case '/warns': {
          const target = args[0] ? this.resolveTargetMember(args[0], event.targetUser) : member;
          if (!target) {
            emitBotReply('Usuario no encontrado.');
            break;
          }
          if (target.warnHistory.length === 0) {
            emitBotReply(`@${target.username} tiene 0/${db.automod.maxWarns} advertencias.`);
          } else {
            const list = target.warnHistory
              .slice(0, 5)
              .map((w, idx) => `${idx + 1}. ${w.reason} (${w.by})`)
              .join('\n');
            emitBotReply(`Advertencias de @${target.username} (${target.warns}/${db.automod.maxWarns}):\n${list}`);
          }
          break;
        }

        case '/warn': {
          if (!isAdmin) {
            emitBotReply('Permiso denegado: se requiere rol de administrador.');
            break;
          }
          const target = this.resolveTargetMember(args[0] ?? '', event.targetUser);
          if (!target) {
            emitBotReply('Uso: /warn @usuario [motivo] o responde a un mensaje.');
            break;
          }
          if (target.role === 'admin') {
            emitBotReply('No es posible advertir a otro administrador.');
            break;
          }
          const reason = (event.targetUser ? args : args.slice(1)).join(' ').trim() || 'Incumplimiento de normas';
          const res = this.applyWarn(event.source, target, reason, `@${member.username}`);
          if (res.escalatedEffect) effects.push(res.escalatedEffect);
          emitBotReply(res.message);
          break;
        }

        case '/unwarn': {
          if (!isAdmin) {
            emitBotReply('Permiso denegado: se requiere rol de administrador.');
            break;
          }
          const target = this.resolveTargetMember(args[0] ?? '', event.targetUser);
          if (!target) {
            emitBotReply('Uso: /unwarn @usuario');
            break;
          }
          if (target.warns > 0) {
            target.warns -= 1;
            target.warnHistory.shift();
          }
          this.addLog(event.source, 'Advertencia retirada', `@${member.username}`, `@${target.username}`, `Quedan ${target.warns}/${db.automod.maxWarns}`, 'info');
          emitBotReply(`Se retiró 1 advertencia a @${target.username} (${target.warns}/${db.automod.maxWarns}).`);
          break;
        }

        case '/mute': {
          if (!isAdmin) {
            emitBotReply('Permiso denegado: se requiere rol de administrador.');
            break;
          }
          const target = this.resolveTargetMember(args[0] ?? '', event.targetUser);
          if (!target) {
            emitBotReply('Uso: /mute @usuario [minutos]');
            break;
          }
          if (target.role === 'admin') {
            emitBotReply('No es posible silenciar a un administrador.');
            break;
          }
          const rawMins = event.targetUser ? args[0] : args[1];
          const mins = Math.max(1, Math.min(10080, Number.parseInt(rawMins ?? '', 10) || db.automod.muteDurationMin));
          target.status = 'muted';
          target.mutedUntil = new Date(Date.now() + mins * 60_000).toISOString();
          effects.push({ type: 'mute_user', targetUserId: target.id, durationMin: mins });
          this.addLog(event.source, `Silencio manual (${mins}m)`, `@${member.username}`, `@${target.username}`, 'Aplicado por comando /mute', 'warning');
          emitBotReply(`@${target.username} silenciado durante ${mins} minutos.`);
          break;
        }

        case '/unmute': {
          if (!isAdmin) {
            emitBotReply('Permiso denegado: se requiere rol de administrador.');
            break;
          }
          const target = this.resolveTargetMember(args[0] ?? '', event.targetUser);
          if (!target) {
            emitBotReply('Uso: /unmute @usuario');
            break;
          }
          target.status = 'verified';
          target.mutedUntil = null;
          effects.push({ type: 'unmute_user', targetUserId: target.id });
          this.addLog(event.source, 'Silencio levantado', `@${member.username}`, `@${target.username}`, 'Permisos de escritura restaurados', 'info');
          emitBotReply(`@${target.username} ya puede volver a escribir en el grupo.`);
          break;
        }

        case '/kick': {
          if (!isAdmin) {
            emitBotReply('Permiso denegado: se requiere rol de administrador.');
            break;
          }
          const target = this.resolveTargetMember(args[0] ?? '', event.targetUser);
          if (!target || target.role === 'admin') {
            emitBotReply('Especifica un miembro válido para expulsar.');
            break;
          }
          target.status = 'kicked';
          effects.push({ type: 'kick_user', targetUserId: target.id });
          this.addLog(event.source, 'Expulsión (/kick)', `@${member.username}`, `@${target.username}`, 'Expulsado del grupo privado', 'danger');
          emitBotReply(`@${target.username} fue expulsado del grupo.`);
          break;
        }

        case '/ban': {
          if (!isAdmin) {
            emitBotReply('Permiso denegado: se requiere rol de administrador.');
            break;
          }
          const target = this.resolveTargetMember(args[0] ?? '', event.targetUser);
          if (!target || target.role === 'admin') {
            emitBotReply('Especifica un miembro válido para banear.');
            break;
          }
          const reason = (event.targetUser ? args : args.slice(1)).join(' ').trim() || 'Baneo administrativo';
          target.status = 'banned';
          effects.push({ type: 'ban_user', targetUserId: target.id });
          this.addLog(event.source, 'Baneo (/ban)', `@${member.username}`, `@${target.username}`, reason, 'danger');
          emitBotReply(`@${target.username} ha sido baneado permanentemente. Motivo: ${reason}.`);
          break;
        }

        case '/unban': {
          if (!isAdmin) {
            emitBotReply('Permiso denegado: se requiere rol de administrador.');
            break;
          }
          const target = this.resolveTargetMember(args[0] ?? '', event.targetUser);
          if (!target) {
            emitBotReply('Uso: /unban @usuario');
            break;
          }
          target.status = 'verified';
          target.mutedUntil = null;
          effects.push({ type: 'unban_user', targetUserId: target.id });
          this.addLog(event.source, 'Desbaneo (/unban)', `@${member.username}`, `@${target.username}`, 'Restaurado en la lista de acceso', 'info');
          emitBotReply(`@${target.username} fue desbaneado y puede solicitar ingreso nuevamente.`);
          break;
        }

        case '/vip':
        case '/unvip': {
          if (!isAdmin) {
            emitBotReply('Permiso denegado: se requiere rol de administrador.');
            break;
          }
          const target = this.resolveTargetMember(args[0] ?? '', event.targetUser);
          if (!target || target.role === 'admin') {
            emitBotReply(`Uso: ${rawCmd} @usuario`);
            break;
          }
          const makeVip = rawCmd === '/vip';
          target.role = makeVip ? 'vip' : 'member';
          this.addLog(event.source, makeVip ? 'VIP asignado' : 'VIP retirado', `@${member.username}`, `@${target.username}`, `Rol actual: ${target.role}`, 'info');
          emitBotReply(`@${target.username} ahora tiene rol ${target.role.toUpperCase()}.`);
          break;
        }

        case '/lock':
        case '/unlock': {
          if (!isAdmin) {
            emitBotReply('Permiso denegado: se requiere rol de administrador.');
            break;
          }
          const lockState = rawCmd === '/lock';
          const targetType = (args[0] ?? '').toLowerCase();
          const validLocks: (keyof ContentLocks)[] = ['stickers', 'gifs', 'media', 'documents', 'voice', 'all'];
          if (targetType === 'links') {
            db.automod.antiLinksEnabled = lockState;
            this.addLog(event.source, lockState ? 'Bloqueo de enlaces' : 'Desbloqueo de enlaces', `@${member.username}`, 'AutoMod', `antiLinks=${lockState}`, 'info');
            emitBotReply(`Anti-Links ${lockState ? 'activado' : 'desactivado'}.`);
            break;
          }
          if (!validLocks.includes(targetType as keyof ContentLocks)) {
            emitBotReply('Tipos válidos: stickers, gifs, media, documents, voice, links, all.');
            break;
          }
          db.automod.locks[targetType as keyof ContentLocks] = lockState;
          this.addLog(event.source, `${lockState ? 'Bloqueo' : 'Desbloqueo'} ${targetType}`, `@${member.username}`, 'AutoMod · Locks', `Estado: ${lockState}`, 'info');
          emitBotReply(`${lockState ? 'Bloqueado' : 'Desbloqueado'}: ${targetType}.`);
          break;
        }

        case '/purge': {
          if (!isAdmin) {
            emitBotReply('Permiso denegado: se requiere rol de administrador.');
            break;
          }
          const count = Math.max(1, Math.min(50, Number.parseInt(args[0] ?? '5', 10) || 5));
          effects.push({ type: 'purge_messages', count });
          if (event.source === 'simulator') {
            const visible = db.simulatorMessages.filter((m) => !m.deleted);
            const toDelete = visible.slice(-Math.min(count + 1, visible.length));
            for (const m of toDelete) {
              if (m.senderRole !== 'system') m.deleted = true;
            }
          }
          this.addLog(event.source, `Limpieza (/purge ${count})`, `@${member.username}`, 'Chat', `Se limpiaron ${count} mensajes recientes`, 'info');
          emitBotReply(`Limpieza ejecutada (${count} mensajes).`);
          break;
        }

        case '/pin': {
          if (!isAdmin) {
            emitBotReply('Permiso denegado: se requiere rol de administrador.');
            break;
          }
          const textToPin = args.join(' ').trim();
          if (!textToPin) {
            emitBotReply('Uso: /pin <anuncio a fijar>');
            break;
          }
          effects.push({ type: 'pin_message', text: textToPin, pinned: true });
          if (event.source === 'simulator') {
            db.simulatorMessages.forEach((m) => {
              m.pinned = false;
            });
            this.pushSimulatorMessage({
              senderId: 'bot',
              senderName: 'CentinelaTG',
              senderUsername: 'CentinelaTG_bot',
              senderRole: 'bot',
              text: `Mensaje fijado: ${textToPin}`,
              messageType: 'text',
              pinned: true,
            });
          } else {
            emitBotReply(`Mensaje fijado: ${textToPin}`);
          }
          this.addLog(event.source, 'Mensaje fijado (/pin)', `@${member.username}`, 'Chat', textToPin.slice(0, 80), 'info');
          break;
        }

        case '/unpin': {
          if (!isAdmin) {
            emitBotReply('Permiso denegado: se requiere rol de administrador.');
            break;
          }
          effects.push({ type: 'unpin_message' });
          if (event.source === 'simulator') {
            db.simulatorMessages.forEach((m) => {
              m.pinned = false;
            });
          }
          this.addLog(event.source, 'Mensaje desfijado', `@${member.username}`, 'Chat', 'Anuncio retirado', 'info');
          emitBotReply('Se retiró el mensaje fijado.');
          break;
        }

        default: {
          emitBotReply(`Comando no reconocido (${rawCmd}). Usa /help para ver los comandos disponibles.`);
        }
      }
    }

    await store.save();
    return { effects, incomingMessage: simMsg };
  }

  async applyPanelMemberAction(
    memberId: string,
    action: 'warn' | 'unwarn' | 'mute' | 'unmute' | 'kick' | 'ban' | 'unban' | 'set_vip' | 'set_member' | 'approve',
    reason?: string
  ): Promise<{ member: MemberRecord; summary: string }> {
    const db = store.get();
    const member = db.members.find((m) => m.id === memberId);
    if (!member) {
      throw new Error('Miembro no encontrado.');
    }

    let summary = '';
    switch (action) {
      case 'warn': {
        const res = this.applyWarn('panel', member, reason || 'Advertencia desde el panel web', 'Panel Admin');
        summary = res.message;
        break;
      }
      case 'unwarn': {
        if (member.warns > 0) {
          member.warns -= 1;
          member.warnHistory.shift();
        }
        this.addLog('panel', 'Advertencia retirada', 'Panel Admin', `@${member.username}`, `Warns: ${member.warns}/${db.automod.maxWarns}`, 'info');
        summary = `Advertencia retirada a @${member.username}.`;
        break;
      }
      case 'mute': {
        const mins = db.automod.muteDurationMin;
        member.status = 'muted';
        member.mutedUntil = new Date(Date.now() + mins * 60_000).toISOString();
        this.addLog('panel', `Silencio (${mins}m)`, 'Panel Admin', `@${member.username}`, reason || 'Acción manual', 'warning');
        summary = `@${member.username} silenciado ${mins} min.`;
        break;
      }
      case 'unmute': {
        member.status = 'verified';
        member.mutedUntil = null;
        this.addLog('panel', 'Silencio levantado', 'Panel Admin', `@${member.username}`, 'Restaurado manualmente', 'info');
        summary = `@${member.username} restaurado.`;
        break;
      }
      case 'kick': {
        member.status = 'kicked';
        this.addLog('panel', 'Expulsión', 'Panel Admin', `@${member.username}`, reason || 'Expulsión manual', 'danger');
        summary = `@${member.username} expulsado.`;
        break;
      }
      case 'ban': {
        member.status = 'banned';
        this.addLog('panel', 'Baneo', 'Panel Admin', `@${member.username}`, reason || 'Baneo manual', 'danger');
        summary = `@${member.username} baneado.`;
        break;
      }
      case 'unban':
      case 'approve': {
        member.status = 'verified';
        member.mutedUntil = null;
        this.addLog('panel', action === 'approve' ? 'Acceso aprobado' : 'Desbaneo', 'Panel Admin', `@${member.username}`, 'Estado verificado', 'info');
        summary = `@${member.username} verificado.`;
        break;
      }
      case 'set_vip': {
        if (member.role !== 'admin') member.role = 'vip';
        this.addLog('panel', 'VIP asignado', 'Panel Admin', `@${member.username}`, 'Exento de filtros estándar', 'info');
        summary = `@${member.username} promovido a VIP.`;
        break;
      }
      case 'set_member': {
        if (member.role !== 'admin') member.role = 'member';
        this.addLog('panel', 'Rol miembro', 'Panel Admin', `@${member.username}`, 'Permisos estándar', 'info');
        summary = `@${member.username} ahora es miembro estándar.`;
        break;
      }
    }

    await store.save();
    return { member, summary };
  }
}

export const botEngine = new ModerationEngine();
