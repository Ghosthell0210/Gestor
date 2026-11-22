import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  BotDatabase,
  DailyMissionsProgress,
  EntertainmentConfig,
  MemberRecord,
  SecurityConfig,
} from '../shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'bot-db.json');

if (!DB_FILE.startsWith(DATA_DIR + path.sep)) {
  throw new Error('Ruta de almacenamiento fuera del directorio permitido.');
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createEmptyMissions(date = todayKey()): DailyMissionsProgress {
  return {
    date,
    messagesSent: 0,
    triviaWon: 0,
    repGiven: 0,
    claimed: false,
  };
}

export function createDefaultSecurity(): SecurityConfig {
  return {
    antiRaidEnabled: true,
    raidJoinThreshold: 5,
    raidWindowSec: 20,
    raidModeActive: false,
    raidAction: 'manual_approval',
    slowModeSec: 0,
    alertOnRaid: true,
  };
}

export function createDefaultEntertainment(): EntertainmentConfig {
  return {
    gamesEnabled: true,
    gameCooldownSec: 10,
    quietHoursEnabled: false,
    quietStartHour: 1,
    quietEndHour: 7,
    currencyName: 'Créditos',
    xpPerMessage: 12,
    coinsPerMessage: 4,
    dailyRewardCoins: 120,
    chestCostCoins: 80,
    shopItems: [
      {
        id: 'shop-vip',
        title: 'Pase VIP del Grupo',
        description: 'Exención de Anti-Links y bloqueos de contenido estándar.',
        price: 500,
        effect: 'grant_vip',
        enabled: true,
      },
      {
        id: 'shop-unwarn',
        title: 'Indulto (-1 Advertencia)',
        description: 'Elimina 1 advertencia activa de tu historial.',
        price: 300,
        effect: 'remove_warn',
        enabled: true,
      },
      {
        id: 'shop-badge-veteran',
        title: 'Insignia Veterano',
        description: 'Muestra la insignia [Veterano] en /perfil y /rank.',
        price: 200,
        effect: 'badge',
        badgeLabel: 'Veterano',
        enabled: true,
      },
    ],
    triviaQuestions: [
      {
        id: 'triv-1',
        question: '¿Qué comando de @BotFather permite que un bot lea mensajes en un grupo?',
        options: ['/setprivacy -> Disable', '/setcommands -> All', '/setinline -> On'],
        correctIndex: 0,
        rewardCoins: 45,
        rewardXp: 35,
      },
      {
        id: 'triv-2',
        question: '¿Qué modo de conexión funciona en Altare sin necesidad de dominio HTTPS?',
        options: ['Webhook TLS', 'Long Polling', 'SSH Tunnel'],
        correctIndex: 1,
        rewardCoins: 45,
        rewardXp: 35,
      },
      {
        id: 'triv-3',
        question: '¿Cuál es el límite típico de warns por defecto antes de sanción automática?',
        options: ['3 advertencias', '15 advertencias', 'No existe límite'],
        correctIndex: 0,
        rewardCoins: 40,
        rewardXp: 30,
      },
      {
        id: 'triv-4',
        question: '¿Qué lenguaje ejecuta de forma nativa la versión exportada del bot?',
        options: ['PHP 8', 'Node.js (JavaScript)', 'Ruby'],
        correctIndex: 1,
        rewardCoins: 40,
        rewardXp: 30,
      },
    ],
    hangmanWords: [
      'TELEGRAM',
      'ALTARE',
      'MODERADOR',
      'PRIVADO',
      'CAPTCHA',
      'CENTINELA',
      'SORTEO',
      'COMUNIDAD',
    ],
    activeGiveaways: [],
    activePolls: [],
    activeCoinRains: [],
  };
}

export function createInitialDatabase(): BotDatabase {
  const now = new Date();
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();
  const today = todayKey();

  const analytics = Array.from({ length: 8 }, (_, idx) => {
    const hour = new Date(now.getTime() - (7 - idx) * 3600_000).getHours();
    const label = `${String(hour).padStart(2, '0')}:00`;
    const sampleMsgs = [28, 35, 42, 31, 54, 48, 39, 46][idx] ?? 20;
    const sampleBlocked = [2, 1, 4, 1, 5, 3, 1, 2][idx] ?? 1;
    const sampleWarns = [1, 0, 2, 1, 2, 1, 0, 2][idx] ?? 0;
    const sampleGames = [4, 7, 11, 6, 15, 12, 9, 14][idx] ?? 5;
    return {
      label,
      messages: sampleMsgs,
      blocked: sampleBlocked,
      warnings: sampleWarns,
      gamesPlayed: sampleGames,
    };
  });

  return {
    version: 2,
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
    security: createDefaultSecurity(),
    entertainment: createDefaultEntertainment(),
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
        xp: 1850,
        level: 7,
        coins: 1240,
        reputation: 18,
        dailyStreak: 5,
        lastDailyAt: minsAgo(360),
        badges: ['Fundador'],
        dailyMissions: { date: today, messagesSent: 8, triviaWon: 1, repGiven: 1, claimed: false },
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
        xp: 1120,
        level: 5,
        coins: 760,
        reputation: 12,
        dailyStreak: 3,
        lastDailyAt: minsAgo(700),
        badges: ['Veterano'],
        dailyMissions: createEmptyMissions(today),
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
        xp: 410,
        level: 4,
        coins: 295,
        reputation: 3,
        dailyStreak: 1,
        lastDailyAt: null,
        badges: [],
        dailyMissions: createEmptyMissions(today),
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
        xp: 260,
        level: 3,
        coins: 185,
        reputation: 4,
        dailyStreak: 2,
        lastDailyAt: null,
        badges: [],
        dailyMissions: createEmptyMissions(today),
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
        xp: 90,
        level: 2,
        coins: 40,
        reputation: 0,
        dailyStreak: 0,
        lastDailyAt: null,
        badges: [],
        dailyMissions: createEmptyMissions(today),
      },
    ],
    customCommands: [
      {
        id: 'cmd-normas',
        trigger: '/normas',
        response:
          'Normas activas en {grupo}:\n\n1. Respeto mutuo.\n2. Sin enlaces externos ni spam.\n3. Consultas administrativas con /report.',
        adminOnly: false,
        deleteTrigger: false,
        enabled: true,
        usageCount: 24,
      },
      {
        id: 'cmd-soporte',
        trigger: '/soporte',
        response:
          'Hola {nombre}, para soporte técnico o dudas sobre tu acceso al grupo privado, escribe a @cmendoza_admin o usa /report seguido de tu consulta.',
        adminOnly: false,
        deleteTrigger: false,
        enabled: true,
        usageCount: 11,
      },
      {
        id: 'cmd-vip',
        trigger: '/vip',
        response:
          'Los miembros VIP cuentan con exención automática en el filtro de enlaces permitidos. Puedes canjear el Pase VIP en /shop.',
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
        detail: 'Base local cargada con reglas de grupo privado y entretenimiento.',
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
        text: 'Grupo privado listo. Prueba moderación (/help, /warn, /raid on) o entretenimiento (/daily, /trivia, /ahorcado, /shop, /sorteo).',
        messageType: 'text',
        timestamp: minsAgo(30),
      },
      {
        id: 'sim-2',
        senderId: '1001001',
        senderName: 'Carlos Mendoza',
        senderUsername: 'cmendoza_admin',
        senderRole: 'admin',
        text: '/top',
        messageType: 'text',
        timestamp: minsAgo(25),
      },
      {
        id: 'sim-3',
        senderId: 'bot',
        senderName: 'CentinelaTG',
        senderUsername: 'CentinelaTG_bot',
        senderRole: 'bot',
        text: 'Ranking de Nivel XP en Comunidad Privada VIP:\n1. @cmendoza_admin · Nivel 7 (1850 XP · 1240 Créditos)\n2. @elenav_vip · Nivel 5 (1120 XP · 760 Créditos)\n3. @msilva92 · Nivel 4 (410 XP · 295 Créditos)',
        messageType: 'text',
        timestamp: minsAgo(25),
      },
    ],
    analytics,
    stats: {
      totalMessagesProcessed: 293,
      blockedSpamCount: 18,
      captchasPassed: 42,
      totalWarningsIssued: 9,
      totalGamesPlayed: 78,
      raidsBlocked: 0,
    },
  };
}

class LocalFileStore {
  private db: BotDatabase | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private debounceTimer: NodeJS.Timeout | null = null;

  async init(): Promise<BotDatabase> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<BotDatabase>;
      this.db = this.mergeDefaults(parsed);
    } catch {
      this.db = createInitialDatabase();
      await this.flush();
    }
    return this.db;
  }

  mergeDefaults(loaded: Partial<BotDatabase>): BotDatabase {
    const fallback = createInitialDatabase();
    const defaultSec = createDefaultSecurity();
    const defaultEnt = createDefaultEntertainment();
    const today = todayKey();

    const members: MemberRecord[] = Array.isArray(loaded.members)
      ? loaded.members.map((m) => ({
          ...m,
          xp: typeof m.xp === 'number' ? m.xp : 0,
          level: typeof m.level === 'number' ? m.level : 1,
          coins: typeof m.coins === 'number' ? m.coins : 50,
          reputation: typeof m.reputation === 'number' ? m.reputation : 0,
          dailyStreak: typeof m.dailyStreak === 'number' ? m.dailyStreak : 0,
          lastDailyAt: m.lastDailyAt ?? null,
          badges: Array.isArray(m.badges) ? m.badges : [],
          dailyMissions: m.dailyMissions ?? createEmptyMissions(today),
        }))
      : fallback.members;

    return {
      version: 2,
      settings: { ...fallback.settings, ...(loaded.settings ?? {}) },
      automod: {
        ...fallback.automod,
        ...(loaded.automod ?? {}),
        locks: { ...fallback.automod.locks, ...(loaded.automod?.locks ?? {}) },
      },
      security: { ...defaultSec, ...(loaded.security ?? {}) },
      entertainment: {
        ...defaultEnt,
        ...(loaded.entertainment ?? {}),
        shopItems: Array.isArray(loaded.entertainment?.shopItems)
          ? loaded.entertainment.shopItems
          : defaultEnt.shopItems,
        triviaQuestions: Array.isArray(loaded.entertainment?.triviaQuestions)
          ? loaded.entertainment.triviaQuestions
          : defaultEnt.triviaQuestions,
        hangmanWords: Array.isArray(loaded.entertainment?.hangmanWords)
          ? loaded.entertainment.hangmanWords
          : defaultEnt.hangmanWords,
        activeGiveaways: Array.isArray(loaded.entertainment?.activeGiveaways)
          ? loaded.entertainment.activeGiveaways.slice(-30)
          : [],
        activePolls: Array.isArray(loaded.entertainment?.activePolls)
          ? loaded.entertainment.activePolls.slice(-20)
          : [],
        activeCoinRains: Array.isArray(loaded.entertainment?.activeCoinRains)
          ? loaded.entertainment.activeCoinRains.slice(-15)
          : [],
      },
      members,
      customCommands: Array.isArray(loaded.customCommands)
        ? loaded.customCommands
        : fallback.customCommands,
      auditLogs: Array.isArray(loaded.auditLogs)
        ? loaded.auditLogs.slice(0, 200)
        : fallback.auditLogs,
      simulatorMessages: Array.isArray(loaded.simulatorMessages)
        ? loaded.simulatorMessages.slice(-120)
        : fallback.simulatorMessages,
      analytics: Array.isArray(loaded.analytics) && loaded.analytics.length > 0
        ? loaded.analytics.slice(-24)
        : fallback.analytics,
      stats: { ...fallback.stats, ...(loaded.stats ?? {}) },
    };
  }

  get(): BotDatabase {
    if (!this.db) {
      throw new Error('La base de datos local no ha sido inicializada.');
    }
    return this.db;
  }

  async replaceDatabase(next: Partial<BotDatabase>): Promise<BotDatabase> {
    this.db = this.mergeDefaults(next);
    await this.save();
    return this.db;
  }

  async save(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pruneCollections();
    await this.flush();
  }

  scheduleSave(): void {
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.pruneCollections();
      void this.flush().catch(() => undefined);
    }, 2500);
  }

  async flushPending(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pruneCollections();
    await this.flush();
  }

  private pruneCollections(): void {
    if (!this.db) return;
    if (this.db.auditLogs.length > 200) this.db.auditLogs.length = 200;
    if (this.db.simulatorMessages.length > 120) {
      this.db.simulatorMessages = this.db.simulatorMessages.slice(-120);
    }
    if (this.db.analytics.length > 24) {
      this.db.analytics = this.db.analytics.slice(-24);
    }
    if (this.db.entertainment.activeGiveaways.length > 30) {
      this.db.entertainment.activeGiveaways = this.db.entertainment.activeGiveaways.slice(-30);
    }
    if (this.db.entertainment.activePolls.length > 20) {
      this.db.entertainment.activePolls = this.db.entertainment.activePolls.slice(-20);
    }
    if (this.db.entertainment.activeCoinRains.length > 15) {
      this.db.entertainment.activeCoinRains = this.db.entertainment.activeCoinRains.slice(-15);
    }
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
