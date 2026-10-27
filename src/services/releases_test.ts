/** @file 验证下载目录只展示官方仓库真实附件，并区分故障与尚未发行。 */
import { assertEquals } from "../test_helpers.ts";
import { createReleaseCatalogReader, parseReleaseCatalog } from "./releases.ts";
import { projectRepositoryUrl, projectVersion } from "../project.ts";

/** 安装包测试名称。 */
const name = "heybox-topic-notifier-android-arm64.apk";
/** 不包含真实下载请求的发行数据。 */
const release = {
  tag_name: "4.0.0",
  draft: false,
  prerelease: false,
  assets: [{
    name,
    size: 123,
    state: "uploaded",
    browser_download_url:
      `${projectRepositoryUrl}/releases/download/4.0.0/${name}`,
  }],
};

Deno.test("release catalog rejects substituted repositories and unsupported artifacts", () => {
  assertEquals(parseReleaseCatalog(release).downloads.length, 1);
  const bad = structuredClone(release);
  bad.assets[0].browser_download_url = `https://example.com/${name}`;
  assertEquals(parseReleaseCatalog(bad).downloads, []);
  bad.assets[0].browser_download_url =
    `${projectRepositoryUrl}/releases/download/4.0.1/${name}`;
  assertEquals(parseReleaseCatalog(bad).downloads, []);
  assertEquals(
    parseReleaseCatalog({
      ...release,
      assets: [{ ...release.assets[0], name: "source.zip" }],
    }).status,
    "empty",
  );
});

Deno.test("release reader combines concurrent requests and distinguishes failed requests", async () => {
  let calls = 0;
  let now = 0;
  const reader = createReleaseCatalogReader(() => {
    calls++;
    return Promise.resolve(
      calls === 1
        ? Response.json(release)
        : new Response(null, { status: 503 }),
    );
  }, () => now);
  const [first, second] = await Promise.all([reader(), reader()]);
  assertEquals(calls, 1);
  first.downloads.length = 0;
  assertEquals(second.downloads.length, 1);
  assertEquals((await reader()).downloads.length, 1);
  now = 300001;
  assertEquals((await reader()).status, "unavailable");
  assertEquals(calls, 2);
  assertEquals(
    (await createReleaseCatalogReader(() =>
      Promise.resolve(new Response(null, { status: 404 }))
    )()).status,
    "empty",
  );
});

Deno.test("project version reports deployed build rather than latest release", () => {
  assertEquals(projectVersion(" 3.9.0-beta.1+build2 "), "3.9.0-beta.1+build2");
  assertEquals(projectVersion(), "dev");
  assertEquals(projectVersion("<script>"), "dev");
});
