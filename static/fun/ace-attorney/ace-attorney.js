/**
 * @file 本文件是《逆转裁判》彩蛋的总入口，负责同步准备静态资料、本地化并注册法庭改名事件。
 */

/** 《逆转裁判》静态资料与本地化的公共访问根路径。 */
const aceAttorneyDataRoot = "/static/fun/ace-attorney";

/**
 * 在脚本初始化阶段同步读取小型 JSON，保证 matches() 与首次用户手势触发前资料已就绪。
 *
 * @param {string} path JSON 公共路径。
 * @return {unknown} 已解析的 JSON 值。
 */
function loadAceAttorneyJson(path) {
  const request = new XMLHttpRequest();
  request.open("GET", path, false);
  request.send();
  if (request.status !== 200) {
    throw new Error(`无法读取《逆转裁判》彩蛋资料：${path}`);
  }
  return JSON.parse(request.responseText);
}

/**
 * 将当前网页 locale 解析为彩蛋已维护的交互文本语言。
 *
 * @return {"en"|"ja"|"zh"} 彩蛋交互文本语言。
 */
function aceAttorneyMessageLocale() {
  const locale = globalThis.document?.documentElement?.lang
    ?.toLocaleLowerCase("en-US") ?? "en-us";
  if (locale.startsWith("zh")) return "zh";
  return locale.startsWith("ja") ? "ja" : "en";
}

/**
 * 初始化数据、本地化与法院改名事件，并公开稳定的彩蛋 API。
 */
function initializeAceAttorneyEasterEgg() {
  const courtroomNameChange = globalThis.aceAttorneyCourtroomNameChange;
  if (!courtroomNameChange) {
    throw new Error("《逆转裁判》法庭改名事件尚未加载。");
  }
  const characters = loadAceAttorneyJson(
    `${aceAttorneyDataRoot}/Data/Characters.json`,
  );
  const messages = {
    en: loadAceAttorneyJson(`${aceAttorneyDataRoot}/Locales/en-US.json`),
    ja: loadAceAttorneyJson(`${aceAttorneyDataRoot}/Locales/ja-JP.json`),
    zh: loadAceAttorneyJson(`${aceAttorneyDataRoot}/Locales/zh-CN.json`),
  };
  globalThis.usernameEasterEgg = courtroomNameChange.create({
    characters,
    messages,
    resolveMessageLocale: aceAttorneyMessageLocale,
  });
}

initializeAceAttorneyEasterEgg();
