/** @file 验证部署设备标识校验及跨数据源实例复用，不访问真实网络。 */
import { assertEquals } from "../test_helpers.ts";
import { requireHeyboxDeviceId } from "./heybox_device_identity.ts";
import { createHeyboxTopicSource } from "./heybox_topic_source.ts";

Deno.test("persistent device identity rejects missing or unsafe values without echoing input", () => {
  for (
    const value of [
      undefined,
      "",
      " ",
      "short",
      "unsafe&token=secret",
      "x".repeat(129),
    ]
  ) {
    let error = "";
    try {
      requireHeyboxDeviceId(value);
    } catch (cause) {
      error = String(cause);
    }
    assertEquals(error.includes("HEYBOX_DEVICE_ID"), true);
    assertEquals(error.includes("secret"), false);
  }
  assertEquals(
    requireHeyboxDeviceId(" fixed-device-identity "),
    "fixed-device-identity",
  );
});

Deno.test("independent source instances reuse the configured identity while separate deployments remain distinct", async () => {
  const observed: string[] = [];
  for (
    const configured of [
      "oracle-fixed-device",
      "oracle-fixed-device",
      "deno-fixed-device",
    ]
  ) {
    const source = createHeyboxTopicSource({
      deviceId: requireHeyboxDeviceId(configured),
      fetchFn: (input) => {
        const url = new URL(String(input));
        observed.push(url.searchParams.get("imei")!);
        return Promise.resolve(
          Response.json({
            status: "ok",
            result: {
              link: {
                linkid: "sample",
                title: "公开标题",
                description: "正文",
              },
            },
          }),
        );
      },
    });
    await source.getPostDetails!({
      id: "sample",
      title: "",
      body: "",
      excerpt: "",
      comments: [],
      commentReplies: [],
      publishedAt: "",
      url: "https://www.xiaoheihe.cn/app/bbs/link/sample",
    });
  }
  assertEquals(observed, [
    "oracle-fixed-device",
    "oracle-fixed-device",
    "deno-fixed-device",
  ]);
});
