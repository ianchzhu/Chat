import * as UAC from '../utility/UAC/_info';

// module main
export async function run(core, server, socket, data) {
  // find target user
  const targetNick = data.nick;
  let badClient = server.findSockets({ channel: socket.channel, nick: targetNick });

  if (badClient.length === 0) {
    return server.reply({
      cmd: 'warn',
      text: '找不到目标用户',
    }, socket);
  }

  [badClient] = badClient;

  // i guess banning mods or admins isn't the best idea?
  if (badClient.level >= socket.level) {
    return server.reply({
      cmd: 'warn',
      text: '不能封禁你的同事，这是很粗鲁的',
    }, socket);
  }

  server.reply({
    cmd: 'banclient',
  }, badClient)    // 给目标用户发送banclient

  server.broadcast({
    cmd:'info',
    text: '已封杀 ' + badClient.nick
  }, { channel: socket.channel, level: (level) => level < UAC.levels.moderator })

  // notify mods
  server.broadcast({
    cmd: 'info',
    text: `[${socket.trip}] ${socket.nick} 封杀（封禁客户端）了 ?${socket.channel} 的 ${targetNick}。\n注意：管理员无法撤销此操作，除非目标用户删除localStorage`,
  }, { level: UAC.isModerator });

  core.logger.logAction(socket,[],'banclient',data,`[${socket.trip}] ${socket.nick} 封杀（封禁客户端）了 ?${socket.channel} 的 ${targetNick}。\n${targetNick} IP地址为：${badClient.address}`)
  return true;
}

export const info = {
  name: 'banclient',
  description: '封杀一位用户，即封禁客户端',
  usage: `
    API: { cmd: 'banclient', nick: '<target nickname>' }
    文本：以聊天形式发送 /banclient 目标昵称`,
  runByChat: true,
  dataRules: [
    {
      name: 'nick',
      required: true,
      verify: UAC.verifyNickname,
      errorMessage: UAC.nameLimit.nick,
    }
  ],
  level: UAC.levels.moderator,    // 指定权限
};
