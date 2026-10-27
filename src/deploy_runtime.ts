/**
 * @file 本文件隔离部署定时检查与 HTTP 应用的加载，并在同一实例内共享调度状态。
 */
import {
  createPollingContext,
  type PollingContext,
} from "./services/polling_context.ts";
import type { createApplication } from "./app.ts";

/** 部署运行时可注入的依赖，用于隔离模块加载与网络请求测试。 */
type RuntimeOptions = {
  createContext?: () => PollingContext;
  loadApplication?: () => Promise<
    { createApplication: typeof createApplication }
  >;
};

/**
 * 创建共享轻量上下文、首次网页请求才加载 HTTP 模块的部署处理器。
 *
 * @param {RuntimeOptions} options 上下文和应用模块加载依赖。
 * @return {object} 定时检查与 HTTP 请求处理器。
 */
export function createDeployRuntime(options: RuntimeOptions = {}) {
  let context: PollingContext | undefined;
  let application: Promise<ReturnType<typeof createApplication>> | undefined;

  /**
   * 获取当前实例共享的轮询上下文。
   *
   * @return {PollingContext} 轮询上下文。
   */
  function getContext(): PollingContext {
    return context ??= (options.createContext ?? createPollingContext)();
  }

  return {
    /**
     * 执行一次到期检查，不加载网页模块。
     *
     * @return {Promise<boolean>} 是否执行过轮询。
     */
    tick(): Promise<boolean> {
      return getContext().scheduler.tick();
    },
    /**
     * 加载并复用完整 HTTP 应用，加载失败时允许后续请求重试。
     *
     * @param {Request} request HTTP 请求。
     * @return {Promise<Response>} HTTP 响应。
     */
    async fetch(request: Request): Promise<Response> {
      application ??= (options.loadApplication ?? (() => import("./app.ts")))()
        .then((module) => module.createApplication(getContext()))
        .catch((error) => {
          application = undefined;
          throw error;
        });
      return await (await application).app.fetch(request);
    },
  };
}
