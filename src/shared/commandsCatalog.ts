import type { CustomCommand } from './types.ts';

export type CommandCategory = 'grupo' | 'entretenimiento' | 'admin';

export interface BuiltinCommandSpec {
  command: string;
  usage: string;
  description: string;
  category: CommandCategory;
  adminOnly: boolean;
}

export const BUILTIN_COMMANDS: BuiltinCommandSpec[] = [
  // Grupo
  { command: 'help', usage: '/help', description: 'Ver lista de comandos disponibles', category: 'grupo', adminOnly: false },
  { command: 'rules', usage: '/rules', description: 'Mostrar las normas del grupo privado', category: 'grupo', adminOnly: false },
  { command: 'info', usage: '/info [@usuario]', description: 'Ver ficha, nivel, saldo y warns de un miembro', category: 'grupo', adminOnly: false },
  { command: 'staff', usage: '/staff', description: 'Listar administradores y miembros VIP', category: 'grupo', adminOnly: false },
  { command: 'warns', usage: '/warns [@usuario]', description: 'Consultar historial de advertencias', category: 'grupo', adminOnly: false },
  { command: 'report', usage: '/report <motivo>', description: 'Enviar alerta al equipo de administración', category: 'grupo', adminOnly: false },

  // Entretenimiento & Economía
  { command: 'rank', usage: '/rank', description: 'Ver tu nivel XP, monedas, racha e insignias', category: 'entretenimiento', adminOnly: false },
  { command: 'top', usage: '/top [xp|coins|rep]', description: 'Ranking de miembros más activos del grupo', category: 'entretenimiento', adminOnly: false },
  { command: 'daily', usage: '/daily', description: 'Reclamar recompensa diaria y sumar racha', category: 'entretenimiento', adminOnly: false },
  { command: 'misiones', usage: '/misiones', description: 'Ver y reclamar tus misiones diarias', category: 'entretenimiento', adminOnly: false },
  { command: 'gracias', usage: '/gracias @usuario', description: 'Dar +1 reputación y monedas por ayudar', category: 'entretenimiento', adminOnly: false },
  { command: 'pay', usage: '/pay @usuario <cantidad>', description: 'Transferir monedas a otro miembro', category: 'entretenimiento', adminOnly: false },
  { command: 'shop', usage: '/shop', description: 'Ver artículos, VIP e indultos de la tienda', category: 'entretenimiento', adminOnly: false },
  { command: 'buy', usage: '/buy <número>', description: 'Comprar un artículo de la tienda', category: 'entretenimiento', adminOnly: false },
  { command: 'cofre', usage: '/cofre', description: 'Abrir un cofre misterioso con premios', category: 'entretenimiento', adminOnly: false },
  { command: 'trivia', usage: '/trivia', description: 'Lanzar pregunta de trivia con botones', category: 'entretenimiento', adminOnly: false },
  { command: 'ahorcado', usage: '/ahorcado', description: 'Iniciar juego cooperativo de ahorcado', category: 'entretenimiento', adminOnly: false },
  { command: 'calculo', usage: '/calculo', description: 'Reto matemático relámpago al primer acierto', category: 'entretenimiento', adminOnly: false },
  { command: 'dado', usage: '/dado [apuesta]', description: 'Apostar monedas lanzando un dado', category: 'entretenimiento', adminOnly: false },
  { command: 'ruleta', usage: '/ruleta [apuesta]', description: 'Girar la ruleta virtual con multiplicador', category: 'entretenimiento', adminOnly: false },
  { command: 'ppt', usage: '/ppt <piedra|papel|tijera>', description: 'Jugar piedra, papel o tijera', category: 'entretenimiento', adminOnly: false },
  { command: 'duelo', usage: '/duelo @usuario [apuesta]', description: 'Retar a otro miembro a un duelo', category: 'entretenimiento', adminOnly: false },
  { command: 'lluvia', usage: '/lluvia <total> [cupos]', description: 'Repartir monedas con botón en el chat', category: 'entretenimiento', adminOnly: false },
  { command: 'encuesta', usage: '/encuesta Pregunta | Op1 | Op2', description: 'Crear encuesta interactiva con votos', category: 'entretenimiento', adminOnly: false },
  { command: 'bola8', usage: '/bola8 <pregunta>', description: 'Preguntar a la bola mágica', category: 'entretenimiento', adminOnly: false },
  { command: 'ship', usage: '/ship @a @b', description: 'Medidor divertido de compatibilidad', category: 'entretenimiento', adminOnly: false },

  // Admin
  { command: 'warn', usage: '/warn @usuario [motivo]', description: 'Emitir una advertencia a un miembro', category: 'admin', adminOnly: true },
  { command: 'unwarn', usage: '/unwarn @usuario', description: 'Retirar 1 advertencia a un miembro', category: 'admin', adminOnly: true },
  { command: 'mute', usage: '/mute @usuario [min]', description: 'Silenciar temporalmente a un usuario', category: 'admin', adminOnly: true },
  { command: 'unmute', usage: '/unmute @usuario', description: 'Devolver permiso de escritura a un miembro', category: 'admin', adminOnly: true },
  { command: 'kick', usage: '/kick @usuario', description: 'Expulsar miembro permitiendo reingreso futuro', category: 'admin', adminOnly: true },
  { command: 'ban', usage: '/ban @usuario [motivo]', description: 'Banear permanentemente del grupo privado', category: 'admin', adminOnly: true },
  { command: 'unban', usage: '/unban @usuario', description: 'Quitar baneo a un miembro', category: 'admin', adminOnly: true },
  { command: 'vip', usage: '/vip @usuario', description: 'Otorgar rol VIP exento de bloqueos', category: 'admin', adminOnly: true },
  { command: 'unvip', usage: '/unvip @usuario', description: 'Retirar rol VIP a un miembro', category: 'admin', adminOnly: true },
  { command: 'lock', usage: '/lock <stickers|gifs|media|documents|voice|links|all>', description: 'Bloquear un tipo de contenido en el chat', category: 'admin', adminOnly: true },
  { command: 'unlock', usage: '/unlock <tipo>', description: 'Desbloquear un tipo de contenido', category: 'admin', adminOnly: true },
  { command: 'purge', usage: '/purge [cantidad]', description: 'Limpiar los últimos mensajes del chat', category: 'admin', adminOnly: true },
  { command: 'pin', usage: '/pin <anuncio>', description: 'Publicar y fijar un mensaje importante', category: 'admin', adminOnly: true },
  { command: 'unpin', usage: '/unpin', description: 'Desfijar el mensaje actual', category: 'admin', adminOnly: true },
  { command: 'setrules', usage: '/setrules <texto>', description: 'Actualizar las normas del grupo en vivo', category: 'admin', adminOnly: true },
  { command: 'setwelcome', usage: '/setwelcome <texto>', description: 'Actualizar el mensaje de bienvenida', category: 'admin', adminOnly: true },
  { command: 'raid', usage: '/raid <on|off>', description: 'Activar o desactivar modo emergencia Anti-Raid', category: 'admin', adminOnly: true },
  { command: 'slowmode', usage: '/slowmode <segundos>', description: 'Fijar intervalo mínimo entre mensajes', category: 'admin', adminOnly: true },
  { command: 'games', usage: '/games <on|off>', description: 'Pausar o activar todos los juegos del grupo', category: 'admin', adminOnly: true },
  { command: 'sorteo', usage: '/sorteo <min> <ganadores> <premio>', description: 'Lanzar un sorteo automático con botón', category: 'admin', adminOnly: true },
  { command: 'fin_sorteo', usage: '/fin_sorteo', description: 'Cerrar el sorteo activo y elegir ganadores', category: 'admin', adminOnly: true },
];

const VALID_TG_CMD_REGEX = /^[a-z][a-z0-9_]{0,31}$/;

export function buildTelegramCommandScopes(customCommands: CustomCommand[]) {
  const seenMember = new Set<string>();
  const seenAdmin = new Set<string>();
  const memberCommands: { command: string; description: string }[] = [];
  const adminCommands: { command: string; description: string }[] = [];

  for (const spec of BUILTIN_COMMANDS) {
    if (!VALID_TG_CMD_REGEX.test(spec.command)) continue;
    if (!spec.adminOnly && !seenMember.has(spec.command)) {
      seenMember.add(spec.command);
      memberCommands.push({ command: spec.command, description: spec.description.slice(0, 250) });
    }
    if (!seenAdmin.has(spec.command)) {
      seenAdmin.add(spec.command);
      adminCommands.push({ command: spec.command, description: spec.description.slice(0, 250) });
    }
  }

  for (const custom of customCommands) {
    if (!custom.enabled || !custom.trigger.startsWith('/')) continue;
    const clean = custom.trigger.slice(1).toLowerCase();
    if (!VALID_TG_CMD_REGEX.test(clean)) continue;
    const desc = `Comando personalizado: ${custom.response.replace(/\s+/g, ' ').slice(0, 80)}`;
    if (!custom.adminOnly && !seenMember.has(clean)) {
      seenMember.add(clean);
      memberCommands.push({ command: clean, description: desc });
    }
    if (!seenAdmin.has(clean)) {
      seenAdmin.add(clean);
      adminCommands.push({ command: clean, description: desc });
    }
  }

  return {
    memberCommands: memberCommands.slice(0, 100),
    adminCommands: adminCommands.slice(0, 100),
  };
}
