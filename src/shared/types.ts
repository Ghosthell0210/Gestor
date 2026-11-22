export type CaptchaMode = 'button' | 'math' | 'off';
export type JoinApprovalMode = 'auto_captcha' | 'manual' | 'auto_all';
export type FloodAction = 'mute' | 'warn' | 'kick';
export type LinksAction = 'delete' | 'warn' | 'mute';
export type BadWordsAction = 'delete' | 'warn' | 'mute';
export type MaxWarnAction = 'mute' | 'kick' | 'ban';
export type MemberRole = 'admin' | 'vip' | 'member';
export type MemberStatus = 'verified' | 'pending_captcha' | 'pending_approval' | 'muted' | 'kicked' | 'banned';
export type MessageContentType = 'text' | 'sticker' | 'gif' | 'media' | 'document' | 'voice' | 'forward';
export type AuditSource = 'telegram' | 'simulator' | 'panel';
export type AuditSeverity = 'info' | 'warning' | 'danger';

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

export interface WarnEntry {
  id: string;
  reason: string;
  by: string;
  at: string;
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
}

export interface BotDatabase {
  version: number;
  settings: BotSettings;
  automod: AutomodConfig;
  members: MemberRecord[];
  customCommands: CustomCommand[];
  auditLogs: AuditLogEntry[];
  simulatorMessages: SimulatorMessage[];
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
