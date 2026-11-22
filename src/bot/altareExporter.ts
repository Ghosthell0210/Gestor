import JSZip from 'jszip';
import { store } from './storage.ts';

function generateStandaloneBotJs(): string {
  return `import 'dotenv/config';
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
const floodTracker = new Map();
const pendingCaptchas = new Map();

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
}

function saveDb() {
  const snapshot = JSON.stringify(db, null, 2);
  writeQueue = writeQueue.then(async () => {
    const tmp = DB_PATH + '.tmp';
    await fs.writeFile(tmp, snapshot, 'utf-8');
    await fs.rename(tmp, DB_PATH);
  });
  return writeQueue;
}

function ensureMember(from, isAdmin = false) {
  const id = String(from.id);
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
    };
    db.members.push(member);
  } else {
    member.lastActiveAt = new Date().toISOString();
    if (isAdmin) member.role = 'admin';
  }
  return member;
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

const URL_REGEX = /(?:https?:\\/\\/|www\\.|t\\.me\\/|telegram\\.me\\/)([^\\s/$.?#].[^\\s]*)/gi;
const bot = new Bot(TOKEN);

bot.catch((err) => {
  console.error('Error en bot:', err.error);
});

bot.on('chat_join_request', async (ctx) => {
  const user = ctx.chatJoinRequest.from;
  const userId = String(user.id);
  const member = ensureMember(user, ADMIN_IDS.has(userId));

  if (db.settings.approveJoinRequests === 'manual') {
    const kb = new InlineKeyboard()
      .text('Aprobar', 'approve_join:' + userId)
      .text('Rechazar', 'decline_join:' + userId);
    member.status = 'pending_approval';
    await saveDb();
    await ctx.api.sendMessage(
      ctx.chat.id,
      escapeHtml(\`Solicitud de ingreso de \${member.name} (@\${member.username}).\`),
      { parse_mode: 'HTML', reply_markup: kb }
    );
    return;
  }

  await ctx.approveChatJoinRequest(user.id).catch(() => undefined);
  await handleNewMemberChallenge(ctx, user, member);
});

bot.on('message:new_chat_members', async (ctx) => {
  if (db.settings.cleanServiceMessages) {
    await ctx.deleteMessage().catch(() => undefined);
  }
  for (const user of ctx.message.new_chat_members) {
    if (user.is_bot) continue;
    const member = ensureMember(user, ADMIN_IDS.has(String(user.id)));
    await handleNewMemberChallenge(ctx, user, member);
  }
});

bot.on('message:left_chat_member', async (ctx) => {
  if (db.settings.cleanServiceMessages) {
    await ctx.deleteMessage().catch(() => undefined);
  }
});

async function handleNewMemberChallenge(ctx, user, member) {
  if (db.settings.captchaMode === 'off' || db.settings.approveJoinRequests === 'auto_all') {
    member.status = 'verified';
    await saveDb();
    if (db.settings.welcomeEnabled) {
      const kb = new InlineKeyboard();
      db.settings.welcomeButtons.forEach((b, i) => {
        kb.url(b.text, b.url);
        if (i % 2 === 1) kb.row();
      });
      await ctx.reply(
        escapeHtml(
          formatTemplate(db.settings.welcomeMessage, {
            nombre: member.name,
            usuario: '@' + member.username,
            grupo: db.settings.groupName,
          })
        ),
        { parse_mode: 'HTML', reply_markup: db.settings.welcomeButtons.length ? kb : undefined }
      );
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
    const opts = [ans, String(a + b + 2), String(Math.max(1, a + b - 1))].sort(() => Math.random() - 0.5);
    opts.forEach((o) => kb.text('Resultado: ' + o, 'verify:' + member.id + ':' + o));
    prompt = \`Verificación para \${member.name} (@\${member.username}): resuelve \${a} + \${b} en \${db.settings.captchaTimeoutSec}s.\`;
  } else {
    pendingCaptchas.set(member.id, 'ok');
    kb.text('Verificar que soy humano', 'verify:' + member.id + ':ok');
    prompt = \`Bienvenido/a \${member.name}. Pulsa el botón en \${db.settings.captchaTimeoutSec}s para escribir en el grupo.\`;
  }

  await saveDb();
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

  if (data.startsWith('verify:')) {
    const [, targetId, ans] = data.split(':');
    if (callerId !== targetId && !(await isAdminCtx(ctx, callerId))) {
      await ctx.answerCallbackQuery({ text: 'Este botón pertenece a otro miembro.', show_alert: true });
      return;
    }
    const expected = pendingCaptchas.get(targetId);
    if (expected && expected !== ans) {
      await ctx.answerCallbackQuery({ text: 'Respuesta incorrecta.', show_alert: true });
      return;
    }
    pendingCaptchas.delete(targetId);
    const member = db.members.find((m) => m.id === targetId);
    if (member) member.status = 'verified';
    await ctx.restrictChatMember(Number(targetId), {
      can_send_messages: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true,
    }).catch(() => undefined);
    await saveDb();
    await ctx.answerCallbackQuery({ text: 'Verificado correctamente.' });
    await ctx.deleteMessage().catch(() => undefined);
    return;
  }

  if (data.startsWith('approve_join:') || data.startsWith('decline_join:')) {
    if (!(await isAdminCtx(ctx, callerId))) {
      await ctx.answerCallbackQuery({ text: 'Solo administradores.', show_alert: true });
      return;
    }
    const [act, targetId] = data.split(':');
    if (act === 'approve_join') {
      await ctx.approveChatJoinRequest(Number(targetId)).catch(() => undefined);
      await ctx.answerCallbackQuery({ text: 'Ingreso aprobado.' });
    } else {
      await ctx.declineChatJoinRequest(Number(targetId)).catch(() => undefined);
      await ctx.answerCallbackQuery({ text: 'Ingreso rechazado.' });
    }
    await ctx.deleteMessage().catch(() => undefined);
  }
});

bot.on('message', async (ctx) => {
  if (!ctx.from || ctx.from.is_bot) return;
  const userId = String(ctx.from.id);
  const isAdmin = await isAdminCtx(ctx, userId);
  const member = ensureMember(ctx.from, isAdmin);
  const isVip = member.role === 'vip';
  const text = ctx.message.text ?? ctx.message.caption ?? '';

  if (!isAdmin && !isVip) {
    const locks = db.automod.locks;
    const isLocked =
      locks.all ||
      (locks.stickers && Boolean(ctx.message.sticker)) ||
      (locks.gifs && Boolean(ctx.message.animation)) ||
      (locks.media && Boolean(ctx.message.photo || ctx.message.video)) ||
      (locks.documents && Boolean(ctx.message.document)) ||
      (locks.voice && Boolean(ctx.message.voice || ctx.message.audio));

    if (isLocked) {
      await ctx.deleteMessage().catch(() => undefined);
      return;
    }

    if (db.automod.antiFloodEnabled) {
      const now = Date.now();
      const win = db.automod.floodWindowSec * 1000;
      const list = (floodTracker.get(userId) ?? []).filter((t) => now - t <= win);
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

  const trimmed = text.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('!')) {
    const [rawCmd, ...args] = trimmed.split(/\\s+/);
    const cmd = rawCmd.split('@')[0].toLowerCase();

    const custom = db.customCommands.find((c) => c.enabled && c.trigger.toLowerCase() === cmd);
    if (custom && (!custom.adminOnly || isAdmin)) {
      if (custom.deleteTrigger) await ctx.deleteMessage().catch(() => undefined);
      await ctx.reply(
        escapeHtml(
          formatTemplate(custom.response, {
            nombre: member.name,
            usuario: '@' + member.username,
            grupo: db.settings.groupName,
            warns: member.warns + '/' + db.automod.maxWarns,
          })
        ),
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (cmd === '/rules') {
      await ctx.reply(escapeHtml(db.settings.rulesText), { parse_mode: 'HTML' });
    } else if (cmd === '/help' || cmd === '/start') {
      await ctx.reply('Comandos: /rules, /info, /report' + (isAdmin ? ' | Admin: /warn, /mute, /unmute, /kick, /ban, /lock, /unlock, /pin' : ''));
    } else if (cmd === '/warn' && isAdmin && ctx.message.reply_to_message?.from) {
      const t = ensureMember(ctx.message.reply_to_message.from);
      t.warns += 1;
      await saveDb();
      await ctx.reply(escapeHtml(\`Advertencia para @\${t.username} (\${t.warns}/\${db.automod.maxWarns}).\`), { parse_mode: 'HTML' });
      if (t.warns >= db.automod.maxWarns) {
        await ctx.restrictChatMember(Number(t.id), { can_send_messages: false }).catch(() => undefined);
      }
    } else if (cmd === '/mute' && isAdmin && ctx.message.reply_to_message?.from) {
      const mins = Number.parseInt(args[0] ?? '', 10) || db.automod.muteDurationMin;
      const until = Math.floor(Date.now() / 1000) + mins * 60;
      await ctx.restrictChatMember(ctx.message.reply_to_message.from.id, { can_send_messages: false }, { until_date: until }).catch(() => undefined);
      await ctx.reply(\`Usuario silenciado \${mins} minutos.\`);
    } else if (cmd === '/unmute' && isAdmin && ctx.message.reply_to_message?.from) {
      await ctx.restrictChatMember(ctx.message.reply_to_message.from.id, { can_send_messages: true, can_send_polls: true, can_send_other_messages: true }).catch(() => undefined);
      await ctx.reply('Silencio retirado.');
    } else if (cmd === '/ban' && isAdmin && ctx.message.reply_to_message?.from) {
      await ctx.banChatMember(ctx.message.reply_to_message.from.id).catch(() => undefined);
      await ctx.reply('Usuario baneado.');
    } else if (cmd === '/kick' && isAdmin && ctx.message.reply_to_message?.from) {
      await ctx.banChatMember(ctx.message.reply_to_message.from.id).catch(() => undefined);
      await ctx.unbanChatMember(ctx.message.reply_to_message.from.id).catch(() => undefined);
      await ctx.reply('Usuario expulsado.');
    }
  }

  await saveDb();
});

await loadDb();
console.log('Iniciando CentinelaTG en modo Long Polling...');
bot.start({ drop_pending_updates: true, allowed_updates: ['message', 'callback_query', 'chat_join_request'] });

const shutdown = async () => {
  console.log('Deteniendo bot...');
  await bot.stop();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
`;
}

function generateAltareReadme(): string {
  return `# CentinelaTG — Guía de Despliegue en Altare

Este paquete contiene la versión autónoma y ligera en **Node.js** de tu bot de gestión de grupos privados, sin dependencias nativas ni interfaz frontend, lista para ejecutarse 24/7 en **Altare** mediante **Long Polling**.

## 1. Preparar tu bot en Telegram (@BotFather)
1. Abre **@BotFather** en Telegram y ejecuta \`/newbot\` (o usa tu bot existente) para obtener el \`TELEGRAM_BOT_TOKEN\`.
2. Ejecuta \`/setprivacy\` -> selecciona tu bot -> elige **Disable**. Esto es obligatorio para que el bot pueda leer mensajes y aplicar filtros Anti-Links, Anti-Flood y Palabras Prohibidas en tu grupo privado.
3. Añade el bot a tu grupo privado como **Administrador** con permisos para:
   - Eliminar mensajes
   - Restringir / silenciar miembros
   - Expulsar / banear usuarios
   - Aprobar solicitudes de ingreso (Add/Approve members)
   - Fijar mensajes

## 2. Subir a Altare
1. Crea un servidor **Node.js** en el panel de Altare.
2. Sube el contenido de este ZIP (sin crear \`node_modules\`).
3. Verifica que el **Startup Command** en Altare sea:
   \`\`\`
   node index.js
   \`\`\`
   *(o \`npm start\`)*.

## 3. Variables de Entorno en Altare
En la pestaña **Startup / Environment Variables** de Altare configura:
- \`TELEGRAM_BOT_TOKEN\`: Tu token de @BotFather.
- \`ADMIN_USER_IDS\`: Tu ID numérico de Telegram (puedes obtenerlo con \`@userinfobot\`), separados por coma si hay varios.
- \`GROUP_CHAT_ID\`: *(Opcional)* El ID de tu grupo privado (\`-100...\`).

## 4. Base de datos local
Tu configuración actual (normas, palabras prohibidas, bienvenida y comandos personalizados) ya viene incluida en \`data/bot-db.json\`. Este archivo se actualiza automáticamente de forma atómica cada vez que modificas reglas o emites advertencias.
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
    version: '1.0.0',
    description: 'Bot de gestión de grupos privados de Telegram listo para Altare (Long Polling)',
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
  root.file(
    '.env.example',
    'TELEGRAM_BOT_TOKEN=\nADMIN_USER_IDS=\nGROUP_CHAT_ID=\n'
  );
  root.file('index.js', generateStandaloneBotJs());
  root.file('README-ALTARE.md', generateAltareReadme());

  // Bake current settings, automod, and customCommands into data/bot-db.json
  const exportDb = {
    version: db.version,
    settings: db.settings,
    automod: db.automod,
    members: [],
    customCommands: db.customCommands,
    auditLogs: [],
    stats: {
      totalMessagesProcessed: 0,
      blockedSpamCount: 0,
      captchasPassed: 0,
      totalWarningsIssued: 0,
    },
  };
  root.folder('data')?.file('bot-db.json', JSON.stringify(exportDb, null, 2));

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
