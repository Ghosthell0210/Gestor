import fs from 'node:fs/promises';
import path from 'node:path';
import type { BotDatabase } from '../shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'bot-db.json');

if (!DB_FILE.startsWith(DATA_DIR + path.sep)) {
  throw new Error('Ruta de almacenamiento fuera del directorio permitido.');
}

export function createInitialDatabase(): BotDatabase {
  const now = new Date();
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  return {
    version: 1,
    settings: {
      groupName: 'Comunidad Privada VIP',
      welcomeEnabled: true,
      welcomeMessage:
        'Bienvenido/a {nombre} a {grupo}. Por favor revisa las normas del grupo privado y completa tu verificación para poder escribir.',
      welcomeButtons: [
        { text: 'Leer Normas', url: 'https://t.me/TelegramTips' },
        { text: 'Soporte Admin', url: 'https://t.me/BotSupport' },
      ],
      cleanServiceMessages: true,
      captchaMode: 'math',
      captchaTimeoutSec: 120,
      approveJoinRequests: 'auto_captcha',
      rulesText:
        '1. Respeto absoluto entre miembros del grupo privado.\n2. Prohibido enviar enlaces externos, invitaciones t.me o spam.\n3. No reenviar contenido privado fuera del grupo.\n4. Usa /report para avisar al equipo de administración.',
      scheduledAnnouncementEnabled: false,
      scheduledAnnouncementIntervalMin: 180,
      scheduledAnnouncementText:
        'Recordatorio: mantén las conversaciones dentro de los temas permitidos y evita compartir enlaces externos sin autorización.',
    },
    automod: {
      antiFloodEnabled: true,
      floodMaxMessages: 5,
      floodWindowSec: 8,
      floodAction: 'mute',
      antiLinksEnabled: true,
      blockTelegramLinks: true,
      blockForwards: true,
      allowedDomains: ['github.com', 'docs.telegram.org'],
      linksAction: 'warn',
      badWordsEnabled: true,
      badWords: ['estafa', 'casino', 'criptoregalo', 'phishing'],
      badWordsAction: 'warn',
      locks: {
        stickers: false,
        gifs: false,
        media: false,
        documents: false,
        voice: false,
        all: false,
      },
      maxWarns: 3,
      maxWarnAction: 'mute',
      muteDurationMin: 30,
    },
    members: [
      {
        id: '1001001',
        name: 'Carlos Mendoza',
        username: 'cmendoza_admin',
        role: 'admin',
        status: 'verified',
        warns: 0,
        warnHistory: [],
        mutedUntil: null,
        joinedAt: minsAgo(14400),
        lastActiveAt: minsAgo(3),
        messageCount: 142,
      },
      {
        id: '1001002',
        name: 'Elena Navarro',
        username: 'elenav_vip',
        role: 'vip',
        status: 'verified',
        warns: 0,
        warnHistory: [],
        mutedUntil: null,
        joinedAt: minsAgo(9600),
        lastActiveAt: minsAgo(14),
        messageCount: 89,
      },
      {
        id: '1001003',
        name: 'Mateo Silva',
        username: 'msilva92',
        role: 'member',
        status: 'verified',
        warns: 1,
        warnHistory: [
          {
            id: 'w-init-1',
            reason: 'Enlace promocional no autorizado',
            by: 'AutoMod (Anti-Links)',
            at: minsAgo(95),
          },
        ],
        mutedUntil: null,
        joinedAt: minsAgo(4320),
        lastActiveAt: minsAgo(22),
        messageCount: 31,
      },
      {
        id: '1001004',
        name: 'Lucía Fernández',
        username: 'lucia_f',
        role: 'member',
        status: 'verified',
        warns: 0,
        warnHistory: [],
        mutedUntil: null,
        joinedAt: minsAgo(1800),
        lastActiveAt: minsAgo(47),
        messageCount: 19,
      },
      {
        id: '1001005',
        name: 'Diego Rojas',
        username: 'drojas_sp',
        role: 'member',
        status: 'muted',
        warns: 3,
        warnHistory: [
          { id: 'w-init-2', reason: 'Flood en chat principal', by: 'AutoMod (Anti-Flood)', at: minsAgo(210) },
          { id: 'w-init-3', reason: 'Reenvío de canal externo', by: 'AutoMod (Anti-Links)', at: minsAgo(160) },
          { id: 'w-init-4', reason: 'Palabra prohibida detectada', by: 'AutoMod (Filtro)', at: minsAgo(60) },
        ],
        mutedUntil: new Date(now.getTime() + 15 * 60_000).toISOString(),
        joinedAt: minsAgo(2200),
        lastActiveAt: minsAgo(60),
        messageCount: 12,
      },
    ],
    customCommands: [
      {
        id: 'cmd-normas',
        trigger: '/normas',
        response: 'Normas activas en {grupo}:\n\n1. Respeto mutuo.\n2. Sin enlaces externos ni spam.\n3. Consultas administrativas con /report.',
        adminOnly: false,
        deleteTrigger: false,
        enabled: true,
        usageCount: 24,
      },
      {
        id: 'cmd-soporte',
        trigger: '/soporte',
        response: 'Hola {nombre}, para soporte técnico o dudas sobre tu acceso al grupo privado, escribe a @cmendoza_admin o usa /report seguido de tu consulta.',
        adminOnly: false,
        deleteTrigger: false,
        enabled: true,
        usageCount: 11,
      },
      {
        id: 'cmd-vip',
        trigger: '/vip',
        response: 'Los miembros VIP cuentan con exención automática en el filtro de enlaces permitidos y acceso prioritario.',
        adminOnly: false,
        deleteTrigger: true,
        enabled: true,
        usageCount: 7,
      },
    ],
    auditLogs: [
      {
        id: 'log-1',
        timestamp: minsAgo(180),
        source: 'simulator',
        action: 'Bot inicializado',
        actor: 'Sistema',
        target: 'Comunidad Privada VIP',
        detail: 'Base local cargada con reglas de grupo privado.',
        severity: 'info',
      },
      {
        id: 'log-2',
        timestamp: minsAgo(95),
        source: 'simulator',
        action: 'Advertencia automática (1/3)',
        actor: 'AutoMod · Anti-Links',
        target: '@msilva92',
        detail: 'Mensaje eliminado por incluir dominio no listado.',
        severity: 'warning',
      },
      {
        id: 'log-3',
        timestamp: minsAgo(60),
        source: 'simulator',
        action: 'Silencio automático (30m)',
        actor: 'AutoMod · Máx. Warns',
        target: '@drojas_sp',
        detail: 'Alcanzó el límite de 3/3 advertencias.',
        severity: 'danger',
      },
      {
        id: 'log-4',
        timestamp: minsAgo(28),
        source: 'panel',
        action: 'Verificación completada',
        actor: 'Captcha Matemático',
        target: '@lucia_f',
        detail: 'Acceso aprobado tras resolver el reto en 9 segundos.',
        severity: 'info',
      },
    ],
    simulatorMessages: [
      {
        id: 'sim-1',
        senderId: 'system',
        senderName: 'Sistema',
        senderUsername: 'system',
        senderRole: 'system',
        text: 'Grupo privado listo para pruebas. Envía comandos (/help, /rules, /warn @msilva92, /lock links) o simula un nuevo ingreso.',
        messageType: 'text',
        timestamp: minsAgo(30),
      },
      {
        id: 'sim-2',
        senderId: '1001001',
        senderName: 'Carlos Mendoza',
        senderUsername: 'cmendoza_admin',
        senderRole: 'admin',
        text: '/rules',
        messageType: 'text',
        timestamp: minsAgo(25),
      },
      {
        id: 'sim-3',
        senderId: 'bot',
        senderName: 'CentinelaTG',
        senderUsername: 'CentinelaTG_bot',
        senderRole: 'bot',
        text: 'Normas de Comunidad Privada VIP:\n1. Respeto absoluto entre miembros del grupo privado.\n2. Prohibido enviar enlaces externos, invitaciones t.me o spam.\n3. No reenviar contenido privado fuera del grupo.\n4. Usa /report para avisar al equipo de administración.',
        messageType: 'text',
        timestamp: minsAgo(25),
      },
    ],
    stats: {
      totalMessagesProcessed: 293,
      blockedSpamCount: 18,
      captchasPassed: 42,
      totalWarningsIssued: 9,
    },
  };
}

class LocalFileStore {
  private db: BotDatabase | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  async init(): Promise<BotDatabase> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as BotDatabase;
      this.db = this.mergeDefaults(parsed);
    } catch {
      this.db = createInitialDatabase();
      await this.flush();
    }
    return this.db;
  }

  private mergeDefaults(loaded: Partial<BotDatabase>): BotDatabase {
    const fallback = createInitialDatabase();
    return {
      version: loaded.version ?? fallback.version,
      settings: { ...fallback.settings, ...(loaded.settings ?? {}) },
      automod: {
        ...fallback.automod,
        ...(loaded.automod ?? {}),
        locks: { ...fallback.automod.locks, ...(loaded.automod?.locks ?? {}) },
      },
      members: Array.isArray(loaded.members) ? loaded.members : fallback.members,
      customCommands: Array.isArray(loaded.customCommands) ? loaded.customCommands : fallback.customCommands,
      auditLogs: Array.isArray(loaded.auditLogs) ? loaded.auditLogs : fallback.auditLogs,
      simulatorMessages: Array.isArray(loaded.simulatorMessages)
        ? loaded.simulatorMessages
        : fallback.simulatorMessages,
      stats: { ...fallback.stats, ...(loaded.stats ?? {}) },
    };
  }

  get(): BotDatabase {
    if (!this.db) {
      throw new Error('La base de datos local no ha sido inicializada.');
    }
    return this.db;
  }

  async save(): Promise<void> {
    await this.flush();
  }

  private flush(): Promise<void> {
    const snapshot = JSON.stringify(this.db, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      const tempPath = `${DB_FILE}.tmp`;
      await fs.writeFile(tempPath, snapshot, 'utf-8');
      await fs.rename(tempPath, DB_FILE);
    });
    return this.writeQueue;
  }
}

export const store = new LocalFileStore();
