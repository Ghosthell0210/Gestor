import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { store } from './src/bot/storage.ts';
import { botEngine } from './src/bot/engine.ts';
import { telegramAdapter } from './src/bot/telegramAdapter.ts';
import { buildAltareZipBuffer } from './src/bot/altareExporter.ts';

const PORT = Number(process.env.PORT) || 3000;

const settingsSchema = z.object({
  groupName: z.string().trim().min(1).max(80),
  welcomeEnabled: z.boolean(),
  welcomeMessage: z.string().trim().min(1).max(1500),
  welcomeButtons: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(40),
        url: z
          .string()
          .trim()
          .refine((u) => u.startsWith('https://') || u.startsWith('http://'), {
            message: 'Las URLs de botones deben iniciar con http:// o https://',
          }),
      })
    )
    .max(6),
  cleanServiceMessages: z.boolean(),
  captchaMode: z.enum(['button', 'math', 'off']),
  captchaTimeoutSec: z.number().int().min(15).max(600),
  approveJoinRequests: z.enum(['auto_captcha', 'manual', 'auto_all']),
  rulesText: z.string().trim().min(1).max(3000),
  scheduledAnnouncementEnabled: z.boolean(),
  scheduledAnnouncementIntervalMin: z.number().int().min(15).max(1440),
  scheduledAnnouncementText: z.string().trim().min(1).max(1500),
});

const automodSchema = z.object({
  antiFloodEnabled: z.boolean(),
  floodMaxMessages: z.number().int().min(2).max(30),
  floodWindowSec: z.number().int().min(2).max(60),
  floodAction: z.enum(['mute', 'warn', 'kick']),
  antiLinksEnabled: z.boolean(),
  blockTelegramLinks: z.boolean(),
  blockForwards: z.boolean(),
  allowedDomains: z.array(z.string().trim().min(1).max(120)).max(50),
  linksAction: z.enum(['delete', 'warn', 'mute']),
  badWordsEnabled: z.boolean(),
  badWords: z.array(z.string().trim().min(1).max(60)).max(200),
  badWordsAction: z.enum(['delete', 'warn', 'mute']),
  locks: z.object({
    stickers: z.boolean(),
    gifs: z.boolean(),
    media: z.boolean(),
    documents: z.boolean(),
    voice: z.boolean(),
    all: z.boolean(),
  }),
  maxWarns: z.number().int().min(1).max(10),
  maxWarnAction: z.enum(['mute', 'kick', 'ban']),
  muteDurationMin: z.number().int().min(1).max(10080),
});

const commandsSchema = z.object({
  commands: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        trigger: z
          .string()
          .trim()
          .min(2)
          .max(32)
          .refine((t) => t.startsWith('/') || t.startsWith('!'), {
            message: 'El comando debe empezar por / o !',
          }),
        response: z.string().trim().min(1).max(1500),
        adminOnly: z.boolean(),
        deleteTrigger: z.boolean(),
        enabled: z.boolean(),
        usageCount: z.number().int().min(0),
      })
    )
    .max(50),
});

const memberActionSchema = z.object({
  action: z.enum(['warn', 'unwarn', 'mute', 'unmute', 'kick', 'ban', 'unban', 'set_vip', 'set_member', 'approve']),
  reason: z.string().trim().max(240).optional(),
});

const simMessageSchema = z.object({
  actorId: z.string().trim().min(1).max(60),
  text: z.string().max(2000),
  contentType: z.enum(['text', 'sticker', 'gif', 'media', 'document', 'voice', 'forward']).default('text'),
});

const simJoinSchema = z.object({
  name: z.string().trim().min(1).max(60),
  username: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .transform((v) => v.replace(/^@/, '')),
});

const simCallbackSchema = z.object({
  actorId: z.string().trim().min(1).max(60),
  callbackData: z.string().trim().min(1).max(120),
});

async function bootstrap() {
  await store.init();
  await telegramAdapter.start();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/state', (_req, res) => {
    res.json({
      database: store.get(),
      runtime: telegramAdapter.getRuntimeInfo(),
    });
  });

  app.put('/api/settings', async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos de configuración inválidos' });
      return;
    }
    const db = store.get();
    db.settings = parsed.data;
    db.auditLogs.unshift({
      id: `log-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      source: 'panel',
      action: 'Bienvenida y reglas guardadas',
      actor: 'Panel Web',
      target: db.settings.groupName,
      detail: `Captcha: ${db.settings.captchaMode} · Solicitudes: ${db.settings.approveJoinRequests}`,
      severity: 'info',
    });
    await store.save();
    res.json({ database: db, runtime: telegramAdapter.getRuntimeInfo() });
  });

  app.put('/api/automod', async (req, res) => {
    const parsed = automodSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Reglas de AutoMod inválidas' });
      return;
    }
    const db = store.get();
    db.automod = parsed.data;
    db.auditLogs.unshift({
      id: `log-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      source: 'panel',
      action: 'Auto-Moderación actualizada',
      actor: 'Panel Web',
      target: db.settings.groupName,
      detail: `Máx. Warns: ${db.automod.maxWarns} -> ${db.automod.maxWarnAction}`,
      severity: 'info',
    });
    await store.save();
    res.json({ database: db, runtime: telegramAdapter.getRuntimeInfo() });
  });

  app.put('/api/commands', async (req, res) => {
    const parsed = commandsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Lista de comandos inválida' });
      return;
    }
    const db = store.get();
    db.customCommands = parsed.data.commands;
    db.auditLogs.unshift({
      id: `log-${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      source: 'panel',
      action: 'Comandos personalizados guardados',
      actor: 'Panel Web',
      target: `${db.customCommands.length} comandos`,
      detail: 'Lista sincronizada en base local.',
      severity: 'info',
    });
    await store.save();
    res.json({ database: db, runtime: telegramAdapter.getRuntimeInfo() });
  });

  app.post('/api/members/:id/action', async (req, res) => {
    const parsed = memberActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Acción de miembro inválida' });
      return;
    }
    try {
      const memberId = req.params.id;
      const result = await botEngine.applyPanelMemberAction(memberId, parsed.data.action, parsed.data.reason);
      if (
        parsed.data.action === 'mute' ||
        parsed.data.action === 'unmute' ||
        parsed.data.action === 'kick' ||
        parsed.data.action === 'ban' ||
        parsed.data.action === 'unban'
      ) {
        await telegramAdapter.syncPanelSanction(memberId, parsed.data.action);
      }
      res.json({
        summary: result.summary,
        database: store.get(),
        runtime: telegramAdapter.getRuntimeInfo(),
      });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'No se pudo aplicar la acción' });
    }
  });

  app.post('/api/simulator/message', async (req, res) => {
    const parsed = simMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Mensaje de simulador inválido' });
      return;
    }
    const db = store.get();
    const actorRecord = db.members.find((m) => m.id === parsed.data.actorId);
    if (!actorRecord) {
      res.status(404).json({ error: 'Miembro de prueba no encontrado' });
      return;
    }
    await botEngine.processIncoming({
      source: 'simulator',
      chatTitle: db.settings.groupName,
      actor: {
        id: actorRecord.id,
        name: actorRecord.name,
        username: actorRecord.username,
        isAdmin: actorRecord.role === 'admin',
      },
      text: parsed.data.text,
      contentType: parsed.data.contentType,
    });
    res.json({ database: store.get(), runtime: telegramAdapter.getRuntimeInfo() });
  });

  app.post('/api/simulator/join', async (req, res) => {
    const parsed = simJoinSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Datos de nuevo miembro inválidos' });
      return;
    }
    const id = String(2000000 + Math.floor(Math.random() * 800000));
    await botEngine.handleJoinRequest('simulator', {
      id,
      name: parsed.data.name,
      username: parsed.data.username,
    });
    res.json({ joinedUserId: id, database: store.get(), runtime: telegramAdapter.getRuntimeInfo() });
  });

  app.post('/api/simulator/callback', async (req, res) => {
    const parsed = simCallbackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Callback inválido' });
      return;
    }
    const db = store.get();
    const actorRecord = db.members.find((m) => m.id === parsed.data.actorId) ?? db.members[0];
    const result = await botEngine.handleCallback(
      'simulator',
      {
        id: actorRecord.id,
        name: actorRecord.name,
        username: actorRecord.username,
        isAdmin: actorRecord.role === 'admin',
      },
      parsed.data.callbackData
    );
    res.json({
      toast: result.replyText,
      database: store.get(),
      runtime: telegramAdapter.getRuntimeInfo(),
    });
  });

  app.post('/api/simulator/reset', async (_req, res) => {
    const db = store.get();
    db.simulatorMessages = [
      {
        id: `sim-${crypto.randomBytes(4).toString('hex')}`,
        senderId: 'system',
        senderName: 'Sistema',
        senderUsername: 'system',
        senderRole: 'system',
        text: 'Historial del simulador reiniciado. Envía un comando o simula un nuevo ingreso al grupo privado.',
        messageType: 'text',
        timestamp: new Date().toISOString(),
      },
    ];
    await store.save();
    res.json({ database: db, runtime: telegramAdapter.getRuntimeInfo() });
  });

  app.get('/api/export/altare.zip', async (_req, res) => {
    try {
      const zipBuffer = await buildAltareZipBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="centinela-tg-altare.zip"');
      res.send(zipBuffer);
    } catch {
      res.status(500).json({ error: 'No se pudo generar el archivo ZIP para Altare.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`CentinelaTG disponible en http://localhost:${PORT}`);
  });

  const gracefulShutdown = async () => {
    await telegramAdapter.stop();
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', gracefulShutdown);
  process.once('SIGTERM', gracefulShutdown);
}

bootstrap().catch((err) => {
  console.error('Error iniciando el servidor:', err);
  process.exit(1);
});
