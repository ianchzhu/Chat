import {
  basename,
  join,
  sep,
  dirname,
  relative,
} from 'path';
import didYouMean from 'didyoumean2';
import {
  isRegExp,
} from 'util';

// default command modules path
const CmdDir = 'src/commands';

/**
  * Commands / protocol manager- loads, validates and handles command execution
  * @property {Array} commands - Array of currently loaded command modules
  * @property {Array} categories - Array of command modules categories
  * @author Marzavec ( https://github.com/marzavec )
  * @version v2.0.0
  * @license WTFPL ( http://www.wtfpl.net/txt/copying/ )
  */
class CommandManager {
  /**
    * Create a `CommandManager` instance for handling commands/protocol
    *
    * @param {Object} core Reference to the global core object
    */
  constructor(core) {
    /**
      * Stored reference to the core
      * @type {CoreApp}
      */
    this.core = core;

    /**
      * Command module storage
      * @type {Array}
      */
    this.commands = [];

    /**
      * Command module category names (based off directory or module meta)
      * @type {Array}
      */
    this.categories = [];
  }

  /**
    * (Re)initializes name spaces for commands and starts load routine
    * @public
    * @return {String} Module errors or empty if none
    */
  loadCommands() {
    this.commands = [];
    this.categories = [];

    const commandImports = this.core.dynamicImports.getImport(CmdDir);
    let cmdErrors = '';
    Object.keys(commandImports).forEach((file) => {
      const command = commandImports[file];
      const name = basename(file);
      cmdErrors += this.validateAndLoad(command, file, name);
    });

    if (cmdErrors){
      const errID = this.core.logger.logError(cmdErrors,'初始化模块',undefined,[])
      return cmdErrors + `\n错误ID：\`${errID}\``;
    }

    return cmdErrors;
  }

  /**
    * Checks the module after having been `require()`ed in and reports errors
    * @param {Object} command reference to the newly loaded object
    * @param {String} file file path to the module
    * @param {String} name command (`cmd`) name
    * @private
    * @return {String} Module errors or empty if none
    */
  validateAndLoad(command, file, name) {
    const error = this.validateCommand(command);

    if (error) {
      const errText = `无法加载命令模块 ${name}，错误信息：${error}`;
      return errText;
    }

    if (!command.category) {
      const base = join(this.core.dynamicImports.base, 'commands');

      let category = '未分类';
      if (file.indexOf(sep) > -1) {
        category = dirname(relative(base, file))
          .replace(new RegExp(sep.replace('\\', '\\\\'), 'g'), '/');
      }

      command.info.category = category;

      if (this.categories.indexOf(category) === -1) {
        this.categories.push(category);
      }
    }

    if (typeof command.init === 'function') {
      try {
        command.init(this.core);
      } catch (err) {
        const errText = `无法初始化命令 ${name}：${err}`;
        return errText;
      }
    }

    this.commands.push(command);

    return '';
  }

  /**
    * Checks the module after having been `require()`ed in and reports errors
    * @param {Object} object reference to the newly loaded object
    * @private
    * @return {String} Module errors or null if none
    */
  validateCommand(object) {
    if (typeof object !== 'object') { return '模块无效'; }
    if (typeof object.run !== 'function') { return '丢失run函数'; }
    if (typeof object.info !== 'object') { return '丢失info对象'; }
    if (typeof object.info.name !== 'string') { return 'info对象的name属性有误'; }

    return null;
  }

  /**
    * Pulls all command names from a passed `category`
    * @param {String} category [Optional] filter return results by this category
    * @public
    * @return {Array} Array of command modules matching the category
    */
  all(category) {
    return !category ? this.commands : this.commands.filter(
      (c) => c.info.category.toLowerCase() === category.toLowerCase(),
    );
  }

  /**
    * All category names
    * @public
    * @readonly
    * @return {Array} Array of command category names
    */
  get categoriesList() {
    return this.categories;
  }

  /**
    * Pulls command by name or alias
    * @param {String} name name or alias of command
    * @public
    * @return {Object} Target command module object
    */
  get(name) {
    return this.findBy('name', name)
      || this.commands.find(
        (command) => command.info.aliases instanceof Array
        && command.info.aliases.indexOf(name) > -1,
      );
  }

  /**
    * Pulls command by arbitrary search of the `module.info` attribute
    * @param {String} key name or alias of command
    * @param {String} value name or alias of command
    * @public
    * @return {Object} Target command module object
    */
  findBy(key, value) {
    return this.commands.find((c) => c.info[key] === value);
  }

  /**
    * Runs `initHooks` function on any modules that utilize the event
    * @private
    * @param {Object} server main server object
    */
  initCommandHooks(server) {
    this.commands.filter((c) => typeof c.initHooks === 'function').forEach(
      (c) => { c.initHooks(server) },
    );
  }

  /**
   * 通过命令模块info对象的dataRules属性验证用户输入值是否正确
   * @param {Array} rules 命令模块info对象的dataRules属性
   * @param {Object} data 数据
   * @returns {String|true} 如果是字符串，则代表报错；如果是true，则代表验证成功
   */

  verifyData(rules, data) {
    const missing = []
    let i = 0

    if (typeof data.nick === 'string') {
      var nickArr = data.nick.split('#')
      nickArr[0] = nickArr[0].replace(/@/g, '')
      data.nick = nickArr.join('#')
    }

    for (i in rules) {
      if (typeof data[rules[i].name] === 'undefined' && !rules[i].required) continue
      if (typeof data[rules[i].name] === 'undefined') {
        // 丢了个参数
        missing.push(rules[i].name)
        continue    // 继续执行下一次循环
      }

      if (typeof rules[i].verify === 'function') {
        // 参数验证模式：自定义函数
        // 返回值类型为string则报错，为false返回errorMessage的内容（没有则返回默认报错内容），为true则说明验证通过
        let result = rules[i].verify(data[rules[i].name])

        if (result === true) continue

        return result || rules[i].errorMessage || `错误：参数 ${rules[i].name} 的值有误，请查证后再试`    // 报错

      }else if (isRegExp(rules[i].verify)) {
        // 参数验证模式：正则表达式
        if (!rules[i].verify.test(data[rules[i].name])) {
          // 验证失败
          return rules[i].errorMessage || `错误：参数 ${rules[i].name} 的值有误，请查证后再试`    // 报错
        }
      }
    }

    if (missing.length !== 0) {
      // 如果真的丢失参数，则返回错误信息
      return `错误：您没有提供参数 ${missing.join('、')}`
    }
    return true
  }

  parseText(rules, text) {
    // 实例：/color 44FF00

    var data = {}
    var textArray = text.split(' ')

    data.cmd = textArray[0].slice(1)

    for (let i = 0; i < rules.length; i++) {    // Do you know the rules? You know the rules and so do I~
      if (!textArray[i + 1]) {
        return data
      }

      if (rules[i].all) {
        data[rules[i].name] = textArray.slice(i + 1).join(' ')
        return data
      }
      
      data[rules[i].name] = textArray[i + 1]
    }

    return data
  }

  /**
    * Finds and executes the requested command, or fails with semi-intelligent error
    * @param {Object} server main server reference
    * @param {Object} socket calling socket reference
    * @param {Object} data command structure passed by socket (client)
    * @public
    * @return {*} Arbitrary module return data
    */
  handleCommand(server, socket, data) {
    // Try to find command first
    const command = this.get(data.cmd);

    if (command) {
      return this.execute(command, server, socket, data);
    }

    // Then fail with helpful (sorta) message
    return this.handleFail(server, socket, data);
  }

  /**
    * Requested command failure handler, attempts to find command and reports back
    * @param {Object} server main server reference
    * @param {Object} socket calling socket reference
    * @param {Object} data command structure passed by socket (client)
    * @private
    * @return {*} Arbitrary module return data
    */
  handleFail(server, socket, data) {
    const maybe = didYouMean(data.cmd, this.all().map((c) => c.info.name), {
      threshold: 5,
      thresholdType: 'edit-distance',
    });

    if (maybe) {
      // Found a suggestion, pass it on to their dyslexic self
      return this.handleCommand(server, socket, {
        cmd: 'socketreply',
        cmdKey: server.cmdKey,
        text: `没有这个命令，你是不是想输入：\`${maybe}\`？`,
      });
    }

    // Request so mangled that I don't even. . .
    return this.handleCommand(server, socket, {
      cmd: 'socketreply',
      cmdKey: server.cmdKey,
      text: `找不到 \`${data.cmd}\` 命令，请执行 \`help\` 命令来查看所有的命令`,
    });
  }

  /**
    * Attempt to execute the requested command, fail if err or bad params
    * @param {Object} command target command module
    * @param {Object} server main server reference
    * @param {Object} socket calling socket reference
    * @param {Object} data command structure passed by socket (client)
    * @private
    * @return {*} Arbitrary module return data
    */
  async execute(command, server, socket, data) {
    if (Array.isArray(command.info.dataRules)) {
      // 命令模块要求检查用户输入值是否合法
      const msg = this.verifyData(command.info.dataRules, data)
      if (typeof msg === 'string') {
        this.handleCommand(server, socket, {
          cmd: 'socketreply',
          cmdKey: server.cmdKey,
          text: msg,
        });

        return null;
      }
    }

    if (typeof command.info.level === 'number') {    // 如果命令模块限制了最低权限
      if (typeof socket.level !== 'number' || socket.level < command.info.level) {    // 如果用户没有等级（未加入频道）或等级不够
        this.handleCommand(server, socket, {
          cmd: 'socketreply',
          cmdKey: server.cmdKey,
          text: `抱歉，您的权限不足，无法执行 \`${command.info.name}\` 命令，请检查权限后再试`,
        });

        return null;
      }
    }

    try {
      return await command.run(this.core, server, socket, data);
    } catch (err) {
      const errID = this.core.logger.logError(err.stack, '执行命令', socket, [])    //生成错误日志，获取事件ID
      //const errText = `无法执行 ${command.info.name} 命令：`;
      const errText = `# :(\n# 非常无语，服务器在执行 ${command.info.name} 命令时出现了未知错误，无法为您提供相应的服务。\n### 小张聊天室的部分技术暂不成熟，出错是在所难免的，敬请谅解。\n您可以将错误ID \`${errID}\` 报告给开发者以帮助我们改进服务器。\n电子邮箱: ${this.core.config.email}`;

      // 此段代码已被弃用，因为 EventsLogger.js 可以更好地实现错误处理功能

      /*
      // If we have more detail enabled, then we get the trace
      // if it isn't, or the property doesn't exist, then we'll get only the message
      if (this.core.config.logErrDetailed === true) {
        console.log(errText + err.stack);
      } else {
        console.log(errText + err.toString());
      }
      */

      this.handleCommand(server, socket, {
        cmd: 'socketreply',
        cmdKey: server.cmdKey,
        text: errText,
      });

      return null;
    }
  }
}

export default CommandManager;
