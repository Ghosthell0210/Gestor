import JSZip from 'jszip';
import { store } from './storage.ts';
import { buildTelegramCommandScopes } from '../shared/commandsCatalog.ts';

function generateStandaloneBotJs(): string {
  const baseScopes = buildTelegramCommandScopes([]);
  const memberJson = JSON.stringify(baseScopes.memberCommands);
  const adminJson = JSON.stringify(baseScopes.adminCommands);
  return `import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Bot, InlineKeyboard } from 'grammy';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!TOKEN) {
  console.error('Falta la variable de entorno TELEGRAM_BOT_TOKEN.');
  process.exit(1);
}

const ADMIN_IDS = new Set(
  (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID?.trim();
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.resolve(DATA_DIR, 'bot-db.json');

let db = null;
let writeQueue = Promise.resolve();
let saveTimer = null;

const floodTracker = new Map();
const slowTracker = new Map();
const xpCooldown = new Map();
const gameCooldown = new Map();
const repCooldown = new Map();
const pendingCaptchas = new Map();
const activeTrivias = new Map();
const activeDuels = new Map();
let joinTracker = [];
let activeHangman = null;
let activeMathBlitz = null;

function uid(p) {
  return p + '-' + crypto.randomBytes(4).toString('hex');
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function calcLevel(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 45)) + 1;
}

function escapeHtml(text = '') {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTemplate(tpl, vars) {
  return String(tpl)
    .replaceAll('{nombre}', vars.nombre)
    .replaceAll('{usuario}', vars.usuario)
    .replaceAll('{grupo}', vars.grupo)
    .replaceAll('{warns}', String(vars.warns ?? 0));
}

async function loadDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const raw = await fs.readFile(DB_PATH, 'utf-8');
  db = JSON.parse(raw);
  db.security = db.security || { antiRaidEnabled: true, raidJoinThreshold: 5, raidWindowSec: 20, raidModeActive: false, raidAction: 'manual_approval', slowModeSec: 0, alertOnRaid: true };
  db.entertainment = db.entertainment || { gamesEnabled: true, gameCooldownSec: 10, quietHoursEnabled: false, quietStartHour: 1, quietEndHour: 7, currencyName: 'Créditos', xpPerMessage: 12, coinsPerMessage: 4, dailyRewardCoins: 120, chestCostCoins: 80, shopItems: [], triviaQuestions: [], hangmanWords: ['TELEGRAM', 'ALTARE'], activeGiveaways: [], activePolls: [], activeCoinRains: [] };
}

function pruneDbCollections() {
  if (!db) return;
  if (Array.isArray(db.auditLogs) && db.auditLogs.length > 200) db.auditLogs.length = 200;
  if (db.entertainment.activeGiveaways.length > 30) db.entertainment.activeGiveaways = db.entertainment.activeGiveaways.slice(-30);
  if (db.entertainment.activePolls.length > 20) db.entertainment.activePolls = db.entertainment.activePolls.slice(-20);
  if (db.entertainment.activeCoinRains.length > 15) db.entertainment.activeCoinRains = db.entertainment.activeCoinRains.slice(-15);
}

function flushDbNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pruneDbCollections();
  const snapshot = JSON.stringify(db, null, 2);
  writeQueue = writeQueue.then(async () => {
    const tmp = DB_PATH + '.tmp';
    await fs.writeFile(tmp, snapshot, 'utf-8');
    await fs.rename(tmp, DB_PATH);
  });
  return writeQueue;
}

function scheduleSaveDb() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushDbNow().catch(() => undefined);
  }, 2500);
}

function ensureMember(from, isAdmin = false) {
  const id = String(from.id);
  const today = todayKey();
  let member = db.members.find((m) => m.id === id);
  if (!member) {
    member = {
      id,
      name: [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Usuario',
      username: from.username || 'user_' + id,
      role: isAdmin ? 'admin' : 'member',
      status: 'verified',
      warns: 0,
      warnHistory: [],
      mutedUntil: null,
      joinedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      messageCount: 0,
      xp: 0,
      level: 1,
      coins: 50,
      reputation: 0,
      dailyStreak: 0,
      lastDailyAt: null,
      badges: [],
      dailyMissions: { date: today, messagesSent: 0, triviaWon: 0, repGiven: 0, claimed: false },
    };
    db.members.push(member);
  } else {
    member.lastActiveAt = new Date().toISOString();
    if (isAdmin) member.role = 'admin';
    if (!member.dailyMissions || member.dailyMissions.date !== today) {
      member.dailyMissions = { date: today, messagesSent: 0, triviaWon: 0, repGiven: 0, claimed: false };
    }
  }
  return member;
}

function resolveMember(query, replyFrom) {
  if (replyFrom) return ensureMember(replyFrom);
  const clean = String(query || '').trim().replace(/^@/, '').toLowerCase();
  if (!clean) return null;
  return db.members.find((m) => m.id === clean || m.username.toLowerCase() === clean) || null;
}

async function isAdminCtx(ctx, userId) {
  if (ADMIN_IDS.has(String(userId))) return true;
  if (!ctx.chat || ctx.chat.type === 'private') return false;
  try {
    const m = await ctx.getChatMember(Number(userId));
    return m.status === 'administrator' || m.status === 'creator';
  } catch {
    return false;
  }
}

function isQuietHours() {
  const ent = db.entertainment;
  if (!ent.quietHoursEnabled) return false;
  const h = new Date().getHours();
  if (ent.quietStartHour === ent.quietEndHour) return false;
  return ent.quietStartHour < ent.quietEndHour
    ? h >= ent.quietStartHour && h < ent.quietEndHour
    : h >= ent.quietStartHour || h < ent.quietEndHour;
}

function checkGameCooldown(member, isAdmin) {
  const ent = db.entertainment;
  if (!ent.gamesEnabled && !isAdmin) return 'Los juegos están pausados por administración.';
  if (!isAdmin && isQuietHours()) return 'Horario silencioso activo. Los juegos volverán más tarde.';
  if (!isAdmin && ent.gameCooldownSec > 0) {
    const now = Date.now();
    const last = gameCooldown.get(member.id) || 0;
    const wait = Math.ceil((last + ent.gameCooldownSec * 1000 - now) / 1000);
    if (wait > 0) return \`Espera \${wait}s antes de usar otro juego.\`;
    gameCooldown.set(member.id, now);
  }
  return null;
}

const URL_REGEX = /(?:https?:\\/\\/|www\\.|t\\.me\\/|telegram\\.me\\/)([^\\s/$.?#].[^\\s]*)/gi;
const BASE_MEMBER_COMMANDS = ${memberJson};
const BASE_ADMIN_COMMANDS = ${adminJson};
const MAGIC_8_BALL = [
  'Sí, totalmente seguro.',
  'Todo apunta a que sí.',
  'Probablemente sí, pero ten cautela.',
  'Difícil de predecir ahora mismo.',
  'Pregunta de nuevo más tarde.',
  'Mejor no contar con ello.',
  'Las señales dicen que no.',
];
const bot = new Bot(TOKEN);

bot.catch((err) => {
  console.error('Error en bot:', err.error);
});

async function registerTelegramCommands() {
  try {
    const validCmd = /^[a-z][a-z0-9_]{0,31}$/;
    const memberCmds = [...BASE_MEMBER_COMMANDS];
    const adminCmds = [...BASE_ADMIN_COMMANDS];
    const seenM = new Set(memberCmds.map((c) => c.command));
    const seenA = new Set(adminCmds.map((c) => c.command));
    for (const custom of db.customCommands || []) {
      if (!custom.enabled || !custom.trigger || !custom.trigger.startsWith('/')) continue;
      const clean = custom.trigger.slice(1).toLowerCase();
      if (!validCmd.test(clean)) continue;
      const desc = 'Comando personalizado: ' + String(custom.response || '').replace(/\\s+/g, ' ').slice(0, 80);
      if (!custom.adminOnly && !seenM.has(clean)) {
        seenM.add(clean);
        memberCmds.push({ command: clean, description: desc });
      }
      if (!seenA.has(clean)) {
        seenA.add(clean);
        adminCmds.push({ command: clean, description: desc });
      }
    }
    await bot.api.setMyCommands(memberCmds.slice(0, 100));
    await bot.api.setMyCommands(memberCmds.slice(0, 100), { scope: { type: 'all_group_chats' } });
    await bot.api.setMyCommands(adminCmds.slice(0, 100), { scope: { type: 'all_chat_administrators' } });
    console.log('Menú de comandos / registrado en Telegram (' + adminCmds.length + ' comandos).');
  } catch (err) {
    console.warn('No se pudo registrar el menú de comandos:', err?.message || err);
  }
}

bot.on('chat_join_request', async (ctx) => {
  const user = ctx.chatJoinRequest.from;
  const userId = String(user.id);
  const member = ensureMember(user, ADMIN_IDS.has(userId));

  if (db.security.antiRaidEnabled && !ADMIN_IDS.has(userId)) {
    const now = Date.now();
    joinTracker = joinTracker.filter((t) => now - t <= db.security.raidWindowSec * 1000);
    joinTracker.push(now);
    if (joinTracker.length >= db.security.raidJoinThreshold && !db.security.raidModeActive) {
      db.security.raidModeActive = true;
      if (db.security.raidAction === 'lock_all') db.automod.locks.all = true;
      await ctx.api.sendMessage(ctx.chat.id, escapeHtml('ALERTA ANTI-RAID: ráfaga de ingresos detectada. Modo emergencia activado. Usa /raid off cuando sea seguro.'), { parse_mode: 'HTML' }).catch(() => undefined);
    }
  }

  if (db.security.raidModeActive || db.settings.approveJoinRequests === 'manual') {
    const kb = new InlineKeyboard().text('Aprobar', 'approve_join:' + userId).text('Rechazar', 'decline_join:' + userId);
    member.status = 'pending_approval';
    await flushDbNow();
    await ctx.api.sendMessage(ctx.chat.id, escapeHtml(\`Solicitud de \${member.name} (@\${member.username}) en espera.\`), { parse_mode: 'HTML', reply_markup: kb });
    return;
  }

  await ctx.approveChatJoinRequest(user.id).catch(() => undefined);
  await handleNewMemberChallenge(ctx, user, member);
});

bot.on('message:new_chat_members', async (ctx) => {
  if (db.settings.cleanServiceMessages) await ctx.deleteMessage().catch(() => undefined);
  for (const user of ctx.message.new_chat_members) {
    if (user.is_bot) continue;
    const member = ensureMember(user, ADMIN_IDS.has(String(user.id)));
    await handleNewMemberChallenge(ctx, user, member);
  }
});

bot.on('message:left_chat_member', async (ctx) => {
  if (db.settings.cleanServiceMessages) await ctx.deleteMessage().catch(() => undefined);
});

async function handleNewMemberChallenge(ctx, user, member) {
  if (db.settings.captchaMode === 'off' || db.settings.approveJoinRequests === 'auto_all') {
    member.status = 'verified';
    await flushDbNow();
    if (db.settings.welcomeEnabled) {
      const kb = new InlineKeyboard();
      db.settings.welcomeButtons.forEach((b, i) => { kb.url(b.text, b.url); if (i % 2 === 1) kb.row(); });
      await ctx.reply(escapeHtml(formatTemplate(db.settings.welcomeMessage, { nombre: member.name, usuario: '@' + member.username, grupo: db.settings.groupName })), { parse_mode: 'HTML', reply_markup: db.settings.welcomeButtons.length ? kb : undefined });
    }
    return;
  }

  member.status = 'pending_captcha';
  await ctx.restrictChatMember(user.id, { can_send_messages: false }).catch(() => undefined);

  const kb = new InlineKeyboard();
  let prompt = '';
  if (db.settings.captchaMode === 'math') {
    const a = 3 + Math.floor(Math.random() * 7);
    const b = 2 + Math.floor(Math.random() * 7);
    const ans = String(a + b);
    pendingCaptchas.set(member.id, ans);
    [ans, String(a + b + 2), String(Math.max(1, a + b - 1))].sort(() => Math.random() - 0.5).forEach((o) => kb.text('Resultado: ' + o, 'verify:' + member.id + ':' + o));
    prompt = \`Verificación para \${member.name} (@\${member.username}): resuelve \${a} + \${b} en \${db.settings.captchaTimeoutSec}s.\`;
  } else {
    pendingCaptchas.set(member.id, 'ok');
    kb.text('Verificar que soy humano', 'verify:' + member.id + ':ok');
    prompt = \`Bienvenido/a \${member.name}. Pulsa el botón en \${db.settings.captchaTimeoutSec}s para escribir en el grupo.\`;
  }

  await flushDbNow();
  const sent = await ctx.reply(escapeHtml(prompt), { parse_mode: 'HTML', reply_markup: kb });
  setTimeout(async () => {
    if (pendingCaptchas.has(member.id)) {
      pendingCaptchas.delete(member.id);
      await ctx.api.deleteMessage(ctx.chat.id, sent.message_id).catch(() => undefined);
      await ctx.banChatMember(user.id).catch(() => undefined);
      await ctx.unbanChatMember(user.id).catch(() => undefined);
    }
  }, db.settings.captchaTimeoutSec * 1000);
}

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const callerId = String(ctx.from.id);
  const isAdmin = await isAdminCtx(ctx, callerId);
  const actor = ensureMember(ctx.from, isAdmin);
  const currency = db.entertainment.currencyName;

  if (data.startsWith('verify:')) {
    const [, targetId, ans] = data.split(':');
    if (callerId !== targetId && !isAdmin) return ctx.answerCallbackQuery({ text: 'Botón de otro miembro.', show_alert: true });
    const expected = pendingCaptchas.get(targetId);
    if (expected && expected !== ans) return ctx.answerCallbackQuery({ text: 'Respuesta incorrecta.', show_alert: true });
    pendingCaptchas.delete(targetId);
    const member = db.members.find((m) => m.id === targetId);
    if (member) member.status = 'verified';
    await ctx.restrictChatMember(Number(targetId), { can_send_messages: true, can_send_polls: true, can_send_other_messages: true, can_add_web_page_previews: true }).catch(() => undefined);
    await flushDbNow();
    await ctx.answerCallbackQuery({ text: 'Verificado correctamente.' });
    await ctx.deleteMessage().catch(() => undefined);
    return;
  }

  if (data.startsWith('approve_join:') || data.startsWith('decline_join:')) {
    if (!isAdmin) return ctx.answerCallbackQuery({ text: 'Solo administradores.', show_alert: true });
    const [act, targetId] = data.split(':');
    if (act === 'approve_join') {
      await ctx.approveChatJoinRequest(Number(targetId)).catch(() => undefined);
      await ctx.answerCallbackQuery({ text: 'Ingreso aprobado.' });
    } else {
      await ctx.declineChatJoinRequest(Number(targetId)).catch(() => undefined);
      await ctx.answerCallbackQuery({ text: 'Ingreso rechazado.' });
    }
    await ctx.deleteMessage().catch(() => undefined);
    return;
  }

  if (data.startsWith('trivia:')) {
    const [, sid, rawIdx] = data.split(':');
    const session = activeTrivias.get(sid);
    if (!session || session.solved) return ctx.answerCallbackQuery({ text: 'Trivia ya finalizada.' });
    if (Number(rawIdx) === session.q.correctIndex) {
      session.solved = true;
      actor.coins += session.q.rewardCoins;
      actor.xp += session.q.rewardXp;
      actor.level = calcLevel(actor.xp);
      actor.dailyMissions.triviaWon += 1;
      await flushDbNow();
      await ctx.answerCallbackQuery({ text: '¡Correcto!' });
      await ctx.reply(escapeHtml(\`¡@\${actor.username} acertó la trivia! +\${session.q.rewardCoins} \${currency} y +\${session.q.rewardXp} XP.\`), { parse_mode: 'HTML' });
    } else {
      await ctx.answerCallbackQuery({ text: 'Incorrecto.' });
    }
    return;
  }

  if (data.startsWith('duel_accept:') || data.startsWith('duel_decline:')) {
    const [act, did] = data.split(':');
    const duel = activeDuels.get(did);
    if (!duel) return ctx.answerCallbackQuery({ text: 'Duelo expirado.' });
    if (actor.id !== duel.opponentId && !isAdmin) return ctx.answerCallbackQuery({ text: 'No eres el retado.', show_alert: true });
    activeDuels.delete(did);
    if (act === 'duel_decline') {
      await ctx.answerCallbackQuery({ text: 'Rechazado.' });
      return ctx.reply(escapeHtml(\`@\${actor.username} rechazó el duelo.\`), { parse_mode: 'HTML' });
    }
    const ch = db.members.find((m) => m.id === duel.challengerId);
    const op = db.members.find((m) => m.id === duel.opponentId);
    if (!ch || !op || ch.coins < duel.wager || op.coins < duel.wager) return ctx.answerCallbackQuery({ text: 'Saldo insuficiente.' });
    const winner = crypto.randomInt(0, 2) === 0 ? ch : op;
    const loser = winner.id === ch.id ? op : ch;
    winner.coins += duel.wager;
    loser.coins -= duel.wager;
    await flushDbNow();
    await ctx.answerCallbackQuery({ text: '¡Duelo resuelto!' });
    return ctx.reply(escapeHtml(\`¡@\${winner.username} ganó el duelo contra @\${loser.username} por \${duel.wager} \${currency}!\`), { parse_mode: 'HTML' });
  }

  if (data.startsWith('rain:')) {
    const [, rainId] = data.split(':');
    const rain = db.entertainment.activeCoinRains.find((r) => r.id === rainId);
    if (!rain || rain.claimedBy.includes(actor.id) || rain.claimedBy.length >= rain.maxClaims) {
      return ctx.answerCallbackQuery({ text: 'No disponible o ya reclamado.' });
    }
    const left = rain.maxClaims - rain.claimedBy.length;
    const share = left === 1 ? rain.remainingCoins : Math.floor(rain.totalCoins / rain.maxClaims);
    rain.remainingCoins = Math.max(0, rain.remainingCoins - share);
    rain.claimedBy.push(actor.id);
    actor.coins += share;
    await flushDbNow();
    await ctx.answerCallbackQuery({ text: \`+\${share} \${currency}\` });
    return ctx.reply(escapeHtml(\`@\${actor.username} reclamó +\${share} \${currency} de la lluvia (\${rain.claimedBy.length}/\${rain.maxClaims}).\`), { parse_mode: 'HTML' });
  }

  if (data.startsWith('giveaway:')) {
    const [, gid] = data.split(':');
    const g = db.entertainment.activeGiveaways.find((x) => x.id === gid);
    if (!g || g.status !== 'active') return ctx.answerCallbackQuery({ text: 'Sorteo finalizado.' });
    if (g.participants.includes(actor.id)) return ctx.answerCallbackQuery({ text: 'Ya participas.' });
    g.participants.push(actor.id);
    await flushDbNow();
    return ctx.answerCallbackQuery({ text: '¡Inscrito en el sorteo!' });
  }

  if (data.startsWith('poll:')) {
    const [, pid, idx] = data.split(':');
    const poll = db.entertainment.activePolls.find((p) => p.id === pid);
    const opt = poll?.options[Number(idx)];
    if (!poll || !opt) return ctx.answerCallbackQuery({ text: 'Encuesta no encontrada.' });
    poll.options.forEach((o) => { o.votes = o.votes.filter((id) => id !== actor.id); });
    opt.votes.push(actor.id);
    await flushDbNow();
    return ctx.answerCallbackQuery({ text: 'Voto registrado: ' + opt.text });
  }
});

bot.on('message', async (ctx) => {
  if (!ctx.from || ctx.from.is_bot) return;
  const userId = String(ctx.from.id);
  const isAdmin = await isAdminCtx(ctx, userId);
  const member = ensureMember(ctx.from, isAdmin);
  const isVip = member.role === 'vip';
  const text = ctx.message.text ?? ctx.message.caption ?? '';
  const currency = db.entertainment.currencyName;

  if (!isAdmin && !isVip) {
    if (db.security.slowModeSec > 0) {
      const now = Date.now();
      const last = slowTracker.get(userId) || 0;
      if (now - last < db.security.slowModeSec * 1000) {
        await ctx.deleteMessage().catch(() => undefined);
        return;
      }
      slowTracker.set(userId, now);
    }

    const locks = db.automod.locks;
    const isLocked =
      locks.all ||
      (locks.stickers && Boolean(ctx.message.sticker)) ||
      (locks.gifs && Boolean(ctx.message.animation)) ||
      (locks.media && Boolean(ctx.message.photo || ctx.message.video)) ||
      (locks.documents && Boolean(ctx.message.document)) ||
      (locks.voice && Boolean(ctx.message.voice || ctx.message.audio));
    if (isLocked) { await ctx.deleteMessage().catch(() => undefined); return; }

    if (db.automod.antiFloodEnabled) {
      const now = Date.now();
      const list = (floodTracker.get(userId) ?? []).filter((t) => now - t <= db.automod.floodWindowSec * 1000);
      list.push(now);
      floodTracker.set(userId, list);
      if (list.length > db.automod.floodMaxMessages) {
        floodTracker.set(userId, []);
        await ctx.deleteMessage().catch(() => undefined);
        const until = Math.floor(Date.now() / 1000) + db.automod.muteDurationMin * 60;
        await ctx.restrictChatMember(ctx.from.id, { can_send_messages: false }, { until_date: until }).catch(() => undefined);
        await ctx.reply(escapeHtml(\`@\${member.username} silenciado \${db.automod.muteDurationMin}m por flood.\`), { parse_mode: 'HTML' });
        return;
      }
    }

    if (db.automod.antiLinksEnabled) {
      const isFwd = db.automod.blockForwards && 'forward_origin' in ctx.message && Boolean(ctx.message.forward_origin);
      const urls = text.match(URL_REGEX) ?? [];
      const badUrl = urls.some((u) => {
        const l = u.toLowerCase();
        if (db.automod.blockTelegramLinks && (l.includes('t.me/') || l.includes('telegram.me/'))) return true;
        return !db.automod.allowedDomains.some((d) => l.includes(d.toLowerCase()));
      });
      if (isFwd || badUrl) {
        await ctx.deleteMessage().catch(() => undefined);
        await ctx.reply(escapeHtml(\`Enlace o reenvío no permitido de @\${member.username}.\`), { parse_mode: 'HTML' });
        return;
      }
    }

    if (db.automod.badWordsEnabled) {
      const lower = text.toLowerCase();
      const hit = db.automod.badWords.find((w) => w && lower.includes(w.toLowerCase()));
      if (hit) {
        await ctx.deleteMessage().catch(() => undefined);
        await ctx.reply(escapeHtml(\`Mensaje de @\${member.username} eliminado por filtro.\`), { parse_mode: 'HTML' });
        return;
      }
    }
  }

  // Award XP & Coins
  member.messageCount += 1;
  member.dailyMissions.messagesSent += 1;
  const now = Date.now();
  if (now - (xpCooldown.get(userId) || 0) >= 15000) {
    xpCooldown.set(userId, now);
    const prevLvl = member.level;
    member.xp += db.entertainment.xpPerMessage;
    member.coins += db.entertainment.coinsPerMessage;
    member.level = calcLevel(member.xp);
    if (member.level > prevLvl) {
      await ctx.reply(escapeHtml(\`¡@\${member.username} subió al Nivel \${member.level}!\`), { parse_mode: 'HTML' });
    }
  }

  const trimmed = text.trim();

  // Active Math Blitz / Hangman guesses
  if (activeMathBlitz && /^-?\\d+$/.test(trimmed) && Number(trimmed) === activeMathBlitz.answer) {
    const b = activeMathBlitz;
    activeMathBlitz = null;
    member.coins += 50;
    member.xp += 35;
    member.level = calcLevel(member.xp);
    await flushDbNow();
    return ctx.reply(escapeHtml(\`¡Correcto @\${member.username}! Era \${b.answer}. +50 \${currency} y +35 XP.\`), { parse_mode: 'HTML' });
  }

  if (activeHangman && !trimmed.startsWith('/') && !trimmed.startsWith('!')) {
    const norm = trimmed.toUpperCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
    if (/^[A-ZÑ]$/.test(norm) || norm === activeHangman.word) {
      const hm = activeHangman;
      if (norm === hm.word) {
        activeHangman = null;
        member.coins += 65; member.xp += 45; member.level = calcLevel(member.xp);
        await flushDbNow();
        return ctx.reply(escapeHtml(\`¡@\${member.username} adivinó "\${hm.word}"! +65 \${currency} y +45 XP.\`), { parse_mode: 'HTML' });
      }
      hm.guessed.add(norm);
      if (hm.word.includes(norm)) {
        if (hm.word.split('').every((c) => hm.guessed.has(c))) {
          activeHangman = null;
          member.coins += 65; member.xp += 45;
          await flushDbNow();
          return ctx.reply(escapeHtml(\`¡@\${member.username} completó "\${hm.word}"! +65 \${currency}.\`), { parse_mode: 'HTML' });
        }
      } else {
        hm.wrong += 1;
        if (hm.wrong >= 6) {
          activeHangman = null;
          return ctx.reply(escapeHtml(\`Fin del ahorcado. La palabra era "\${hm.word}".\`), { parse_mode: 'HTML' });
        }
      }
      const view = hm.word.split('').map((c) => (hm.guessed.has(c) ? c : '_')).join(' ');
      return ctx.reply(escapeHtml(\`\${view} (Fallos: \${hm.wrong}/6)\`), { parse_mode: 'HTML' });
    }
  }

  if (trimmed.startsWith('/') || trimmed.startsWith('!') || trimmed.toLowerCase().startsWith('+rep')) {
    const [rawCmd, ...args] = trimmed.split(/\\s+/);
    const cmd = rawCmd.split('@')[0].toLowerCase();

    const custom = db.customCommands.find((c) => c.enabled && c.trigger.toLowerCase() === cmd);
    if (custom && (!custom.adminOnly || isAdmin)) {
      if (custom.deleteTrigger) await ctx.deleteMessage().catch(() => undefined);
      await ctx.reply(escapeHtml(formatTemplate(custom.response, { nombre: member.name, usuario: '@' + member.username, grupo: db.settings.groupName, warns: member.warns + '/' + db.automod.maxWarns })), { parse_mode: 'HTML' });
      scheduleSaveDb();
      return;
    }

    if (cmd === '/rules') {
      await ctx.reply(escapeHtml(db.settings.rulesText), { parse_mode: 'HTML' });
    } else if (cmd === '/help' || cmd === '/start') {
      const mList = 'Grupo: /rules, /info, /staff, /warns, /report\\nEntretenimiento: /rank, /top, /daily, /misiones, /gracias, /pay, /shop, /buy, /cofre, /trivia, /ahorcado, /calculo, /dado, /ruleta, /ppt, /duelo, /lluvia, /encuesta, /bola8, /ship';
      const aList = isAdmin ? '\\nAdmin: /warn, /unwarn, /mute, /unmute, /kick, /ban, /unban, /vip, /unvip, /lock, /unlock, /purge, /pin, /unpin, /setrules, /setwelcome, /raid, /slowmode, /games, /sorteo, /fin_sorteo' : '';
      await ctx.reply(escapeHtml(mList + aList), { parse_mode: 'HTML' });
    } else if (cmd === '/info') {
      const t = args[0] || ctx.message.reply_to_message?.from ? resolveMember(args[0], ctx.message.reply_to_message?.from) : member;
      if (!t) return ctx.reply('Usuario no encontrado.');
      await ctx.reply(escapeHtml(\`\${t.name} (@\${t.username}) · Rol: \${t.role.toUpperCase()} · Nv.\${t.level} (\${t.xp} XP) · \${t.coins} \${currency} · Warns: \${t.warns}/\${db.automod.maxWarns}\`), { parse_mode: 'HTML' });
    } else if (cmd === '/staff') {
      const admins = db.members.filter((m) => m.role === 'admin').map((m) => '@' + m.username);
      const vips = db.members.filter((m) => m.role === 'vip').map((m) => '@' + m.username);
      await ctx.reply(escapeHtml(\`Admins: \${admins.join(', ') || 'Sin asignar'}\\nVIPs: \${vips.join(', ') || 'Ninguno'}\`), { parse_mode: 'HTML' });
    } else if (cmd === '/warns') {
      const t = args[0] || ctx.message.reply_to_message?.from ? resolveMember(args[0], ctx.message.reply_to_message?.from) : member;
      if (!t) return ctx.reply('Usuario no encontrado.');
      await ctx.reply(escapeHtml(\`@\${t.username} tiene \${t.warns}/\${db.automod.maxWarns} advertencias.\`), { parse_mode: 'HTML' });
    } else if (cmd === '/report') {
      const reason = args.join(' ').trim() || 'Solicitud de revisión';
      await ctx.reply(escapeHtml(\`Reporte enviado por @\${member.username}: "\${reason}".\`), { parse_mode: 'HTML' });
    } else if (cmd === '/setrules' && isAdmin) {
      const nextRules = args.join(' ').trim();
      if (!nextRules) return ctx.reply('Uso: /setrules <texto>');
      db.settings.rulesText = nextRules;
      await flushDbNow();
      await ctx.reply('Normas actualizadas.');
    } else if (cmd === '/setwelcome' && isAdmin) {
      const nextWelcome = args.join(' ').trim();
      if (!nextWelcome) return ctx.reply('Uso: /setwelcome <texto>');
      db.settings.welcomeMessage = nextWelcome;
      await flushDbNow();
      await ctx.reply('Bienvenida actualizada.');
    } else if (cmd === '/raid' && isAdmin) {
      const m = (args[0] || '').toLowerCase();
      if (m === 'on' || m === 'off') {
        db.security.raidModeActive = m === 'on';
        if (db.security.raidAction === 'lock_all') db.automod.locks.all = m === 'on';
        await flushDbNow();
        await ctx.reply('Modo Anti-Raid: ' + (db.security.raidModeActive ? 'ACTIVO' : 'Inactivo'));
      } else {
        await ctx.reply('Uso: /raid on | off');
      }
    } else if (cmd === '/slowmode' && isAdmin) {
      db.security.slowModeSec = Math.max(0, Math.min(300, Number.parseInt(args[0] || '0', 10) || 0));
      await flushDbNow();
      await ctx.reply(\`Modo lento fijado en \${db.security.slowModeSec}s.\`);
    } else if (cmd === '/games' && isAdmin) {
      const m = (args[0] || '').toLowerCase();
      if (m === 'on' || m === 'off') {
        db.entertainment.gamesEnabled = m === 'on';
        await flushDbNow();
        await ctx.reply('Juegos ' + (db.entertainment.gamesEnabled ? 'activados' : 'pausados'));
      } else {
        await ctx.reply('Uso: /games on | off');
      }
    } else if (cmd === '/rank' || cmd === '/perfil' || cmd === '/balance') {
      await ctx.reply(escapeHtml(\`@\${member.username} · Nivel \${member.level} (\${member.xp} XP) · \${member.coins} \${currency} · +\${member.reputation} rep\`), { parse_mode: 'HTML' });
    } else if (cmd === '/top') {
      const sorted = [...db.members].sort((a, b) => b.xp - a.xp).slice(0, 5);
      await ctx.reply(escapeHtml('Top XP:\\n' + sorted.map((m, i) => \`\${i + 1}. @\${m.username} · Nv.\${m.level} (\${m.xp} XP)\`).join('\\n')), { parse_mode: 'HTML' });
    } else if (cmd === '/daily') {
      const last = member.lastDailyAt ? new Date(member.lastDailyAt).getTime() : 0;
      if (now - last < 20 * 3600000) return ctx.reply('Ya reclamaste tu recompensa diaria.');
      member.dailyStreak = now - last < 48 * 3600000 ? member.dailyStreak + 1 : 1;
      member.lastDailyAt = new Date(now).toISOString();
      const total = db.entertainment.dailyRewardCoins + Math.min(100, (member.dailyStreak - 1) * 15);
      member.coins += total; member.xp += 25; member.level = calcLevel(member.xp);
      await flushDbNow();
      await ctx.reply(escapeHtml(\`+@\${member.username}: +\${total} \${currency} (racha \${member.dailyStreak}d).\`), { parse_mode: 'HTML' });
    } else if (cmd === '/misiones') {
      const m = member.dailyMissions;
      if (m.messagesSent >= 10 && m.triviaWon >= 1 && m.repGiven >= 1 && !m.claimed) {
        m.claimed = true; member.coins += 150; member.xp += 60; member.level = calcLevel(member.xp);
        await flushDbNow();
        return ctx.reply(escapeHtml(\`¡Misiones completadas @\${member.username}! +150 \${currency} y +60 XP.\`), { parse_mode: 'HTML' });
      }
      await ctx.reply(escapeHtml(\`Misiones: Msgs \${Math.min(10, m.messagesSent)}/10 · Trivia \${Math.min(1, m.triviaWon)}/1 · /gracias \${Math.min(1, m.repGiven)}/1\`), { parse_mode: 'HTML' });
    } else if (cmd === '/gracias' || cmd === '+rep') {
      const target = resolveMember(args[0], ctx.message.reply_to_message?.from);
      if (!target || target.id === member.id) return ctx.reply('Uso: /gracias @usuario');
      if (now - (repCooldown.get(userId) || 0) < 120000) return ctx.reply('Espera un momento antes de dar otro +rep.');
      repCooldown.set(userId, now);
      target.reputation += 1; target.coins += 15; member.dailyMissions.repGiven += 1;
      await flushDbNow();
      await ctx.reply(escapeHtml(\`@\${member.username} dio +1 Rep a @\${target.username}.\`), { parse_mode: 'HTML' });
    } else if (cmd === '/pay') {
      const target = resolveMember(args[0], ctx.message.reply_to_message?.from);
      const amt = Number.parseInt((ctx.message.reply_to_message?.from ? args[0] : args[1]) || '0', 10) || 0;
      if (!target || target.id === member.id || amt <= 0) return ctx.reply('Uso: /pay @usuario <cantidad>');
      if (member.coins < amt) return ctx.reply('Saldo insuficiente.');
      member.coins -= amt; target.coins += amt;
      await flushDbNow();
      await ctx.reply(escapeHtml(\`@\${member.username} transfirió \${amt} \${currency} a @\${target.username}.\`), { parse_mode: 'HTML' });
    } else if (cmd === '/shop') {
      const items = db.entertainment.shopItems.filter((i) => i.enabled);
      await ctx.reply(escapeHtml(items.map((i, idx) => \`\${idx + 1}. \${i.title} (\${i.price} \${currency})\`).join('\\n') || 'Tienda vacía.'), { parse_mode: 'HTML' });
    } else if (cmd === '/buy') {
      const items = db.entertainment.shopItems.filter((i) => i.enabled);
      const item = items[(Number.parseInt(args[0] || '0', 10) || 0) - 1];
      if (!item || member.coins < item.price) return ctx.reply('Artículo inválido o saldo insuficiente.');
      member.coins -= item.price;
      if (item.effect === 'grant_vip') member.role = 'vip';
      if (item.effect === 'remove_warn' && member.warns > 0) member.warns -= 1;
      if (item.effect === 'badge' && item.badgeLabel && !member.badges.includes(item.badgeLabel)) member.badges.push(item.badgeLabel);
      await flushDbNow();
      await ctx.reply(escapeHtml(\`Compraste "\${item.title}".\`), { parse_mode: 'HTML' });
    } else if (cmd === '/cofre') {
      const errMsg = checkGameCooldown(member, isAdmin);
      if (errMsg) return ctx.reply(errMsg);
      const cost = db.entertainment.chestCostCoins || 80;
      if (member.coins < cost) return ctx.reply(\`Necesitas \${cost} \${currency}.\`);
      member.coins -= cost;
      const roll = crypto.randomInt(0, 100);
      const prize = roll < 12 ? cost * 2 + 40 : roll < 50 ? cost + 35 : Math.floor(cost * 0.7);
      member.coins += prize; member.xp += 30; member.level = calcLevel(member.xp);
      await flushDbNow();
      await ctx.reply(escapeHtml(\`Cofre abierto por @\${member.username}: +\${prize} \${currency} y +30 XP.\`), { parse_mode: 'HTML' });
    } else if (cmd === '/trivia') {
      const errMsg = checkGameCooldown(member, isAdmin);
      if (errMsg) return ctx.reply(errMsg);
      const qs = db.entertainment.triviaQuestions;
      if (!qs.length) return ctx.reply('Sin preguntas configuradas.');
      const q = qs[crypto.randomInt(0, qs.length)];
      const sid = uid('trv');
      activeTrivias.set(sid, { q, solved: false });
      const kb = new InlineKeyboard();
      q.options.forEach((o, idx) => kb.text(o, \`trivia:\${sid}:\${idx}\`).row());
      await ctx.reply(escapeHtml(q.question), { parse_mode: 'HTML', reply_markup: kb });
    } else if (cmd === '/ahorcado') {
      const errMsg = checkGameCooldown(member, isAdmin);
      if (errMsg) return ctx.reply(errMsg);
      const words = db.entertainment.hangmanWords;
      const w = words[crypto.randomInt(0, words.length)].toUpperCase();
      activeHangman = { word: w, guessed: new Set(), wrong: 0 };
      await ctx.reply(w.split('').map(() => '_').join(' '));
    } else if (cmd === '/calculo') {
      const errMsg = checkGameCooldown(member, isAdmin);
      if (errMsg) return ctx.reply(errMsg);
      const a = crypto.randomInt(6, 25), b = crypto.randomInt(3, 12), c = crypto.randomInt(5, 40);
      activeMathBlitz = { answer: a * b + c };
      await ctx.reply(\`Cálculo relámpago: \${a} × \${b} + \${c}\`);
    } else if (cmd === '/ppt') {
      const errMsg = checkGameCooldown(member, isAdmin);
      if (errMsg) return ctx.reply(errMsg);
      const opts = ['piedra', 'papel', 'tijera'];
      const ch = (args[0] || '').toLowerCase();
      if (!opts.includes(ch)) return ctx.reply('Uso: /ppt piedra | papel | tijera');
      const bc = opts[crypto.randomInt(0, 3)];
      const win = (ch === 'piedra' && bc === 'tijera') || (ch === 'papel' && bc === 'piedra') || (ch === 'tijera' && bc === 'papel');
      if (win) { member.coins += 25; member.xp += 15; await flushDbNow(); }
      await ctx.reply(\`Tú: \${ch} · Bot: \${bc}. \${ch === bc ? 'Empate' : win ? '¡Ganaste +25!' : 'Ganó el bot'}\`);
    } else if (cmd === '/duelo') {
      const errMsg = checkGameCooldown(member, isAdmin);
      if (errMsg) return ctx.reply(errMsg);
      const op = resolveMember(args[0], ctx.message.reply_to_message?.from);
      const wager = Math.max(10, Math.min(500, Number.parseInt(args[1] || '30', 10) || 30));
      if (!op || op.id === member.id || member.coins < wager || op.coins < wager) return ctx.reply('Uso: /duelo @usuario [apuesta] (ambos con saldo suficiente).');
      const did = uid('duel');
      activeDuels.set(did, { challengerId: member.id, opponentId: op.id, wager });
      await ctx.reply(escapeHtml(\`@\${member.username} reta a @\${op.username} por \${wager} \${currency}.\`), { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('Aceptar duelo', 'duel_accept:' + did).text('Rechazar', 'duel_decline:' + did) });
    } else if (cmd === '/dado' || cmd === '/ruleta') {
      const errMsg = checkGameCooldown(member, isAdmin);
      if (errMsg) return ctx.reply(errMsg);
      const wager = Math.max(10, Math.min(500, Number.parseInt(args[0] || '20', 10) || 20));
      if (member.coins < wager) return ctx.reply('Saldo insuficiente.');
      const win = crypto.randomInt(0, 100) < 48;
      member.coins += win ? wager : -wager;
      await flushDbNow();
      await ctx.reply(escapeHtml(\`@\${member.username} \${win ? 'ganó +' : 'perdió '}\${wager} \${currency}.\`), { parse_mode: 'HTML' });
    } else if (cmd === '/lluvia') {
      const total = Math.max(20, Math.min(2000, Number.parseInt(args[0] || '100', 10) || 100));
      const maxClaims = Math.max(2, Math.min(15, Number.parseInt(args[1] || '5', 10) || 5));
      if (!isAdmin && member.coins < total) return ctx.reply('Saldo insuficiente.');
      if (!isAdmin) member.coins -= total;
      const rainId = uid('rain');
      db.entertainment.activeCoinRains.push({ id: rainId, totalCoins: total, remainingCoins: total, maxClaims, claimedBy: [], createdBy: '@' + member.username });
      await flushDbNow();
      await ctx.reply(escapeHtml(\`¡Lluvia de \${total} \${currency} por @\${member.username}!\`), { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('Reclamar parte', 'rain:' + rainId) });
    } else if (cmd === '/bola8' || cmd === '/8ball') {
      const q = args.join(' ').trim();
      if (!q) return ctx.reply('Uso: /bola8 <pregunta>');
      const ans = MAGIC_8_BALL[crypto.randomInt(0, MAGIC_8_BALL.length)];
      await ctx.reply(escapeHtml(\`Bola 8: "\${q}" -> \${ans}\`), { parse_mode: 'HTML' });
    } else if (cmd === '/ship') {
      const a = args[0] || '@' + member.username;
      const b = args[1] || '@grupo';
      const pct = crypto.randomInt(15, 101);
      await ctx.reply(escapeHtml(\`Compatibilidad entre \${a} y \${b}: \${pct}%\`), { parse_mode: 'HTML' });
    } else if (cmd === '/sorteo' && isAdmin) {
      const mins = Math.max(1, Number.parseInt(args[0] || '10', 10) || 10);
      const winnersCount = Math.max(1, Number.parseInt(args[1] || '1', 10) || 1);
      const prize = args.slice(2).join(' ').trim() || 'Premio VIP';
      const gid = uid('giv');
      db.entertainment.activeGiveaways.push({ id: gid, prize, winnersCount, endsAt: new Date(now + mins * 60000).toISOString(), participants: [], winnerIds: [], status: 'active', createdBy: '@' + member.username });
      await flushDbNow();
      await ctx.reply(escapeHtml(\`SORTEO: \${prize} (\${winnersCount} ganador/es, \${mins}m)\`), { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('Participar', 'giveaway:' + gid) });
    } else if (cmd === '/fin_sorteo' && isAdmin) {
      const active = db.entertainment.activeGiveaways.find((g) => g.status === 'active');
      if (!active) return ctx.reply('No hay sorteos activos.');
      active.status = 'ended';
      const pool = [...active.participants];
      const winners = [];
      while (winners.length < active.winnersCount && pool.length > 0) {
        const idx = crypto.randomInt(0, pool.length);
        winners.push(pool.splice(idx, 1)[0]);
      }
      active.winnerIds = winners;
      await flushDbNow();
      const names = winners.map((id) => { const m = db.members.find((x) => x.id === id); return m ? '@' + m.username : id; });
      await ctx.reply(escapeHtml(names.length ? \`Sorteo "\${active.prize}" finalizado. Ganadores: \${names.join(', ')}\` : \`Sorteo "\${active.prize}" cerrado sin participantes.\`), { parse_mode: 'HTML' });
    } else if (cmd === '/encuesta') {
      const parts = args.join(' ').split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) return ctx.reply('Uso: /encuesta Pregunta | Op1 | Op2');
      const pid = uid('poll');
      const [q, ...opts] = parts.slice(0, 5);
      db.entertainment.activePolls.push({ id: pid, question: q, options: opts.map((t) => ({ text: t, votes: [] })), createdBy: '@' + member.username, createdAt: new Date().toISOString() });
      const kb = new InlineKeyboard();
      opts.forEach((o, i) => kb.text(o, \`poll:\${pid}:\${i}\`).row());
      await flushDbNow();
      await ctx.reply(escapeHtml(q), { parse_mode: 'HTML', reply_markup: kb });
    } else if (cmd === '/warn' && isAdmin) {
      const t = resolveMember(args[0], ctx.message.reply_to_message?.from);
      if (!t || t.role === 'admin') return ctx.reply('Uso: /warn @usuario o responde a su mensaje.');
      t.warns += 1;
      await flushDbNow();
      await ctx.reply(escapeHtml(\`Advertencia para @\${t.username} (\${t.warns}/\${db.automod.maxWarns}).\`), { parse_mode: 'HTML' });
      if (t.warns >= db.automod.maxWarns) await ctx.restrictChatMember(Number(t.id), { can_send_messages: false }).catch(() => undefined);
    } else if (cmd === '/unwarn' && isAdmin) {
      const t = resolveMember(args[0], ctx.message.reply_to_message?.from);
      if (!t) return ctx.reply('Uso: /unwarn @usuario');
      if (t.warns > 0) t.warns -= 1;
      await flushDbNow();
      await ctx.reply(escapeHtml(\`Advertencia retirada a @\${t.username} (\${t.warns}/\${db.automod.maxWarns}).\`), { parse_mode: 'HTML' });
    } else if (cmd === '/mute' && isAdmin) {
      const t = resolveMember(args[0], ctx.message.reply_to_message?.from);
      if (!t || t.role === 'admin') return ctx.reply('Uso: /mute @usuario [min]');
      const rawMins = ctx.message.reply_to_message?.from ? args[0] : args[1];
      const mins = Number.parseInt(rawMins ?? '', 10) || db.automod.muteDurationMin;
      await ctx.restrictChatMember(Number(t.id), { can_send_messages: false }, { until_date: Math.floor(Date.now() / 1000) + mins * 60 }).catch(() => undefined);
      await ctx.reply(escapeHtml(\`@\${t.username} silenciado \${mins}m.\`), { parse_mode: 'HTML' });
    } else if (cmd === '/unmute' && isAdmin) {
      const t = resolveMember(args[0], ctx.message.reply_to_message?.from);
      if (!t) return ctx.reply('Uso: /unmute @usuario');
      await ctx.restrictChatMember(Number(t.id), { can_send_messages: true, can_send_polls: true, can_send_other_messages: true }).catch(() => undefined);
      await ctx.reply(escapeHtml(\`Silencio retirado a @\${t.username}.\`), { parse_mode: 'HTML' });
    } else if (cmd === '/ban' && isAdmin) {
      const t = resolveMember(args[0], ctx.message.reply_to_message?.from);
      if (!t || t.role === 'admin') return ctx.reply('Uso: /ban @usuario');
      t.status = 'banned';
      await ctx.banChatMember(Number(t.id)).catch(() => undefined);
      await flushDbNow();
      await ctx.reply(escapeHtml(\`@\${t.username} baneado del grupo.\`), { parse_mode: 'HTML' });
    } else if (cmd === '/unban' && isAdmin) {
      const t = resolveMember(args[0], ctx.message.reply_to_message?.from);
      if (!t) return ctx.reply('Uso: /unban @usuario');
      t.status = 'verified';
      await ctx.unbanChatMember(Number(t.id)).catch(() => undefined);
      await flushDbNow();
      await ctx.reply(escapeHtml(\`@\${t.username} desbaneado.\`), { parse_mode: 'HTML' });
    } else if (cmd === '/kick' && isAdmin) {
      const t = resolveMember(args[0], ctx.message.reply_to_message?.from);
      if (!t || t.role === 'admin') return ctx.reply('Uso: /kick @usuario');
      await ctx.banChatMember(Number(t.id)).catch(() => undefined);
      await ctx.unbanChatMember(Number(t.id)).catch(() => undefined);
      await ctx.reply(escapeHtml(\`@\${t.username} expulsado del grupo.\`), { parse_mode: 'HTML' });
    } else if ((cmd === '/vip' || cmd === '/unvip') && isAdmin) {
      const t = resolveMember(args[0], ctx.message.reply_to_message?.from);
      if (!t || t.role === 'admin') return ctx.reply(\`Uso: \${cmd} @usuario\`);
      t.role = cmd === '/vip' ? 'vip' : 'member';
      await flushDbNow();
      await ctx.reply(escapeHtml(\`@\${t.username} ahora tiene rol \${t.role.toUpperCase()}.\`), { parse_mode: 'HTML' });
    } else if ((cmd === '/lock' || cmd === '/unlock') && isAdmin) {
      const lockState = cmd === '/lock';
      const tp = (args[0] || '').toLowerCase();
      if (tp === 'links') { db.automod.antiLinksEnabled = lockState; await flushDbNow(); return ctx.reply(\`Anti-Links \${lockState ? 'activado' : 'desactivado'}.\`); }
      if (!['stickers', 'gifs', 'media', 'documents', 'voice', 'all'].includes(tp)) return ctx.reply('Tipos: stickers, gifs, media, documents, voice, links, all.');
      db.automod.locks[tp] = lockState;
      await flushDbNow();
      await ctx.reply(\`\${lockState ? 'Bloqueado' : 'Desbloqueado'}: \${tp}.\`);
    } else if (cmd === '/purge' && isAdmin) {
      const count = Math.max(1, Math.min(30, Number.parseInt(args[0] || '5', 10) || 5));
      for (let i = 0; i <= count; i++) {
        await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id - i).catch(() => undefined);
      }
    } else if (cmd === '/pin' && isAdmin) {
      const msgText = args.join(' ').trim();
      if (!msgText) return ctx.reply('Uso: /pin <anuncio>');
      const sent = await ctx.reply(escapeHtml(msgText), { parse_mode: 'HTML' });
      await ctx.api.pinChatMessage(ctx.chat.id, sent.message_id).catch(() => undefined);
    } else if (cmd === '/unpin' && isAdmin) {
      await ctx.api.unpinChatMessage(ctx.chat.id).catch(() => undefined);
      await ctx.reply('Mensaje desfijado.');
    }
  }

  scheduleSaveDb();
});

// Memory pruning & automatic giveaway expiry loop
setInterval(async () => {
  const now = Date.now();
  for (const [k, ts] of xpCooldown) if (now - ts > 60000) xpCooldown.delete(k);
  for (const [k, ts] of gameCooldown) if (now - ts > 300000) gameCooldown.delete(k);
  for (const [k, ts] of repCooldown) if (now - ts > 600000) repCooldown.delete(k);
  for (const [k, ts] of slowTracker) if (now - ts > 600000) slowTracker.delete(k);
  for (const g of db.entertainment.activeGiveaways) {
    if (g.status === 'active' && new Date(g.endsAt).getTime() <= now) {
      g.status = 'ended';
      await flushDbNow();
      if (GROUP_CHAT_ID && g.participants.length > 0) {
        const winId = g.participants[crypto.randomInt(0, g.participants.length)];
        const wm = db.members.find((m) => m.id === winId);
        await bot.api.sendMessage(Number(GROUP_CHAT_ID), escapeHtml(\`Sorteo "\${g.prize}" finalizado. Ganador: \${wm ? '@' + wm.username : winId}\`), { parse_mode: 'HTML' }).catch(() => undefined);
      }
    }
  }
}, 60000).unref();

await loadDb();
await registerTelegramCommands();
console.log('Iniciando CentinelaTG v2 en modo Long Polling...');
bot.start({ drop_pending_updates: true, allowed_updates: ['message', 'callback_query', 'chat_join_request'] });

const shutdown = async () => {
  console.log('Guardando datos y deteniendo bot...');
  await bot.stop();
  await flushDbNow();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
`;
}

function generateAltareReadme(): string {
  return `# CentinelaTG v2 — Guía de Despliegue en Altare

Este paquete contiene la versión autónoma y optimizada en **Node.js** de tu bot de gestión de grupos privados, con **Seguridad Anti-Raid**, **Modo Lento**, **XP y Niveles**, **Economía Virtual + Tienda**, **Minijuegos**, **Lluvia de Monedas**, **Sorteos** y **Encuestas**, listo para ejecutarse 24/7 en **Altare** mediante **Long Polling**.

## 1. Preparar tu bot en Telegram (@BotFather)
1. Abre **@BotFather** en Telegram y obtén tu \`TELEGRAM_BOT_TOKEN\`.
2. Ejecuta \`/setprivacy\` -> elige tu bot -> selecciona **Disable** (obligatorio para moderar mensajes, ganar XP y responder juegos).
3. Añade el bot a tu grupo privado como **Administrador** con permisos para eliminar mensajes, restringir, banear, aprobar solicitudes y fijar mensajes.

## 2. Subir a Altare
1. Crea un servidor **Node.js** en Altare (recomendado: **512 MB RAM**).
2. Sube el contenido de este ZIP sin \`node_modules\`.
3. Startup Command: \`node index.js\` (o \`npm start\`).
4. Variables de Entorno:
   - \`TELEGRAM_BOT_TOKEN\`: Token de @BotFather.
   - \`ADMIN_USER_IDS\`: IDs numéricos de los administradores separados por coma.
   - \`GROUP_CHAT_ID\`: *(Opcional)* ID del grupo privado (\`-100...\`).

## 3. Menú "/" automático en Telegram
Al iniciar, el bot registra automáticamente sus **45 comandos** (más tus comandos personalizados \`/\`) mediante \`setMyCommands\` en Telegram, separados por rol (miembros y administradores). **No necesitas configurar \`/setcommands\` en @BotFather** ni adivinar comandos: al escribir \`/\` en tu grupo aparecerá el menú completo.

- **Seguridad y Moderación**: \`/rules\`, \`/info\`, \`/staff\`, \`/warns\`, \`/report\`, \`/warn\`, \`/unwarn\`, \`/mute\`, \`/unmute\`, \`/kick\`, \`/ban\`, \`/unban\`, \`/vip\`, \`/unvip\`, \`/lock\`, \`/unlock\`, \`/purge\`, \`/pin\`, \`/unpin\`, \`/setrules\`, \`/setwelcome\`, \`/raid on|off\`, \`/slowmode [seg]\`, \`/games on|off\`.
- **Entretenimiento y Economía**: \`/rank\`, \`/top\`, \`/daily\`, \`/misiones\`, \`/gracias @usuario\`, \`/pay\`, \`/shop\`, \`/buy\`, \`/cofre\`, \`/trivia\`, \`/ahorcado\`, \`/calculo\`, \`/dado\`, \`/ruleta\`, \`/ppt\`, \`/duelo\`, \`/lluvia\`, \`/sorteo\`, \`/fin_sorteo\`, \`/encuesta\`, \`/bola8\`, \`/ship\`.
`;
}

export async function buildAltareZipBuffer(): Promise<Buffer> {
  const db = store.get();
  const zip = new JSZip();
  const root = zip.folder('centinela-tg-altare');
  if (!root) {
    throw new Error('No se pudo inicializar el paquete ZIP.');
  }

  const pkgJson = {
    name: 'centinela-tg-bot',
    version: '2.0.0',
    description: 'Bot de gestión de grupos privados, Anti-Raid y entretenimiento listo para Altare',
    type: 'module',
    main: 'index.js',
    scripts: {
      start: 'node index.js',
    },
    dependencies: {
      dotenv: '^17.2.3',
      grammy: '^1.48.0',
    },
    engines: {
      node: '>=18.0.0',
    },
  };

  root.file('package.json', JSON.stringify(pkgJson, null, 2));
  root.file('.env.example', 'TELEGRAM_BOT_TOKEN=\nADMIN_USER_IDS=\nGROUP_CHAT_ID=\n');
  root.file('index.js', generateStandaloneBotJs());
  root.file('README-ALTARE.md', generateAltareReadme());

  const exportDb = {
    version: db.version,
    settings: db.settings,
    automod: db.automod,
    security: db.security,
    entertainment: {
      ...db.entertainment,
      activeGiveaways: [],
      activePolls: [],
      activeCoinRains: [],
    },
    members: [],
    customCommands: db.customCommands,
    auditLogs: [],
    analytics: [],
    stats: {
      totalMessagesProcessed: 0,
      blockedSpamCount: 0,
      captchasPassed: 0,
      totalWarningsIssued: 0,
      totalGamesPlayed: 0,
      raidsBlocked: 0,
    },
  };
  root.folder('data')?.file('bot-db.json', JSON.stringify(exportDb, null, 2));

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
