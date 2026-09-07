/**
 * @file 本文件是《逆转裁判》彩蛋的总入口，负责同步准备静态资料、本地化并注册法庭改名事件。
 */

/** 当前设置页以内联 JSON 提供的角色资料与交互文本。 */
const aceAttorneyDataElementId = "ace-attorney-easter-egg-data";

/**
 * 读取服务端渲染的《逆转裁判》资料，保持 JSON 文件作为唯一数据来源。
 *
 * @return {{characters: object[], messages: object}} 已准备的角色资料与当前语言文本。
 */
function embeddedAceAttorneyData() {
  const serialized = globalThis.document?.getElementById?.(
    aceAttorneyDataElementId,
  )?.textContent;
  if (!serialized) {
    throw new Error("《逆转裁判》彩蛋资料尚未注入页面。");
  }
  return JSON.parse(serialized);
}

/**
 * 初始化数据、本地化与法院改名事件，并公开稳定的彩蛋 API。
 */
function initializeAceAttorneyEasterEgg() {
  const courtroomNameChange = globalThis.aceAttorneyCourtroomNameChange;
  if (!courtroomNameChange) {
    throw new Error("《逆转裁判》法庭改名事件尚未加载。");
  }
  const { characters, messages } = embeddedAceAttorneyData();
  globalThis.usernameEasterEgg = courtroomNameChange.create({
    characters,
    messages,
  });
}

initializeAceAttorneyEasterEgg();
