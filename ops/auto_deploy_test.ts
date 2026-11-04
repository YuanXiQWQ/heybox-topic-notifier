/** @file 验证正式标签、发行检查、版本顺序与失败重试边界，禁止用分支构建替代发行。 */
import { assertEquals, assertRejects } from "@std/assert";
import {
  deploymentTarget,
  latestRelease,
  parseVersion,
  type Release,
  type Run,
  tagCommit,
} from "./auto_deploy.ts";

/** 测试使用的不可变提交身份。 */
const sha = "a".repeat(40);
/** 完整发行附件，与生产检查保持独立以验证缺失附件会阻止部署。 */
const assets = [
  "heybox-topic-notifier-windows-x64-setup.exe",
  "heybox-topic-notifier-windows-x64-setup.exe.blockmap",
  "heybox-topic-notifier-android-universal.apk",
  "latest.yml",
];

/**
 * 构造公开正式发行。
 * @param {string} tag 正式标签。
 * @return {Release} 完整发行元数据。
 */
function release(tag = "3.13.2"): Release {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    published_at: "2026-11-04T08:20:53Z",
    assets: assets.map((name) => ({ name, size: 100, state: "uploaded" })),
  };
}

/**
 * 构造标签触发的成功发行构建。
 * @param {Partial<Run>} overrides 需要覆盖的状态。
 * @return {Run} 构建元数据。
 */
function run(overrides: Partial<Run> = {}): Run {
  return {
    id: 1,
    run_attempt: 1,
    event: "push",
    head_branch: "3.13.2",
    head_sha: sha,
    status: "completed",
    conclusion: "success",
    ...overrides,
  };
}

/**
 * 为发行检查提供隔离 API，并拒绝意外请求。
 * @param {Release[]} releases 发行列表。
 * @param {Run[]} runs 发行构建列表。
 * @return {(path: string) => Promise<unknown>} 只读测试接口。
 */
function api(
  releases = [release()],
  runs = [run()],
): (path: string) => Promise<unknown> {
  return (path) => {
    if (path === "/releases?per_page=100") return Promise.resolve(releases);
    if (path.startsWith("/git/ref/tags/")) {
      return Promise.resolve({ object: { type: "commit", sha } });
    }
    if (path.startsWith("/actions/workflows/app-build.yml/runs?")) {
      return Promise.resolve({ workflow_runs: runs });
    }
    throw new Error(`Unexpected path: ${path}`);
  };
}

Deno.test("deployment versions accept only supported stable tags", () => {
  assertEquals(parseVersion("v3.13.2")?.version, "3.13.2");
  for (
    const tag of [
      "main",
      "dev",
      "3.13.2-rc1",
      "03.13.2",
      "3.1000.0",
      "2100.0.0",
      "3.13.2;exit",
    ]
  ) assertEquals(parseVersion(tag), undefined);
});

Deno.test("deployment selects version order and excludes drafts and prereleases", () => {
  assertEquals(
    latestRelease([release("3.9.0"), release("3.13.2"), {
      ...release("4.0.0"),
      draft: true,
    }, { ...release("5.0.0"), prerelease: true }])?.tag_name,
    "3.13.2",
  );
});

Deno.test("deployment requires a completed tag build for the exact commit", async () => {
  const target = await deploymentTarget(api(), {});
  assertEquals(target?.sha, sha);
  assertEquals(target?.attempt, `3.13.2:${sha}:1:1`);
  for (
    const overrides of [
      { head_branch: "main" },
      { head_sha: "b".repeat(40) },
      { event: "pull_request" },
      { status: "in_progress" },
      { conclusion: "failure" },
      { conclusion: "cancelled" },
    ]
  ) {
    assertEquals(
      await deploymentTarget(api([release()], [run(overrides)]), {}),
      undefined,
    );
  }
});

Deno.test("deployment waits for complete assets without falling back to an older release", async () => {
  const incomplete = { ...release(), assets: release().assets.slice(0, 3) };
  assertEquals(
    await deploymentTarget(api([incomplete, release("3.13.1")]), {}),
    undefined,
  );
  assertEquals(
    await deploymentTarget(
      api([{
        ...release(),
        assets: release().assets.map((asset) => ({ ...asset, size: 0 })),
      }]),
      {},
    ),
    undefined,
  );
});

Deno.test("deployment does not redeploy or downgrade an installed version", async () => {
  for (const version of ["3.13.2", "3.13.3"]) {
    assertEquals(
      await deploymentTarget(api(), {
        current: { ...parseVersion(version)!, sha },
      }),
      undefined,
    );
  }
});

Deno.test("failed or interrupted deployment requires a new successful run attempt", async () => {
  const attempted = `3.13.2:${sha}:1:1`;
  for (const result of ["failed", "deploying"] as const) {
    assertEquals(
      await deploymentTarget(api(), { attempted, result }),
      undefined,
    );
    assertEquals(
      (await deploymentTarget(api([release()], [run({ run_attempt: 2 })]), {
        attempted,
        result,
      }))?.attempt,
      `3.13.2:${sha}:1:2`,
    );
  }
});

Deno.test("a newer failed tag build blocks an older success", async () => {
  assertEquals(
    await deploymentTarget(
      api([release()], [run(), run({ id: 2, conclusion: "failure" })]),
      {},
    ),
    undefined,
  );
});

Deno.test("annotated tags resolve to a commit and malformed identities fail closed", async () => {
  assertEquals(
    await tagCommit((path) =>
      Promise.resolve({
        object: { type: path.startsWith("/git/ref/") ? "tag" : "commit", sha },
      }), "3.13.2"),
    sha,
  );
  await assertRejects(() =>
    tagCommit(
      () => Promise.resolve({ object: { type: "commit", sha: "main" } }),
      "3.13.2",
    )
  );
  await assertRejects(() =>
    tagCommit(() => Promise.resolve({ object: { type: "tag", sha } }), "3.13.2")
  );
});

Deno.test("GitHub errors stop the deployment decision", async () => {
  await assertRejects(
    () => deploymentTarget(() => Promise.reject(new Error("HTTP 403")), {}),
    Error,
    "HTTP 403",
  );
});
