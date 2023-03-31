/*
  Description: Writes the current config to disk
*/

import * as UAC from '../utility/UAC/_info';

// module main
export async function run(core, server, socket, data) {
  // attempt save, notify of failure
  if (!core.configManager.save()) {
    core.logger.logAction(socket,[],'saveconfig',data,'保存失败')
    return server.reply({
      cmd: 'warn',
      text: '保存文件失败，请检查日志。',
    }, socket);
  }

  // return success message to moderators and admins
  server.broadcast({
    cmd: 'info',
    text: '配置已保存！',
  }, { level: UAC.isModerator });

  core.logger.logAction(socket,[],'saveconfig',data,'保存成功')

  return true;
}

export const info = {
  name: 'saveconfig',
  description: '把配置写入服务器本地文件，长久保存',
  usage: `
    API: { cmd: 'saveconfig' }
    文本：以聊天形式发送 /saveconfig`,
  fastcmd:[],
  level: UAC.levels.admin,
};
