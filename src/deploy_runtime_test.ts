/**
 * @file 本文件验证定时任务不加载网页模块、并发请求共享应用及加载失败恢复。
 */
import { createDeployRuntime } from "./deploy_runtime.ts";
import type { PollingContext } from "./services/polling_context.ts";
import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "./test_helpers.ts";

Deno.test("deploy cron stays independent of HTTP loading and shares its context", async () => {
  let contexts = 0;
  let loads = 0;
  let ticks = 0;
  const context = {
    scheduler: {
      tick: () => {
        ticks++;
        return Promise.resolve(false);
      },
    },
  } as PollingContext;
  const runtime = createDeployRuntime({
    createContext: () => {
      contexts++;
      return context;
    },
    loadApplication: () => {
      loads++;
      return Promise.resolve({
        createApplication: (shared) => {
          assertStrictEquals(shared, context);
          return {
            app: { fetch: () => new Response("ready") },
          } as unknown as ReturnType<
            typeof import("./app.ts").createApplication
          >;
        },
      });
    },
  });
  await runtime.tick();
  await runtime.tick();
  assertEquals([contexts, loads, ticks], [1, 0, 2]);
  const responses = await Promise.all([
    runtime.fetch(new Request("https://example.com/")),
    runtime.fetch(new Request("https://example.com/login")),
  ]);
  assertEquals(
    await Promise.all(responses.map((response) => response.text())),
    ["ready", "ready"],
  );
  assertEquals([contexts, loads], [1, 1]);
});

Deno.test("deploy HTTP module load failures can retry without disrupting cron", async () => {
  let loads = 0;
  const runtime = createDeployRuntime({
    createContext: () =>
      ({ scheduler: { tick: () => Promise.resolve(false) } }) as PollingContext,
    loadApplication: () => {
      loads++;
      if (loads === 1) return Promise.reject(new Error("load failed"));
      return Promise.resolve({
        createApplication: () =>
          ({
            app: { fetch: () => new Response("ready") },
          }) as unknown as ReturnType<
            typeof import("./app.ts").createApplication
          >,
      });
    },
  });
  await assertRejects(
    () => runtime.fetch(new Request("https://example.com/")),
    "load failed",
  );
  assertEquals(await runtime.tick(), false);
  assertEquals(
    await (await runtime.fetch(new Request("https://example.com/"))).text(),
    "ready",
  );
  assertEquals(loads, 2);
});
