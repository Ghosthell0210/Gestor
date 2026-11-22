export type CaptchaMode = 'button' | 'math' | 'off';
export type JoinApprovalMode = 'auto_captcha' | 'manual' | 'auto_all';
export type FloodAction = 'mute' | 'warn' | 'kick';
export type LinksAction = 'delete' | 'warn' | 'mute';
export type BadWordsAction = 'delete' | 'warn' | 'mute';
export type MaxWarnAction = 'mute' | 'kick' | 'ban';
export type RaidAction = 'manual_approval' | 'lock_all';
export type MemberRole = 'admin' | 'vip' | 'member';
export type MemberStatus =
  | 'verified'
  | 'pending_captcha'
  | 'pending_approval'
  | 'muted'
  | 'kicked'
  | 'banned';
export type MessageContentType =
  | 'text'
  | 'sticker'
  | 'gif'
  | 'media'
  | 'document'
  | 'voice'
  | 'forward';
export type AuditSource = 'telegram' | 'simulator' | 'panel';
export type AuditSeverity = 'info' | 'warning' | 'danger';
export type ShopEffectType = 'grant_vip' | 'remove_warn' | 'badge' | 'custom';

export interface InlineButtonConfig {
  text: string;
  url: string;
}

export interface BotSettings {
  groupName: string;
  welcomeEnabled: boolean;
  welcomeMessage: string;
  welcomeButtons: InlineButtonConfig[];
  cleanServiceMessages: boolean;
  captchaMode: CaptchaMode;
  captchaTimeoutSec: number;
  approveJoinRequests: JoinApprovalMode;
  rulesText: string;
  scheduledAnnouncementEnabled: boolean;
  scheduledAnnouncementIntervalMin: number;
  scheduledAnnouncementText: string;
}

export interface ContentLocks {
  stickers: boolean;
  gifs: boolean;
  media: boolean;
  documents: boolean;
  voice: boolean;
  all: boolean;
}

export interface AutomodConfig {
  antiFloodEnabled: boolean;
  floodMaxMessages: number;
  floodWindowSec: number;
  floodAction: FloodAction;
  antiLinksEnabled: boolean;
  blockTelegramLinks: boolean;
  blockForwards: boolean;
  allowedDomains: string[];
  linksAction: LinksAction;
  badWordsEnabled: boolean;
  badWords: string[];
  badWordsAction: BadWordsAction;
  locks: ContentLocks;
  maxWarns: number;
  maxWarnAction: MaxWarnAction;
  muteDurationMin: number;
}

export interface SecurityConfig {
  antiRaidEnabled: boolean;
  raidJoinThreshold: number;
  raidWindowSec: number;
  raidModeActive: boolean;
  raidAction: RaidAction;
  slowModeSec: number;
  alertOnRaid: boolean;
}

export interface WarnEntry {
  id: string;
  reason: string;
  by: string;
  at: string;
}

export interface DailyMissionsProgress {
  date: string;
  messagesSent: number;
  triviaWon: number;
  repGiven: number;
  claimed: boolean;
}

export interface MemberRecord {
  id: string;
  name: string;
  username: string;
  role: MemberRole;
  status: MemberStatus;
  warns: number;
  warnHistory: WarnEntry[];
  mutedUntil: string | null;
  joinedAt: string;
  lastActiveAt: string;
  messageCount: number;
  pendingCaptchaAnswer?: string;
  xp: number;
  level: number;
  coins: number;
  reputation: number;
  dailyStreak: number;
  lastDailyAt: string | null;
  badges: string[];
  dailyMissions: DailyMissionsProgress;
}

export interface CustomCommand {
  id: string;
  trigger: string;
  response: string;
  adminOnly: boolean;
  deleteTrigger: boolean;
  enabled: boolean;
  usageCount: number;
}

export interface ShopItem {
  id: string;
  title: string;
  description: string;
  price: number;
  effect: ShopEffectType;
  badgeLabel?: string;
  enabled: boolean;
}

export interface TriviaQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  rewardCoins: number;
  rewardXp: number;
}

export interface GiveawayRecord {
  id: string;
  prize: string;
  winnersCount: number;
  endsAt: string;
  participants: string[];
  winnerIds: string[];
  status: 'active' | 'ended';
  createdBy: string;
}

export interface PollRecord {
  id: string;
  question: string;
  options: { text: string; votes: string[] }[];
  createdBy: string;
  createdAt: string;
}

export interface CoinRainRecord {
  id: string;
  totalCoins: number;
  remainingCoins: number;
  maxClaims: number;
  claimedBy: string[];
  createdBy: string;
}

export interface EntertainmentConfig {
  gamesEnabled: boolean;
  gameCooldownSec: number;
  quietHoursEnabled: boolean;
  quietStartHour: number;
  quietEndHour: number;
  currencyName: string;
  xpPerMessage: number;
  coinsPerMessage: number;
  dailyRewardCoins: number;
  chestCostCoins: number;
  shopItems: ShopItem[];
  triviaQuestions: TriviaQuestion[];
  hangmanWords: string[];
  activeGiveaways: GiveawayRecord[];
  activePolls: PollRecord[];
  activeCoinRains: CoinRainRecord[];
}

export interface AnalyticsBucket {
  label: string;
  messages: number;
  blocked: number;
  warnings: number;
  gamesPlayed: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  source: AuditSource;
  action: string;
  actor: string;
  target: string;
  detail: string;
  severity: AuditSeverity;
}

export interface SimulatorButton {
  text: string;
  callbackData?: string;
  url?: string;
}

export interface SimulatorMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderRole: MemberRole | 'bot' | 'system';
  text: string;
  messageType: MessageContentType;
  timestamp: string;
  deleted?: boolean;
  pinned?: boolean;
  buttons?: SimulatorButton[];
}

export interface BotStats {
  totalMessagesProcessed: number;
  blockedSpamCount: number;
  captchasPassed: number;
  totalWarningsIssued: number;
  totalGamesPlayed: number;
  raidsBlocked: number;
}

export interface BotDatabase {
  version: number;
  settings: BotSettings;
  automod: AutomodConfig;
  security: SecurityConfig;
  entertainment: EntertainmentConfig;
  members: MemberRecord[];
  customCommands: CustomCommand[];
  auditLogs: AuditLogEntry[];
  simulatorMessages: SimulatorMessage[];
  analytics: AnalyticsBucket[];
  stats: BotStats;
}

export interface BotRuntimeInfo {
  telegramConnected: boolean;
  botUsername: string | null;
  mode: 'telegram_polling' | 'simulator_only';
  startedAt: string;
  uptimeSec: number;
  lastError: string | null;
  groupChatIdConfigured: boolean;
  adminCountConfigured: number;
}

export interface BotStateSnapshot {
  database: BotDatabase;
  runtime: BotRuntimeInfo;
}
