/** @file 在服务器独立运行原生 SDK 详情服务，身份、刷新与冷却不依赖本地设备。 */
import { isAbsolute, join } from "node:path";
import { createDetailRelayHandler } from "./services/heybox_detail_relay.ts";
import { openNativeRetryFile } from "./services/heybox_native_retry_file.ts";
import {
  createSdkIdentity,
  openSdkIdentity,
} from "./services/heybox_sdk_identity.ts";
import { createSdkRuntime } from "./services/heybox_sdk_runtime.ts";
import { createSdkRefresher } from "./services/heybox_sdk_registration.ts";
import { createHostedSdkDetails } from "./services/heybox_sdk_details.ts";
import { openSdkCaptcha } from "./services/heybox_sdk_captcha.ts";

/**
 * 初始化或启动固定身份的取数服务；运行器退出不影响持久令牌和共享冷却。
 * @return {Promise<void>} 初始化完成或独立服务正常退出。
 */
async function main(): Promise<void> {
  const directory = Deno.env.get("HEYBOX_SDK_STATE_DIR") ?? "";
  if (
    !isAbsolute(directory) ||
    Deno.args.some((arg) =>
      !["--initialize", "--refresh", "--confirm-captcha"].includes(arg)
    ) ||
    Deno.args.length > 1
  ) {
    throw new Error("Invalid SDK service configuration");
  }
  const identity = await openSdkIdentity(
    directory,
    Deno.args.includes("--initialize") ? createSdkIdentity() : undefined,
  );
  try {
    if (Deno.args.includes("--initialize")) {
      console.log(JSON.stringify({ event: "sdk_identity_initialized" }));
      return;
    }
    const checkpoint = await openNativeRetryFile(
      join(directory, "detail-retry.json"),
      identity.read().bindingId,
    );
    try {
      const collect = await createSdkRuntime({
        java: Deno.env.get("HEYBOX_SDK_JAVA") ?? "/usr/bin/java",
        directory: Deno.env.get("HEYBOX_SDK_RUNTIME_DIR") ?? "",
        stateDirectory: directory,
        library: Deno.env.get("HEYBOX_SDK_LIBRARY") ?? "",
      });
      const register = createSdkRefresher({ identity, collect });
      /**
       * 记录无身份内容的续期结果，供服务运维判断实际注册状态。
       * @return {Promise<void>} 注册完成或保留冷却并抛出错误。
       */
      const refresh = async (): Promise<void> => {
        try {
          await register();
          console.log(JSON.stringify({ event: "sdk_identity_refreshed" }));
        } catch {
          console.warn(
            JSON.stringify({ event: "sdk_identity_refresh_failed" }),
          );
          throw new Error("SDK registration unavailable");
        }
      };
      if (Deno.args.includes("--refresh")) {
        if (checkpoint.retryAt > Date.now()) {
          throw new Error("Details cooling down");
        }
        await refresh();
        return;
      }
      const captcha = await openSdkCaptcha(
        directory,
        identity.read().bindingId,
      );
      const source = createHostedSdkDetails({
        identity,
        checkpoint,
        captcha,
        refresh,
      });
      if (Deno.args.includes("--confirm-captcha")) {
        const reader = Deno.stdin.readable.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > 8192) {
              throw new Error("Verification receipt too large");
            }
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const result = await source.confirmCaptcha(
          JSON.parse(new TextDecoder().decode(bytes)),
        );
        const accepted = result.detailsComplete === true ||
          result.detailUnavailable === "deleted";
        console.log(
          JSON.stringify({
            event: "sdk_captcha_confirmation",
            accepted,
            bodyCharacters: result.body.length,
            comments: result.comments.length,
            replies: result.commentReplies.length,
          }),
        );
        if (!accepted) Deno.exitCode = 1;
        return;
      }
      const server = Deno.serve(
        {
          hostname: "127.0.0.1",
          port: 8788,
          onListen: () =>
            console.log(
              JSON.stringify({ event: "sdk_details_listening", port: 8788 }),
            ),
        },
        createDetailRelayHandler({
          token: Deno.env.get("HEYBOX_GUEST_DETAIL_TOKEN") ?? "",
          source,
        }),
      );
      /** 等待在途请求结束后关闭，身份和冷却锁由外层统一释放。 */
      const shutdown = () => {
        void server.shutdown();
      };
      Deno.addSignalListener("SIGTERM", shutdown);
      Deno.addSignalListener("SIGINT", shutdown);
      try {
        await server.finished;
      } finally {
        Deno.removeSignalListener("SIGTERM", shutdown);
        Deno.removeSignalListener("SIGINT", shutdown);
      }
    } finally {
      checkpoint.close();
    }
  } finally {
    identity.close();
  }
}

try {
  await main();
} catch {
  console.error(
    JSON.stringify({
      event: "sdk_details_stopped",
      reason: "configuration_state_or_runtime_unavailable",
    }),
  );
  Deno.exitCode = 1;
}
