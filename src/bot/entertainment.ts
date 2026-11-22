import crypto from 'node:crypto';
import { store, createEmptyMissions, todayKey } from './storage.ts';
import type {
  AuditSource,
  MemberRecord,
  SimulatorButton,
  TriviaQuestion,
} from '../shared/types.ts';

interface ActiveTriviaSession {
  id: string;
  question: TriviaQuestion;
  solved: boolean;
  createdAt: number;
}

interface ActiveDuelSession {
  id: string;
  challengerId: string;
  opponentId: string;
  wager: number;
  createdAt: number;
}

interface ActiveHangmanSession {
  word: string;
  guessed: Set<string>;
  wrongGuesses: number;
  maxWrong: number;
  rewardCoins: number;
  rewardXp: number;
  startedAt: number;
}

interface ActiveMathBlitz {
  prompt: string;
  answer: number;
  rewardCoins: number;
  rewardXp: number;
  startedAt: number;
}

export interface EntertainmentResponse {
  handled: boolean;
  replyText?: string;
  buttons?: SimulatorButton[];
  playedGame?: boolean;
  auditAction?: string;
  auditTarget?: string;
  auditDetail?: string;
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}

export function calculateLevel(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 45)) + 1;
}

export function ensureTodayMissions(member: MemberRecord): void {
  const today = todayKey();
  if (!member.dailyMissions || member.dailyMissions.date !== today) {
    member.dailyMissions = createEmptyMissions(today);
  }
}

function isWithinQuietHours(startHour: number, endHour: number): boolean {
  const h = new Date().getHours();
  if (startHour === endHour) return false;
  if (startHour < endHour) {
    return h >= startHour && h < endHour;
  }
  return h >= startHour || h < endHour;
}

class EntertainmentEngine {
  private xpCooldown = new Map<string, number>();
  private gameCooldown = new Map<string, number>();
  private repCooldown = new Map<string, number>();
  private activeTrivias = new Map<string, ActiveTriviaSession>();
  private activeDuels = new Map<string, ActiveDuelSession>();
  private activeHangman: ActiveHangmanSession | null = null;
  private activeMathBlitz: ActiveMathBlitz | null = null;

  pruneMemory(): void {
    const now = Date.now();
    for (const [k, ts] of this.xpCooldown) {
      if (now - ts > 60_000) this.xpCooldown.delete(k);
    }
    for (const [k, ts] of this.gameCooldown) {
      if (now - ts > 300_000) this.gameCooldown.delete(k);
    }
    for (const [k, ts] of this.repCooldown) {
      if (now - ts > 600_000) this.repCooldown.delete(k);
    }
    for (const [k, s] of this.activeTrivias) {
      if (now - s.createdAt > 900_000) this.activeTrivias.delete(k);
    }
    for (const [k, d] of this.activeDuels) {
      if (now - d.createdAt > 600_000) this.activeDuels.delete(k);
    }
    if (this.activeHangman && now - this.activeHangman.startedAt > 900_000) {
      this.activeHangman = null;
    }
    if (this.activeMathBlitz && now - this.activeMathBlitz.startedAt > 300_000) {
      this.activeMathBlitz = null;
    }
  }

  awardChatActivity(member: MemberRecord): string | null {
    const db = store.get();
    ensureTodayMissions(member);
    member.dailyMissions.messagesSent += 1;

    const now = Date.now();
    const lastAward = this.xpCooldown.get(member.id) ?? 0;
    if (now - lastAward < 15_000) {
      return null;
    }
    this.xpCooldown.set(member.id, now);

    const prevLevel = member.level;
    member.xp += db.entertainment.xpPerMessage;
    member.coins += db.entertainment.coinsPerMessage;
    member.level = calculateLevel(member.xp);

    if (member.level > prevLevel) {
      return `¡@${member.username} subió al Nivel ${member.level}! (${member.xp} XP)`;
    }
    return null;
  }

  private checkGameAccess(member: MemberRecord, isAdmin: boolean): string | null {
    const db = store.get();
    const ent = db.entertainment;
    if (!ent.gamesEnabled && !isAdmin) {
      return 'Los juegos están pausados temporalmente por un administrador.';
    }
    if (ent.quietHoursEnabled && !isAdmin && isWithinQuietHours(ent.quietStartHour, ent.quietEndHour)) {
      return `Horario silencioso activo (${ent.quietStartHour}:00 - ${ent.quietEndHour}:00). Los juegos vuelven más tarde.`;
    }
    if (!isAdmin && ent.gameCooldownSec > 0) {
      const now = Date.now();
      const last = this.gameCooldown.get(member.id) ?? 0;
      const waitSec = Math.ceil((last + ent.gameCooldownSec * 1000 - now) / 1000);
      if (waitSec > 0) {
        return `Espera ${waitSec}s antes de usar otro comando de juego.`;
      }
      this.gameCooldown.set(member.id, now);
    }
    return null;
  }

  private resolveTarget(query: string): MemberRecord | null {
    const clean = query.trim().replace(/^@/, '').toLowerCase();
    if (!clean) return null;
    return (
      store.get().members.find(
        (m) =>
          m.id.toLowerCase() === clean ||
          m.username.toLowerCase() === clean ||
          m.name.toLowerCase() === clean
      ) ?? null
    );
  }

  private renderHangmanDisplay(session: ActiveHangmanSession): string {
    const masked = session.word
      .split('')
      .map((ch) => (session.guessed.has(ch) ? ch : '_'))
      .join(' ');
    return `${masked}\nFallos: ${session.wrongGuesses}/${session.maxWrong}`;
  }

  handleActiveChallengeGuess(member: MemberRecord, text: string): EntertainmentResponse | null {
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('/') || trimmed.startsWith('!')) return null;

    if (this.activeMathBlitz && /^-?\d+$/.test(trimmed)) {
      const guess = Number.parseInt(trimmed, 10);
      if (guess === this.activeMathBlitz.answer) {
        const blitz = this.activeMathBlitz;
        this.activeMathBlitz = null;
        member.coins += blitz.rewardCoins;
        member.xp += blitz.rewardXp;
        member.level = calculateLevel(member.xp);
        store.get().stats.totalGamesPlayed += 1;
        return {
          handled: true,
          playedGame: true,
          replyText: `¡Correcto @${member.username}! La respuesta era ${blitz.answer}. Ganaste +${blitz.rewardCoins} ${store.get().entertainment.currencyName} y +${blitz.rewardXp} XP.`,
        };
      }
    }

    if (this.activeHangman) {
      const normalized = trimmed
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      if (/^[A-ZÑ]$/.test(normalized) || normalized === this.activeHangman.word) {
        const hm = this.activeHangman;
        if (normalized === hm.word) {
          this.activeHangman = null;
          member.coins += hm.rewardCoins;
          member.xp += hm.rewardXp;
          member.level = calculateLevel(member.xp);
          store.get().stats.totalGamesPlayed += 1;
          return {
            handled: true,
            playedGame: true,
            replyText: `¡@${member.username} adivinó la palabra "${hm.word}"! Premio: +${hm.rewardCoins} ${store.get().entertainment.currencyName} y +${hm.rewardXp} XP.`,
          };
        }

        if (hm.guessed.has(normalized)) {
          return { handled: true, replyText: `La letra "${normalized}" ya fue probada.` };
        }
        hm.guessed.add(normalized);
        if (hm.word.includes(normalized)) {
          const solved = hm.word.split('').every((ch) => hm.guessed.has(ch));
          if (solved) {
            this.activeHangman = null;
            member.coins += hm.rewardCoins;
            member.xp += hm.rewardXp;
            member.level = calculateLevel(member.xp);
            store.get().stats.totalGamesPlayed += 1;
            return {
              handled: true,
              playedGame: true,
              replyText: `¡@${member.username} completó la palabra "${hm.word}"! Premio: +${hm.rewardCoins} ${store.get().entertainment.currencyName} y +${hm.rewardXp} XP.`,
            };
          }
          return {
            handled: true,
            replyText: `¡Letra "${normalized}" correcta!\n${this.renderHangmanDisplay(hm)}`,
          };
        }

        hm.wrongGuesses += 1;
        if (hm.wrongGuesses >= hm.maxWrong) {
          this.activeHangman = null;
          return {
            handled: true,
            playedGame: true,
            replyText: `Fin del ahorcado. Nadie acertó a tiempo; la palabra era "${hm.word}".`,
          };
        }
        return {
          handled: true,
          replyText: `La letra "${normalized}" no está.\n${this.renderHangmanDisplay(hm)}`,
        };
      }
    }

    return null;
  }

  handleCommand(
    member: MemberRecord,
    isAdmin: boolean,
    rawCmd: string,
    args: string[],
    explicitTarget?: MemberRecord | null
  ): EntertainmentResponse {
    const db = store.get();
    const ent = db.entertainment;
    const currency = ent.currencyName;

    // +rep shorthand
    if (rawCmd === '+rep') {
      return this.giveReputation(member, args[0] ?? '', explicitTarget);
    }

    switch (rawCmd) {
      case '/games': {
        if (!isAdmin) {
          return { handled: true, replyText: 'Solo los administradores pueden cambiar el estado de los juegos.' };
        }
        const mode = (args[0] ?? '').toLowerCase();
        if (mode !== 'on' && mode !== 'off') {
          return { handled: true, replyText: `Juegos actualmente: ${ent.gamesEnabled ? 'ACTIVOS' : 'PAUSADOS'}. Usa /games on o /games off.` };
        }
        ent.gamesEnabled = mode === 'on';
        return {
          handled: true,
          replyText: `Entretenimiento y minijuegos ${ent.gamesEnabled ? 'activados' : 'pausados'} por administración.`,
          auditAction: ent.gamesEnabled ? 'Juegos activados' : 'Juegos pausados',
          auditTarget: db.settings.groupName,
          auditDetail: `Cambio por @${member.username}`,
        };
      }

      case '/rank':
      case '/perfil':
      case '/balance': {
        ensureTodayMissions(member);
        const badgesText = member.badges.length > 0 ? member.badges.join(', ') : 'Sin insignias';
        return {
          handled: true,
          replyText: `Perfil de ${member.name} (@${member.username})\nNivel: ${member.level} (${member.xp} XP) · ${currency}: ${member.coins}\nReputación: +${member.reputation} · Racha diaria: ${member.dailyStreak} días\nInsignias: ${badgesText}`,
        };
      }

      case '/top': {
        const mode = (args[0] ?? 'xp').toLowerCase();
        const sorted = [...db.members].sort((a, b) => {
          if (mode === 'coins' || mode === 'monedas') return b.coins - a.coins;
          if (mode === 'rep') return b.reputation - a.reputation;
          return b.xp - a.xp;
        });
        const label =
          mode === 'coins' || mode === 'monedas'
            ? currency
            : mode === 'rep'
              ? 'Reputación'
              : 'Nivel XP';
        const lines = sorted.slice(0, 5).map((m, i) => {
          const metric =
            mode === 'coins' || mode === 'monedas'
              ? `${m.coins} ${currency}`
              : mode === 'rep'
                ? `+${m.reputation} rep`
                : `Nivel ${m.level} (${m.xp} XP)`;
          return `${i + 1}. @${m.username} · ${metric}`;
        });
        return {
          handled: true,
          replyText: `Ranking (${label}) en ${db.settings.groupName}:\n${lines.join('\n')}`,
        };
      }

      case '/daily': {
        const now = Date.now();
        if (member.lastDailyAt) {
          const elapsedMs = now - new Date(member.lastDailyAt).getTime();
          if (elapsedMs < 20 * 3600_000) {
            const hrsLeft = Math.ceil((20 * 3600_000 - elapsedMs) / 3600_000);
            return {
              handled: true,
              replyText: `@${member.username}, ya reclamaste tu recompensa diaria. Vuelve en ~${hrsLeft}h.`,
            };
          }
          member.dailyStreak = elapsedMs < 48 * 3600_000 ? member.dailyStreak + 1 : 1;
        } else {
          member.dailyStreak = 1;
        }
        member.lastDailyAt = new Date(now).toISOString();
        const streakBonus = Math.min(100, (member.dailyStreak - 1) * 15);
        const total = ent.dailyRewardCoins + streakBonus;
        member.coins += total;
        member.xp += 25;
        member.level = calculateLevel(member.xp);
        return {
          handled: true,
          replyText: `Recompensa diaria para @${member.username}: +${total} ${currency} (racha de ${member.dailyStreak} días) y +25 XP. Saldo: ${member.coins}.`,
        };
      }

      case '/misiones': {
        ensureTodayMissions(member);
        const m = member.dailyMissions;
        const m1 = m.messagesSent >= 10;
        const m2 = m.triviaWon >= 1;
        const m3 = m.repGiven >= 1;
        if (m1 && m2 && m3 && !m.claimed) {
          m.claimed = true;
          member.coins += 150;
          member.xp += 60;
          member.level = calculateLevel(member.xp);
          return {
            handled: true,
            replyText: `¡Misiones diarias completadas por @${member.username}! Recompensa reclamada: +150 ${currency} y +60 XP.`,
          };
        }
        return {
          handled: true,
          replyText: `Misiones diarias de @${member.username} (${m.claimed ? 'RECLAMADAS' : 'En progreso'}):\n• Enviar 10 mensajes: ${Math.min(10, m.messagesSent)}/10\n• Ganar 1 trivia: ${Math.min(1, m.triviaWon)}/1\n• Agradecer con /gracias: ${Math.min(1, m.repGiven)}/1\nPremio al completar las 3: +150 ${currency} y +60 XP.`,
        };
      }

      case '/gracias': {
        return this.giveReputation(member, args[0] ?? '', explicitTarget);
      }

      case '/pay': {
        const target = explicitTarget ?? this.resolveTarget(args[0] ?? '');
        const rawAmt = explicitTarget ? args[0] : args[1];
        const amount = Number.parseInt(rawAmt ?? '', 10);
        if (!target || target.id === member.id || !Number.isFinite(amount) || amount <= 0) {
          return { handled: true, replyText: 'Uso: /pay @usuario <cantidad>' };
        }
        if (member.coins < amount) {
          return { handled: true, replyText: `Saldo insuficiente. Tienes ${member.coins} ${currency}.` };
        }
        member.coins -= amount;
        target.coins += amount;
        return {
          handled: true,
          replyText: `@${member.username} transfirió ${amount} ${currency} a @${target.username}.`,
        };
      }

      case '/shop': {
        const activeItems = ent.shopItems.filter((i) => i.enabled);
        if (activeItems.length === 0) {
          return { handled: true, replyText: 'La tienda está vacía por el momento.' };
        }
        const list = activeItems
          .map((item, idx) => `${idx + 1}. ${item.title} — ${item.price} ${currency}\n   ${item.description}`)
          .join('\n');
        return {
          handled: true,
          replyText: `Tienda de ${db.settings.groupName} (tu saldo: ${member.coins} ${currency}):\n${list}\nCompra usando: /buy <número>`,
        };
      }

      case '/buy': {
        const activeItems = ent.shopItems.filter((i) => i.enabled);
        const query = (args[0] ?? '').trim();
        const index = Number.parseInt(query, 10) - 1;
        const item =
          (Number.isFinite(index) ? activeItems[index] : undefined) ??
          activeItems.find((i) => i.id.toLowerCase() === query.toLowerCase());
        if (!item) {
          return { handled: true, replyText: 'Artículo no encontrado. Usa /shop para ver los números disponibles.' };
        }
        if (member.coins < item.price) {
          return {
            handled: true,
            replyText: `Necesitas ${item.price} ${currency} para "${item.title}" (tienes ${member.coins}).`,
          };
        }

        if (item.effect === 'remove_warn' && member.warns === 0) {
          return { handled: true, replyText: 'No tienes advertencias activas para eliminar.' };
        }
        if (item.effect === 'grant_vip' && (member.role === 'vip' || member.role === 'admin')) {
          return { handled: true, replyText: 'Ya cuentas con rol VIP o superior.' };
        }

        member.coins -= item.price;
        let outcome = `Compraste "${item.title}" por ${item.price} ${currency}.`;
        if (item.effect === 'grant_vip') {
          member.role = 'vip';
          outcome = `¡@${member.username} canjeó el Pase VIP por ${item.price} ${currency}!`;
        } else if (item.effect === 'remove_warn') {
          member.warns = Math.max(0, member.warns - 1);
          member.warnHistory.shift();
          outcome = `¡@${member.username} eliminó 1 advertencia usando ${item.price} ${currency}! (${member.warns}/${db.automod.maxWarns}).`;
        } else if (item.effect === 'badge' && item.badgeLabel) {
          if (!member.badges.includes(item.badgeLabel)) {
            member.badges.push(item.badgeLabel);
          }
          outcome = `¡@${member.username} desbloqueó la insignia [${item.badgeLabel}]!`;
        }
        return {
          handled: true,
          replyText: outcome,
          auditAction: 'Compra en tienda',
          auditTarget: `@${member.username}`,
          auditDetail: `${item.title} (${item.price} ${currency})`,
        };
      }

      case '/cofre': {
        const blocked = this.checkGameAccess(member, isAdmin);
        if (blocked) return { handled: true, replyText: blocked };
        const cost = ent.chestCostCoins;
        if (member.coins < cost) {
          return { handled: true, replyText: `Un cofre misterioso cuesta ${cost} ${currency}. Tienes ${member.coins}.` };
        }
        member.coins -= cost;
        const roll = crypto.randomInt(0, 100);
        let msg = '';
        if (roll < 12) {
          const prize = cost * 2 + 40;
          member.coins += prize;
          member.xp += 50;
          msg = `¡Cofre Legendario! @${member.username} encontró +${prize} ${currency} y +50 XP.`;
        } else if (roll < 45) {
          const prize = cost + 35;
          member.coins += prize;
          msg = `¡Cofre Dorado! @${member.username} obtuvo +${prize} ${currency}.`;
        } else if (roll < 80) {
          const prize = Math.max(20, Math.floor(cost * 0.8));
          member.coins += prize;
          member.xp += 30;
          msg = `Cofre Común: @${member.username} recuperó ${prize} ${currency} y +30 XP.`;
        } else {
          if (!member.badges.includes('Explorador')) {
            member.badges.push('Explorador');
            msg = `¡Hallazgo raro! @${member.username} obtuvo la insignia [Explorador] y +25 XP.`;
          } else {
            member.coins += 30;
            msg = `Cofre vacío parcial: @${member.username} halló ${30} ${currency}.`;
          }
          member.xp += 25;
        }
        member.level = calculateLevel(member.xp);
        db.stats.totalGamesPlayed += 1;
        return { handled: true, playedGame: true, replyText: msg };
      }

      case '/trivia': {
        const blocked = this.checkGameAccess(member, isAdmin);
        if (blocked) return { handled: true, replyText: blocked };
        if (ent.triviaQuestions.length === 0) {
          return { handled: true, replyText: 'No hay preguntas de trivia configuradas aún.' };
        }
        const q = ent.triviaQuestions[crypto.randomInt(0, ent.triviaQuestions.length)];
        const sid = uid('trv');
        this.activeTrivias.set(sid, { id: sid, question: q, solved: false, createdAt: Date.now() });
        const buttons: SimulatorButton[] = q.options.map((opt, idx) => ({
          text: opt,
          callbackData: `trivia:${sid}:${idx}`,
        }));
        db.stats.totalGamesPlayed += 1;
        return {
          handled: true,
          playedGame: true,
          replyText: `Trivia (${q.rewardCoins} ${currency} · ${q.rewardXp} XP):\n${q.question}`,
          buttons,
        };
      }

      case '/ahorcado': {
        const blocked = this.checkGameAccess(member, isAdmin);
        if (blocked) return { handled: true, replyText: blocked };
        if (this.activeHangman) {
          return {
            handled: true,
            replyText: `Ya hay un ahorcado activo. Envía una letra o la palabra:\n${this.renderHangmanDisplay(this.activeHangman)}`,
          };
        }
        const words = ent.hangmanWords.length > 0 ? ent.hangmanWords : ['TELEGRAM', 'ALTARE', 'PRIVADO'];
        const rawWord = words[crypto.randomInt(0, words.length)]
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        this.activeHangman = {
          word: rawWord,
          guessed: new Set(),
          wrongGuesses: 0,
          maxWrong: 6,
          rewardCoins: 65,
          rewardXp: 45,
          startedAt: Date.now(),
        };
        db.stats.totalGamesPlayed += 1;
        return {
          handled: true,
          playedGame: true,
          replyText: `Ahorcado iniciado (premio: 65 ${currency} + 45 XP). Envía 1 letra o la palabra completa:\n${this.renderHangmanDisplay(this.activeHangman)}`,
        };
      }

      case '/calculo': {
        const blocked = this.checkGameAccess(member, isAdmin);
        if (blocked) return { handled: true, replyText: blocked };
        const a = crypto.randomInt(6, 25);
        const b = crypto.randomInt(3, 12);
        const c = crypto.randomInt(5, 40);
        const ans = a * b + c;
        this.activeMathBlitz = {
          prompt: `${a} × ${b} + ${c}`,
          answer: ans,
          rewardCoins: 50,
          rewardXp: 35,
          startedAt: Date.now(),
        };
        db.stats.totalGamesPlayed += 1;
        return {
          handled: true,
          playedGame: true,
          replyText: `Cálculo relámpago: el primero que responda ${a} × ${b} + ${c} gana 50 ${currency} y 35 XP.`,
        };
      }

      case '/dado': {
        const blocked = this.checkGameAccess(member, isAdmin);
        if (blocked) return { handled: true, replyText: blocked };
        const wager = Math.max(0, Number.parseInt(args[0] ?? '20', 10) || 20);
        if (wager > 0 && member.coins < wager) {
          return { handled: true, replyText: `No tienes ${wager} ${currency} para apostar.` };
        }
        const userRoll = crypto.randomInt(1, 7);
        const botRoll = crypto.randomInt(1, 7);
        db.stats.totalGamesPlayed += 1;
        if (userRoll > botRoll) {
          member.coins += wager;
          member.xp += 15;
          return {
            handled: true,
            playedGame: true,
            replyText: `@${member.username} sacó ${userRoll} vs Bot ${botRoll}. ¡Ganaste +${wager} ${currency}!`,
          };
        }
        if (userRoll < botRoll) {
          member.coins -= wager;
          return {
            handled: true,
            playedGame: true,
            replyText: `@${member.username} sacó ${userRoll} vs Bot ${botRoll}. Perdiste ${wager} ${currency}.`,
          };
        }
        return {
          handled: true,
          playedGame: true,
          replyText: `Empate en ${userRoll}. Tu saldo se mantiene en ${member.coins} ${currency}.`,
        };
      }

      case '/ruleta': {
        const blocked = this.checkGameAccess(member, isAdmin);
        if (blocked) return { handled: true, replyText: blocked };
        const wager = Math.max(10, Math.min(500, Number.parseInt(args[0] ?? '25', 10) || 25));
        if (member.coins < wager) {
          return { handled: true, replyText: `Necesitas al menos ${wager} ${currency}.` };
        }
        const spin = crypto.randomInt(0, 100);
        db.stats.totalGamesPlayed += 1;
        if (spin < 8) {
          const win = wager * 3;
          member.coins += win;
          return {
            handled: true,
            playedGame: true,
            replyText: `¡Ruleta x4! @${member.username} ganó +${win} ${currency}. Saldo: ${member.coins}.`,
          };
        }
        if (spin < 46) {
          member.coins += wager;
          return {
            handled: true,
            playedGame: true,
            replyText: `¡Ruleta ganadora! @${member.username} ganó +${wager} ${currency}. Saldo: ${member.coins}.`,
          };
        }
        member.coins -= wager;
        return {
          handled: true,
          playedGame: true,
          replyText: `La ruleta cayó en rojo oscuro. @${member.username} perdió ${wager} ${currency}. Saldo: ${member.coins}.`,
        };
      }

      case '/ppt': {
        const blocked = this.checkGameAccess(member, isAdmin);
        if (blocked) return { handled: true, replyText: blocked };
        const choice = (args[0] ?? '').toLowerCase();
        const opts = ['piedra', 'papel', 'tijera'] as const;
        if (!opts.includes(choice as (typeof opts)[number])) {
          return { handled: true, replyText: 'Uso: /ppt piedra | papel | tijera' };
        }
        const botChoice = opts[crypto.randomInt(0, 3)];
        db.stats.totalGamesPlayed += 1;
        if (choice === botChoice) {
          return { handled: true, playedGame: true, replyText: `Elegimos ${botChoice}. ¡Empate!` };
        }
        const win =
          (choice === 'piedra' && botChoice === 'tijera') ||
          (choice === 'papel' && botChoice === 'piedra') ||
          (choice === 'tijera' && botChoice === 'papel');
        if (win) {
          member.coins += 25;
          member.xp += 15;
          return {
            handled: true,
            playedGame: true,
            replyText: `Tú: ${choice} · Bot: ${botChoice}. ¡Ganaste +25 ${currency} y +15 XP!`,
          };
        }
        return {
          handled: true,
          playedGame: true,
          replyText: `Tú: ${choice} · Bot: ${botChoice}. Ganó el bot esta ronda.`,
        };
      }

      case '/duelo': {
        const blocked = this.checkGameAccess(member, isAdmin);
        if (blocked) return { handled: true, replyText: blocked };
        const opponent = explicitTarget ?? this.resolveTarget(args[0] ?? '');
        const rawWager = explicitTarget ? args[0] : args[1];
        const wager = Math.max(10, Math.min(500, Number.parseInt(rawWager ?? '30', 10) || 30));
        if (!opponent || opponent.id === member.id) {
          return { handled: true, replyText: 'Uso: /duelo @usuario [apuesta]' };
        }
        if (member.coins < wager || opponent.coins < wager) {
          return { handled: true, replyText: `Ambos jugadores deben tener al menos ${wager} ${currency}.` };
        }
        const did = uid('duel');
        this.activeDuels.set(did, {
          id: did,
          challengerId: member.id,
          opponentId: opponent.id,
          wager,
          createdAt: Date.now(),
        });
        return {
          handled: true,
          replyText: `@${member.username} reta a @${opponent.username} a un duelo por ${wager} ${currency}.`,
          buttons: [
            { text: `Aceptar duelo (${wager})`, callbackData: `duel_accept:${did}` },
            { text: 'Rechazar', callbackData: `duel_decline:${did}` },
          ],
        };
      }

      case '/lluvia': {
        const total = Math.max(20, Math.min(2000, Number.parseInt(args[0] ?? '100', 10) || 100));
        const maxClaims = Math.max(2, Math.min(15, Number.parseInt(args[1] ?? '5', 10) || 5));
        if (!isAdmin && member.coins < total) {
          return { handled: true, replyText: `Saldo insuficiente para lanzar ${total} ${currency}.` };
        }
        if (!isAdmin) member.coins -= total;
        const rainId = uid('rain');
        ent.activeCoinRains.push({
          id: rainId,
          totalCoins: total,
          remainingCoins: total,
          maxClaims,
          claimedBy: [],
          createdBy: `@${member.username}`,
        });
        return {
          handled: true,
          replyText: `¡Lluvia de ${total} ${currency} lanzada por @${member.username}! Cupos: ${maxClaims}.`,
          buttons: [{ text: `Reclamar parte (0/${maxClaims})`, callbackData: `rain:${rainId}` }],
        };
      }

      case '/sorteo': {
        if (!isAdmin) {
          return { handled: true, replyText: 'Solo los administradores pueden crear sorteos.' };
        }
        const mins = Math.max(1, Math.min(10080, Number.parseInt(args[0] ?? '10', 10) || 10));
        const winnersCount = Math.max(1, Math.min(10, Number.parseInt(args[1] ?? '1', 10) || 1));
        const prize = args.slice(2).join(' ').trim() || 'Premio VIP del Grupo';
        const gid = uid('giv');
        const endsAt = new Date(Date.now() + mins * 60_000).toISOString();
        ent.activeGiveaways.push({
          id: gid,
          prize,
          winnersCount,
          endsAt,
          participants: [],
          winnerIds: [],
          status: 'active',
          createdBy: `@${member.username}`,
        });
        return {
          handled: true,
          replyText: `SORTEO ACTIVO: "${prize}"\nGanadores: ${winnersCount} · Duración: ${mins} min.\nPulsa el botón para participar.`,
          buttons: [{ text: 'Participar en el sorteo (0)', callbackData: `giveaway:${gid}` }],
          auditAction: 'Sorteo creado',
          auditTarget: prize,
          auditDetail: `${winnersCount} ganador(es) · ${mins}m`,
        };
      }

      case '/fin_sorteo': {
        if (!isAdmin) {
          return { handled: true, replyText: 'Solo los administradores pueden cerrar sorteos.' };
        }
        const active = [...ent.activeGiveaways].reverse().find((g) => g.status === 'active');
        if (!active) {
          return { handled: true, replyText: 'No hay ningún sorteo activo.' };
        }
        const closedText = this.closeGiveaway(active.id);
        return {
          handled: true,
          replyText: closedText,
          auditAction: 'Sorteo finalizado',
          auditTarget: active.prize,
          auditDetail: `${active.winnerIds.length} ganador(es)`,
        };
      }

      case '/encuesta': {
        const raw = args.join(' ');
        const parts = raw.split('|').map((p) => p.trim()).filter(Boolean);
        if (parts.length < 3) {
          return { handled: true, replyText: 'Uso: /encuesta ¿Pregunta? | Opción A | Opción B' };
        }
        const [question, ...opts] = parts.slice(0, 5);
        const pid = uid('poll');
        const poll = {
          id: pid,
          question,
          options: opts.map((text) => ({ text, votes: [] as string[] })),
          createdBy: `@${member.username}`,
          createdAt: new Date().toISOString(),
        };
        ent.activePolls.push(poll);
        return {
          handled: true,
          replyText: `Encuesta de @${member.username}:\n${question}`,
          buttons: poll.options.map((o, idx) => ({
            text: `${o.text} (0)`,
            callbackData: `poll:${pid}:${idx}`,
          })),
        };
      }

      case '/8ball': {
        const q = args.join(' ').trim();
        if (!q) return { handled: true, replyText: 'Uso: /8ball <tu pregunta>' };
        const answers = [
          'Sí, totalmente seguro.',
          'Todo apunta a que sí.',
          'Pregunta de nuevo más tarde.',
          'Mejor no contar con ello.',
          'Mis fuentes dicen que no.',
          'Definitivamente sí.',
        ];
        return { handled: true, replyText: `🎱 "${q}" → ${answers[crypto.randomInt(0, answers.length)]}` };
      }

      case '/ship': {
        const a = args[0] || `@${member.username}`;
        const b = args[1] || db.settings.groupName;
        const score = crypto.randomInt(15, 101);
        return {
          handled: true,
          replyText: `Compatibilidad entre ${a} y ${b}: ${score}%`,
        };
      }

      default:
        return { handled: false };
    }
  }

  private giveReputation(
    member: MemberRecord,
    targetArg: string,
    explicitTarget?: MemberRecord | null
  ): EntertainmentResponse {
    const target = explicitTarget ?? this.resolveTarget(targetArg);
    if (!target || target.id === member.id) {
      return { handled: true, replyText: 'Uso: /gracias @usuario (o responde a su mensaje con +rep).' };
    }
    const now = Date.now();
    const last = this.repCooldown.get(member.id) ?? 0;
    if (now - last < 120_000) {
      const sec = Math.ceil((last + 120_000 - now) / 1000);
      return { handled: true, replyText: `Espera ${sec}s antes de otorgar otro punto de reputación.` };
    }
    this.repCooldown.set(member.id, now);
    target.reputation += 1;
    target.coins += 15;
    ensureTodayMissions(member);
    member.dailyMissions.repGiven += 1;
    return {
      handled: true,
      replyText: `@${member.username} dio +1 Reputación a @${target.username} (ahora +${target.reputation} rep y +15 ${store.get().entertainment.currencyName}).`,
    };
  }

  closeGiveaway(giveawayId: string): string {
    const db = store.get();
    const g = db.entertainment.activeGiveaways.find((item) => item.id === giveawayId);
    if (!g) return 'Sorteo no encontrado.';
    if (g.status === 'ended') return `El sorteo "${g.prize}" ya finalizó.`;

    g.status = 'ended';
    if (g.participants.length === 0) {
      return `Sorteo "${g.prize}" finalizado sin participantes.`;
    }

    const pool = [...g.participants];
    const winners: string[] = [];
    const targetCount = Math.min(g.winnersCount, pool.length);
    for (let i = 0; i < targetCount; i++) {
      const pickIdx = crypto.randomInt(0, pool.length);
      const [winnerId] = pool.splice(pickIdx, 1);
      winners.push(winnerId);
    }
    g.winnerIds = winners;

    const names = winners.map((id) => {
      const m = db.members.find((mem) => mem.id === id);
      if (m) m.coins += 50;
      return m ? `@${m.username}` : id;
    });
    return `¡Sorteo "${g.prize}" finalizado! Ganador(es): ${names.join(', ')}.`;
  }

  handleCallback(
    _source: AuditSource,
    actor: MemberRecord,
    callbackData: string
  ): { handled: boolean; toastText: string; announceText?: string; buttons?: SimulatorButton[] } {
    const db = store.get();
    const ent = db.entertainment;
    const currency = ent.currencyName;

    if (callbackData.startsWith('trivia:')) {
      const [, sid, rawIdx] = callbackData.split(':');
      const session = this.activeTrivias.get(sid);
      if (!session) {
        return { handled: true, toastText: 'Esta trivia ya expiró.' };
      }
      if (session.solved) {
        return { handled: true, toastText: 'Alguien ya respondió esta trivia.' };
      }
      const chosen = Number.parseInt(rawIdx ?? '-1', 10);
      if (chosen === session.question.correctIndex) {
        session.solved = true;
        actor.coins += session.question.rewardCoins;
        actor.xp += session.question.rewardXp;
        actor.level = calculateLevel(actor.xp);
        ensureTodayMissions(actor);
        actor.dailyMissions.triviaWon += 1;
        return {
          handled: true,
          toastText: '¡Respuesta correcta!',
          announceText: `¡@${actor.username} acertó la trivia! Ganó +${session.question.rewardCoins} ${currency} y +${session.question.rewardXp} XP.`,
        };
      }
      return { handled: true, toastText: 'Respuesta incorrecta.' };
    }

    if (callbackData.startsWith('duel_accept:') || callbackData.startsWith('duel_decline:')) {
      const [act, did] = callbackData.split(':');
      const duel = this.activeDuels.get(did);
      if (!duel) return { handled: true, toastText: 'Este duelo ya expiró.' };
      if (actor.id !== duel.opponentId && actor.role !== 'admin') {
        return { handled: true, toastText: 'Solo el jugador retado puede responder este duelo.' };
      }
      this.activeDuels.delete(did);
      if (act === 'duel_decline') {
        return {
          handled: true,
          toastText: 'Duelo rechazado.',
          announceText: `@${actor.username} rechazó el duelo.`,
        };
      }
      const challenger = db.members.find((m) => m.id === duel.challengerId);
      const opponent = db.members.find((m) => m.id === duel.opponentId);
      if (!challenger || !opponent || challenger.coins < duel.wager || opponent.coins < duel.wager) {
        return { handled: true, toastText: 'Saldo insuficiente para completar el duelo.' };
      }
      const winner = crypto.randomInt(0, 2) === 0 ? challenger : opponent;
      const loser = winner.id === challenger.id ? opponent : challenger;
      winner.coins += duel.wager;
      loser.coins -= duel.wager;
      winner.xp += 30;
      winner.level = calculateLevel(winner.xp);
      db.stats.totalGamesPlayed += 1;
      return {
        handled: true,
        toastText: `Ganó @${winner.username}`,
        announceText: `¡Duelo finalizado! @${winner.username} venció a @${loser.username} y ganó ${duel.wager} ${currency}.`,
      };
    }

    if (callbackData.startsWith('rain:')) {
      const [, rainId] = callbackData.split(':');
      const rain = ent.activeCoinRains.find((r) => r.id === rainId);
      if (!rain) return { handled: true, toastText: 'Lluvia no disponible.' };
      if (rain.claimedBy.includes(actor.id)) {
        return { handled: true, toastText: 'Ya reclamaste tu parte de esta lluvia.' };
      }
      if (rain.claimedBy.length >= rain.maxClaims || rain.remainingCoins <= 0) {
        return { handled: true, toastText: 'Esta lluvia ya repartió todos sus cupos.' };
      }
      const slotsLeft = rain.maxClaims - rain.claimedBy.length;
      const share = slotsLeft === 1 ? rain.remainingCoins : Math.floor(rain.totalCoins / rain.maxClaims);
      rain.remainingCoins = Math.max(0, rain.remainingCoins - share);
      rain.claimedBy.push(actor.id);
      actor.coins += share;
      return {
        handled: true,
        toastText: `¡Reclamaste +${share} ${currency}!`,
        announceText: `@${actor.username} reclamó +${share} ${currency} de la lluvia (${rain.claimedBy.length}/${rain.maxClaims}).`,
      };
    }

    if (callbackData.startsWith('giveaway:')) {
      const [, gid] = callbackData.split(':');
      const giveaway = ent.activeGiveaways.find((g) => g.id === gid);
      if (!giveaway || giveaway.status !== 'active') {
        return { handled: true, toastText: 'Este sorteo ya finalizó.' };
      }
      if (giveaway.participants.includes(actor.id)) {
        return { handled: true, toastText: 'Ya estás participando en este sorteo.' };
      }
      giveaway.participants.push(actor.id);
      return {
        handled: true,
        toastText: '¡Participación registrada!',
        announceText: `@${actor.username} se inscribió al sorteo "${giveaway.prize}" (${giveaway.participants.length} participantes).`,
      };
    }

    if (callbackData.startsWith('poll:')) {
      const [, pid, rawOpt] = callbackData.split(':');
      const poll = ent.activePolls.find((p) => p.id === pid);
      const optIdx = Number.parseInt(rawOpt ?? '-1', 10);
      if (!poll || !poll.options[optIdx]) {
        return { handled: true, toastText: 'Encuesta no encontrada.' };
      }
      poll.options.forEach((o) => {
        o.votes = o.votes.filter((id) => id !== actor.id);
      });
      poll.options[optIdx].votes.push(actor.id);
      const summary = poll.options.map((o) => `• ${o.text}: ${o.votes.length}`).join('\n');
      return {
        handled: true,
        toastText: `Voto registrado: ${poll.options[optIdx].text}`,
        announceText: `Resultados parciales "${poll.question}":\n${summary}`,
      };
    }

    return { handled: false, toastText: '' };
  }
}

export const entertainmentEngine = new EntertainmentEngine();
