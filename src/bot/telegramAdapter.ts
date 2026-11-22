import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { botEngine, escapeHtml } from './engine.ts';
import type { BotEffect } from './engine.ts';
import { entertainmentEngine } from './entertainment.ts';
import { store } from './storage.ts';
import { buildTelegramCommandScopes } from '../shared/commandsCatalog.ts';
import type { BotRuntimeInfo, MessageContentType } from '../shared/types.ts';

function parseAdminIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function detectContentType(ctx: Context): MessageContentType {
  const msg = ctx.message;
  if (!msg) return 'text';
  if ('forward_origin' in msg && msg.forward_origin) return 'forward';
  if (msg.sticker) return 'sticker';
  if (msg.animation) return 'gif';
  if (msg.photo || msg.video || msg.video_note) return 'media';
  if (msg.document) return 'document';
  if (msg.voice || msg.audio) return 'voice';
  return 'text';
}

function buildKeyboard(buttons?: { text: string; callbackData?: string; url?: string }[]) {
  if (!buttons || buttons.length === 0) return undefined;
  const kb = new InlineKeyboard();
  buttons.forEach((btn, idx) => {
    if (btn.url) {
      kb.url(btn.text, btn.url);
    } else if (btn.callbackData) {
      kb.text(btn.text, btn.callbackData);
    }
    if (idx % 2 === 1 && idx < buttons.length - 1) kb.row();
  });
  return kb;
}

class TelegramLongPollingAdapter {
  private bot: Bot | null = null;
  private startedAt = new Date();
  private botUsername: string | null = null;
  private telegramConnected = false;
  private lastError: string | null = null;
  private backgroundTimer: NodeJS.Timeout | null = null;

  getRuntimeInfo(): BotRuntimeInfo {
    const adminIds = parseAdminIds();
    return {
      telegramConnected: this.telegramConnected,
      botUsername: this.botUsername,
      mode: this.telegramConnected ? 'telegram_polling' : 'simulator_only',
      startedAt: this.startedAt.toISOString(),
      uptimeSec: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      lastError: this.lastError,
      groupChatIdConfigured: Boolean(process.env.GROUP_CHAT_ID?.trim()),
      adminCountConfigured: adminIds.size,
    };
  }

  private async isTelegramAdmin(ctx: Context, userId: string): Promise<boolean> {
    if (parseAdminIds().has(userId)) return true;
    if (!ctx.chat || ctx.chat.type === 'private') return false;
    try {
      const member = await ctx.getChatMember(Number(userId));
      return member.status === 'administrator' || member.status === 'creator';
    } catch {
      return false;
    }
  }

  private async executeEffects(ctx: Context, effects: BotEffect[]) {
    const chatId = ctx.chat?.id;
    for (const eff of effects) {
      try {
        if (eff.type === 'delete_incoming' && ctx.message && chatId) {
          await ctx.api.deleteMessage(chatId, ctx.message.message_id).catch(() => undefined);
        } else if (eff.type === 'reply' && eff.text && chatId) {
          const sent = await ctx.api.sendMessage(chatId, escapeHtml(eff.text), {
            parse_mode: 'HTML',
            reply_markup: buildKeyboard(eff.buttons),
          });
          if (eff.pinned) {
            await ctx.api.pinChatMessage(chatId, sent.message_id).catch(() => undefined);
          }
        } else if (eff.type === 'pin_message' && eff.text && chatId) {
          const sent = await ctx.api.sendMessage(chatId, escapeHtml(eff.text), { parse_mode: 'HTML' });
          await ctx.api.pinChatMessage(chatId, sent.message_id).catch(() => undefined);
        } else if (eff.type === 'unpin_message' && chatId) {
          await ctx.api.unpinChatMessage(chatId).catch(() => undefined);
        } else if (eff.type === 'mute_user' && eff.targetUserId && chatId) {
          const until = Math.floor(Date.now() / 1000) + (eff.durationMin ?? 30) * 60;
          await ctx.api
            .restrictChatMember(
              chatId,
              Number(eff.targetUserId),
              { can_send_messages: false },
              { until_date: until }
            )
            .catch(() => undefined);
        } else if (eff.type === 'unmute_user' && eff.targetUserId && chatId) {
          await ctx.api
            .restrictChatMember(chatId, Number(eff.targetUserId), {
              can_send_messages: true,
              can_send_polls: true,
              can_send_other_messages: true,
              can_add_web_page_previews: true,
            })
            .catch(() => undefined);
        } else if (eff.type === 'kick_user' && eff.targetUserId && chatId) {
          await ctx.api.banChatMember(chatId, Number(eff.targetUserId)).catch(() => undefined);
          await ctx.api.unbanChatMember(chatId, Number(eff.targetUserId)).catch(() => undefined);
        } else if (eff.type === 'ban_user' && eff.targetUserId && chatId) {
          await ctx.api.banChatMember(chatId, Number(eff.targetUserId)).catch(() => undefined);
        } else if (eff.type === 'unban_user' && eff.targetUserId && chatId) {
          await ctx.api.unbanChatMember(chatId, Number(eff.targetUserId)).catch(() => undefined);
        } else if (eff.type === 'approve_join' && eff.targetUserId && chatId) {
          await ctx.api.approveChatJoinRequest(chatId, Number(eff.targetUserId)).catch(() => undefined);
        } else if (eff.type === 'decline_join' && eff.targetUserId && chatId) {
          await ctx.api.declineChatJoinRequest(chatId, Number(eff.targetUserId)).catch(() => undefined);
        }
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : 'Error ejecutando acción en Telegram';
      }
    }
  }

  async start(): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    this.startBackgroundLoop();

    if (!token) {
      this.telegramConnected = false;
      this.botUsername = null;
      this.lastError = null;
      return;
    }

    try {
      const bot = new Bot(token);
      this.bot = bot;

      bot.catch((err) => {
        this.lastError = err.error instanceof Error ? err.error.message : String(err.error);
      });

      bot.on('chat_join_request', async (ctx) => {
        const user = ctx.chatJoinRequest.from;
        const effects = await botEngine.handleJoinRequest('telegram', {
          id: String(user.id),
          name: [user.first_name, user.last_name].filter(Boolean).join(' '),
          username: user.username ?? `user_${user.id}`,
        });
        await this.executeEffects(ctx, effects);
      });

      bot.on('message:new_chat_members', async (ctx) => {
        const db = store.get();
        if (db.settings.cleanServiceMessages && ctx.chat) {
          await ctx.deleteMessage().catch(() => undefined);
        }
        for (const member of ctx.message.new_chat_members) {
          if (member.is_bot) continue;
          const effects = await botEngine.handleJoinRequest('telegram', {
            id: String(member.id),
            name: [member.first_name, member.last_name].filter(Boolean).join(' '),
            username: member.username ?? `user_${member.id}`,
          });
          await this.executeEffects(ctx, effects);
        }
      });

      bot.on('message:left_chat_member', async (ctx) => {
        const db = store.get();
        if (db.settings.cleanServiceMessages) {
          await ctx.deleteMessage().catch(() => undefined);
        }
      });

      bot.on('callback_query:data', async (ctx) => {
        const user = ctx.from;
        const isAdmin = await this.isTelegramAdmin(ctx, String(user.id));
        const res = await botEngine.handleCallback(
          'telegram',
          {
            id: String(user.id),
            name: [user.first_name, user.last_name].filter(Boolean).join(' '),
            username: user.username ?? `user_${user.id}`,
            isAdmin,
          },
          ctx.callbackQuery.data
        );
        await ctx.answerCallbackQuery({ text: res.replyText.slice(0, 180) }).catch(() => undefined);
        await this.executeEffects(ctx, res.effects);
      });

      bot.on('message', async (ctx) => {
        const user = ctx.from;
        if (!user || user.is_bot) return;
        const isAdmin = await this.isTelegramAdmin(ctx, String(user.id));
        const replyFrom = ctx.message.reply_to_message?.from;
        const targetUser = replyFrom
          ? {
              id: String(replyFrom.id),
              name: [replyFrom.first_name, replyFrom.last_name].filter(Boolean).join(' '),
              username: replyFrom.username ?? `user_${replyFrom.id}`,
            }
          : null;

        const { effects } = await botEngine.processIncoming({
          source: 'telegram',
          chatTitle: ctx.chat && 'title' in ctx.chat ? ctx.chat.title : undefined,
          actor: {
            id: String(user.id),
            name: [user.first_name, user.last_name].filter(Boolean).join(' '),
            username: user.username ?? `user_${user.id}`,
            isAdmin,
          },
          text: ctx.message.text ?? ctx.message.caption ?? '',
          contentType: detectContentType(ctx),
          targetUser,
          messageId: String(ctx.message.message_id),
        });

        await this.executeEffects(ctx, effects);
      });

      const me = await bot.api.getMe();
      this.botUsername = me.username ?? me.first_name;
      this.telegramConnected = true;
      this.lastError = null;

      await this.syncTelegramCommands();

      bot.start({
        drop_pending_updates: true,
        allowed_updates: ['message', 'callback_query', 'chat_join_request'],
      });
    } catch (err) {
      this.telegramConnected = false;
      this.lastError = err instanceof Error ? err.message : 'No se pudo conectar con Telegram Bot API';
    }
  }

  async syncTelegramCommands(): Promise<void> {
    if (!this.bot || !this.telegramConnected) return;
    try {
      const { memberCommands, adminCommands } = buildTelegramCommandScopes(store.get().customCommands);
      await this.bot.api.setMyCommands(memberCommands);
      await this.bot.api.setMyCommands(memberCommands, { scope: { type: 'all_group_chats' } });
      await this.bot.api.setMyCommands(adminCommands, { scope: { type: 'all_chat_administrators' } });
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'No se pudo sincronizar el menú de comandos';
    }
  }

  async syncPanelSanction(
    memberId: string,
    action: 'mute' | 'unmute' | 'kick' | 'ban' | 'unban'
  ): Promise<void> {
    const groupId = process.env.GROUP_CHAT_ID?.trim();
    if (!this.bot || !this.telegramConnected || !groupId) return;
    const chatId = Number(groupId);
    const uid = Number(memberId);
    if (!Number.isFinite(chatId) || !Number.isFinite(uid)) return;

    const db = store.get();
    if (action === 'mute') {
      const until = Math.floor(Date.now() / 1000) + db.automod.muteDurationMin * 60;
      await this.bot.api.restrictChatMember(chatId, uid, { can_send_messages: false }, { until_date: until }).catch(() => undefined);
    } else if (action === 'unmute') {
      await this.bot.api
        .restrictChatMember(chatId, uid, {
          can_send_messages: true,
          can_send_polls: true,
          can_send_other_messages: true,
        })
        .catch(() => undefined);
    } else if (action === 'kick') {
      await this.bot.api.banChatMember(chatId, uid).catch(() => undefined);
      await this.bot.api.unbanChatMember(chatId, uid).catch(() => undefined);
    } else if (action === 'ban') {
      await this.bot.api.banChatMember(chatId, uid).catch(() => undefined);
    } else if (action === 'unban') {
      await this.bot.api.unbanChatMember(chatId, uid).catch(() => undefined);
    }
  }

  private startBackgroundLoop() {
    if (this.backgroundTimer) clearInterval(this.backgroundTimer);
    let lastPostedAt = Date.now();
    this.backgroundTimer = setInterval(async () => {
      try {
        const db = store.get();
        const groupId = process.env.GROUP_CHAT_ID?.trim();

        // Check expired giveaways
        const nowMs = Date.now();
        let changed = false;
        for (const g of db.entertainment.activeGiveaways) {
          if (g.status === 'active' && new Date(g.endsAt).getTime() <= nowMs) {
            const msg = entertainmentEngine.closeGiveaway(g.id);
            changed = true;
            if (this.bot && this.telegramConnected && groupId) {
              await this.bot.api.sendMessage(Number(groupId), escapeHtml(msg), { parse_mode: 'HTML' }).catch(() => undefined);
            }
          }
        }
        if (changed) await store.save();

        // Scheduled announcement
        if (!db.settings.scheduledAnnouncementEnabled) return;
        const intervalMs = Math.max(15, db.settings.scheduledAnnouncementIntervalMin) * 60_000;
        if (nowMs - lastPostedAt < intervalMs) return;
        lastPostedAt = nowMs;
        if (this.bot && this.telegramConnected && groupId) {
          await this.bot.api
            .sendMessage(Number(groupId), escapeHtml(db.settings.scheduledAnnouncementText), {
              parse_mode: 'HTML',
            })
            .catch(() => undefined);
        }
      } catch {
        // Ignore transient timer errors
      }
    }, 60_000);
    this.backgroundTimer.unref();
  }

  async stop(): Promise<void> {
    if (this.backgroundTimer) clearInterval(this.backgroundTimer);
    if (this.bot) {
      await this.bot.stop().catch(() => undefined);
    }
    await store.flushPending();
  }
}

export const telegramAdapter = new TelegramLongPollingAdapter();
