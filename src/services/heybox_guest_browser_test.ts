/** @file 验证浏览器权限不可用时的隔离失败与关闭行为，不启动浏览器或请求真实上游。 */
import { assertRejects } from "../test_helpers.ts";
import { createGuestBrowser } from "./heybox_guest_browser.ts";

Deno.test({
  name:
    "anonymous browser permission failure remains an initialization error and closes safely",
  permissions: { sys: false, run: false, net: false },
  async fn() {
    const guest = createGuestBrowser();
    try {
      await assertRejects(
        () => guest.initialize("sample"),
        "Anonymous initialization failed",
      );
    } finally {
      await guest.close();
    }
    await assertRejects(
      () => guest.initialize("sample"),
      "Anonymous initialization unavailable",
    );
    await guest.close();
  },
});

Deno.test("anonymous browser rejects invalid identifiers before loading browser dependencies", async () => {
  const guest = createGuestBrowser();
  try {
    await assertRejects(
      () => guest.initialize("../private"),
      "Anonymous initialization unavailable",
    );
  } finally {
    await guest.close();
  }
});
