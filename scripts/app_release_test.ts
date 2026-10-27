/** @file 验证发行版本编码、完整产物检查、上传顺序及中断恢复，不访问真实 Release。 */
import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { parse, stringify } from "@std/yaml";
import {
  githubClient,
  type GitHubRequest,
  type ReleaseAsset,
  releaseAssetNames,
  releaseVersion,
  uploadRelease,
  verifyUpdateManifest,
} from "./app_release.ts";

/** 固定的虚构源码提交，不对应远程发行。 */
const commit = "a".repeat(40);
/** 内存构建产物，只用于验证编排和摘要比较。 */
const assets: ReleaseAsset[] = releaseAssetNames.map((name, index) => ({
  name,
  path: name,
  size: 10 + index,
  sha256: String(index).repeat(64),
  sha512: "fixture-base64-digest",
}));

/**
 * 模拟 GitHub 附件存储及失败点，记录所有改变远程状态的请求。
 * @return {object} 发行信息、API 与上传入口。
 */
function harness() {
  const release = {
    id: 42,
    tag_name: "3.8.2",
    prerelease: false,
    draft: false,
    immutable: false,
  };
  const remote = new Map<
    string,
    { id?: number; name: string; size: number; state: string; digest?: string }
  >();
  const writes: string[] = [];
  const state = { commit, fail: "", badDigest: false, annotated: false };
  /** @param {string} path API 路径。 @param {RequestInit} init 请求数据。 @return {Promise<unknown>} 虚构 GitHub 响应。 */
  const request: GitHubRequest = (path, init) => {
    if (path.startsWith("/releases/tags/")) return Promise.resolve(release);
    if (path.startsWith("/git/ref/")) {
      return Promise.resolve({
        object: { type: state.annotated ? "tag" : "commit", sha: state.commit },
      });
    }
    if (path.startsWith("/git/tags/")) {
      return Promise.resolve({ object: { type: "commit", sha: state.commit } });
    }
    if (path.includes("per_page=")) {
      return Promise.resolve([...remote.values()]);
    }
    if (init?.method === "DELETE") {
      writes.push("DELETE");
      for (const [name, value] of remote) {
        if (path.endsWith(`/${value.id}`)) remote.delete(name);
      }
      return Promise.resolve(null);
    }
    const name = new URL("https://uploads.github.com" + path).searchParams.get(
      "name",
    )!;
    const local = assets.find((asset) => asset.name === name)!;
    assertEquals(init?.method, "POST");
    writes.push(name);
    if (state.fail === name) {
      return Promise.reject(new Error("Network failure"));
    }
    const uploaded = {
      name,
      size: local.size,
      state: "uploaded",
      digest: `sha256:${state.badDigest ? "bad" : local.sha256}`,
    };
    remote.set(name, uploaded);
    return Promise.resolve(uploaded);
  };
  return {
    release,
    remote,
    writes,
    state,
    upload: (files = assets) =>
      uploadRelease({
        request,
        tag: "3.8.2",
        commit,
        releaseId: 42,
        assets: files,
        openBody: () => Promise.resolve("fixture"),
      }),
  };
}

Deno.test("release versions follow existing bare tags and preserve monotonic Android codes", () => {
  assertEquals(releaseVersion("3.8.2"), {
    tag: "3.8.2",
    version: "3.8.2",
    versionCode: 3008003,
  });
  assertEquals(releaseVersion("v3.8.2").versionCode, 3008003);
  assertEquals(releaseVersion("0.0.0").versionCode, 1);
  assertEquals(releaseVersion("2099.999.999").versionCode, 2100000000);
  assert(
    releaseVersion("4.0.0").versionCode >
      releaseVersion("3.999.999").versionCode,
  );
  assert(
    releaseVersion("3.9.0").versionCode > releaseVersion("3.8.999").versionCode,
  );
  for (
    const tag of [
      "3.08.2",
      "3.8",
      "3.8.2-beta",
      "3.8.2\n",
      "$(whoami)",
      "2100.0.0",
      "1.1000.0",
      "1.0.1000",
    ]
  ) assertThrows(() => releaseVersion(tag));
});

Deno.test("updater manifest must match the installer version, name, size and digest", () => {
  const file = assets[0];
  const manifest = {
    version: "3.8.2",
    files: [{ url: file.name, sha512: file.sha512, size: file.size }],
    path: file.name,
    sha512: file.sha512,
  };
  verifyUpdateManifest(stringify(manifest), "3.8.2", file);
  assertThrows(() =>
    verifyUpdateManifest(
      stringify({ ...manifest, version: "3.8.1" }),
      "3.8.2",
      file,
    )
  );
  assertThrows(() =>
    verifyUpdateManifest(stringify(manifest), "3.8.2", {
      ...file,
      size: file.size + 1,
    })
  );
  assertThrows(() =>
    verifyUpdateManifest(stringify(manifest), "3.8.2", {
      ...file,
      sha512: "other",
    })
  );
  assertThrows(() =>
    verifyUpdateManifest(
      stringify({ ...manifest, path: "other.exe" }),
      "3.8.2",
      file,
    )
  );
});

Deno.test("release uploads all installers before the update manifest and retries without overwriting", async () => {
  const context = harness();
  context.state.annotated = true;
  await context.upload();
  assertEquals(context.writes, [...releaseAssetNames]);
  await context.upload();
  assertEquals(context.writes, [...releaseAssetNames]);
});

Deno.test("failed Android upload never publishes latest.yml and can resume with the same artifacts", async () => {
  const context = harness();
  context.state.fail = releaseAssetNames[2];
  await assertRejects(() => context.upload(), Error, "Network failure");
  assert(!context.remote.has("latest.yml"));
  context.state.fail = "";
  context.writes.length = 0;
  await context.upload();
  assertEquals(context.writes, [releaseAssetNames[2], "latest.yml"]);
});

Deno.test("release conflicts are checked before any missing asset is uploaded", async () => {
  const context = harness();
  context.remote.set("latest.yml", {
    name: "latest.yml",
    size: 13,
    state: "uploaded",
    digest: "sha256:different",
  });
  await assertRejects(() => context.upload(), Error, "拒绝覆盖");
  assertEquals(context.writes, []);
});

Deno.test("incomplete zero-byte GitHub upload can be removed and retried", async () => {
  const context = harness();
  context.remote.set(assets[0].name, {
    id: 99,
    name: assets[0].name,
    size: 0,
    state: "starter",
  });
  await context.upload();
  assertEquals(context.writes, ["DELETE", ...releaseAssetNames]);
});

Deno.test("moved tags, replaced releases, missing artifacts and immutable releases fail before upload", async () => {
  const moved = harness();
  moved.state.commit = "b".repeat(40);
  await assertRejects(() => moved.upload(), Error, "标签在构建后发生变化");
  assertEquals(moved.writes, []);
  const replaced = harness();
  replaced.release.id = 43;
  await assertRejects(() => replaced.upload(), Error, "身份");
  assertEquals(replaced.writes, []);
  const missing = harness();
  await assertRejects(() => missing.upload(assets.slice(1)), Error, "同时提供");
  assertEquals(missing.writes, []);
  const locked = harness();
  locked.release.immutable = true;
  await assertRejects(() => locked.upload(), Error, "锁定");
  assertEquals(locked.writes, []);
});

Deno.test("GitHub must confirm each uploaded digest before publishing the next asset", async () => {
  const context = harness();
  context.state.badDigest = true;
  await assertRejects(() => context.upload(), Error, "完整性");
  assertEquals(context.writes, [releaseAssetNames[0]]);
});

Deno.test("release workflow pins both build jobs to the validated commit and gates publication on both", async () => {
  const workflow = parse(
    await Deno.readTextFile(
      new URL("../.github/workflows/app-build.yml", import.meta.url),
    ),
  ) as {
    on: { release: { types: string[] } };
    permissions: object;
    jobs: Record<
      string,
      {
        needs: string[];
        permissions?: object;
        steps: { uses?: string; with?: Record<string, unknown> }[];
      }
    >;
  };
  assertEquals(workflow.on.release.types, ["published"]);
  assertEquals(workflow.permissions, { contents: "read" });
  for (const name of ["windows", "android"]) {
    assert(workflow.jobs[name].needs.includes("check"));
    assertEquals(
      workflow.jobs[name].steps[0].with?.ref,
      "${{ needs.prepare.outputs.commit }}",
    );
  }
  assertEquals(workflow.jobs.publish.needs, [
    "prepare",
    "check",
    "windows",
    "android",
  ]);
  assertEquals(workflow.jobs.publish.permissions, { contents: "write" });
});

Deno.test("release transport keeps credentials on official hosts and handles empty deletion responses", async () => {
  const visited: string[] = [];
  const client = githubClient(
    "owner/repository",
    "fixture-token",
    (url, init) => {
      visited.push(String(url));
      assertEquals(init?.redirect, "error");
      assertEquals(
        new Headers(init?.headers).get("authorization"),
        "Bearer fixture-token",
      );
      return Promise.resolve(
        init?.method === "DELETE"
          ? new Response(null, { status: 204 })
          : Response.json({ ok: true }),
      );
    },
  );
  await client("/releases/tags/3.8.2");
  await client("/releases/42/assets?name=fixture", {
    method: "POST",
    body: "fixture",
  });
  assertEquals(await client("/releases/assets/42", { method: "DELETE" }), null);
  assertEquals(visited.map((url) => new URL(url).hostname), [
    "api.github.com",
    "uploads.github.com",
    "api.github.com",
  ]);
  await assertRejects(() => client("//untrusted.example"), Error, "路径");
});
