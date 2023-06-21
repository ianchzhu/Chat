import * as UAC from '../utility/UAC/_info';

// module main
export async function run(core, server, socket, data) {
  // verify user data is string
  if (typeof data.nick !== 'string') {
    return true;
  }
  const user_socket = server.findSockets({ nick: data.nick, channel:socket.channel })[0];
  if (!user_socket){
    return server.reply({
      cmd:'warn',
      text:'找不到这名用户'
    },socket)
  }

  if (user_socket.level >= socket.level) return server.replyWarn('越权操作不被允许', socket)
  const leaveNotice = {
    cmd: 'onlineRemove',
    nick: data.nick,
  };

  const joinNotice = {
    cmd: 'onlineAdd',
    nick: data.new_nick,
    trip: user_socket.trip || '',
    hash: user_socket.hash,
  };
  /*

  // broadcast remove event and join event with new name, this is to support legacy clients and bots
  server.broadcast(leaveNotice, { channel: user_socket.channel });
  server.broadcast(joinNotice, { channel: user_socket.channel });
  */

  server.broadcast({
    cmd: 'changeNick',
    nick: user_socket.nick,
    text: data.new_nick,
    force: true,
  }, { channel: socket.channel })
  // notify channel that the user has changed their name
  server.broadcast({
    cmd: 'info',
    text: `${user_socket.nick} 被==强制更换昵称==为 ${data.new_nick}`,
  }, { channel: user_socket.channel });

  // commit change to nickname
  user_socket.nick = data.new_nick;

  core.logger.logAction(socket,[],'forcenick',data)

  return true;
}

export const info = {
  name: 'forcenick',
  description: '==强制==修改某人的昵称',
  usage: `
    API: { cmd: 'changenick', nick: '<原昵称>', new_nick:'<新昵称>' }
    文本：以聊天形式发送 /forcenick 原昵称 新昵称`,
  runByChat: true,
  dataRules: [
    {
      name: 'nick',
      verify: UAC.verifyNickname,
      required: true,
      errorMessage: UAC.nameLimit.nick,
    },
    {
      name: 'new_nick',
      verify: UAC.verifyNickname,
      errorMessage: UAC.nameLimit.nick,
      required: true
    },
  ],
  level: UAC.levels.moderator,
};
