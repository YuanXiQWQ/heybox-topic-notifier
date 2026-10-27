/** @file 使用 PKCE 将系统浏览器中的完整账号认证交接到当前应用会话。 */
const { randomBytes, createHash } = require("node:crypto");
/**
 * 创建同一设备至多一个待完成的登录流程。
 * @param {object} options 原生网络、浏览器与窗口依赖。
 * @return {Function} 登录发起器。
 */
function browserLogin({ origin, session, openExternal, complete }) {
  let active;
  /**
   * 发起本机保留 verifier 的登录，并在授权后接收 HttpOnly Cookie。
   * @return {Promise<{code: string}>} 浏览器确认页对应的识别码。
   */
  return async function start() {
    if (active) return { code: active.id.slice(0, 8).toUpperCase() };
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const response = await session.fetch(origin + "/auth/native/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challenge }),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Login unavailable");
    const result = await response.json();
    if (
      !/^[a-f0-9-]{36}$/.test(result.id) ||
      result.path !== "/auth/native/approve?id=" + result.id
    ) throw new Error("Invalid login handoff");
    active = { id: result.id, verifier, expiresAt: Date.now() + 5 * 60000 };
    try {
      await openExternal(origin + result.path);
    } catch (error) {
      active = undefined;
      throw error;
    }
    void poll(active);
    return { code: result.id.slice(0, 8).toUpperCase() };
  };
  /**
   * 补取浏览器授权结果；网络错误可在交接有效期内重试。
   * @param {object} flow 当前登录流程。
   * @return {Promise<void>} 授权或超时结束。
   */
  async function poll(flow) {
    while (active === flow && Date.now() < flow.expiresAt) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const response = await session.fetch(origin + "/auth/native/exchange", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: flow.id, verifier: flow.verifier }),
          redirect: "error",
          signal: AbortSignal.timeout(12000),
        });
        if (response.status === 202) continue;
        if (!response.ok) break;
        const result = await response.json();
        if (result.ok) {
          complete();
          break;
        }
      } catch { /* 断网期间保留原始 PKCE verifier。 */ }
    }
    if (active === flow) active = undefined;
  }
}
module.exports = { browserLogin };
