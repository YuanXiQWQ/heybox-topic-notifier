/** @file 验证离线配置字段和话题归属在多设备编辑、删除与乱序重放后的结果。 */
import { assertEquals } from "../test_helpers.ts";
import { defaultAppSettingsFromEnv } from "../services/default_settings.ts";
import { normalizeMatchingSettings } from "../services/matching_settings.ts";
import { nextEditStamp } from "./protocol.ts";
import {
  initialSettingsSnapshot,
  mergeSettings,
  settingsEdits,
} from "./settings.ts";

Deno.test("offline profile edits merge independently and a deleted target falls back to default", () => {
  const app = defaultAppSettingsFromEnv();
  app.matchingProfiles = [{ id: "default", name: "" }, {
    id: "second",
    name: "社区",
    options: normalizeMatchingSettings({ mode: "ai", prompt: "原提示词" }),
  }];
  const baseline = initialSettingsSnapshot(app);
  const desktop = structuredClone(app);
  desktop.matchingProfiles![1].options!.prompt = "新的社区提示词";
  desktop.matchingProfiles![1].name = "攻略";
  const phone = structuredClone(app);
  phone.topics[0].profileId = "second";
  phone.matchingProfiles![1].options!.dailyLimit = 32;
  const early = settingsEdits(
    app,
    desktop,
    nextEditStamp(undefined, 1000, "desktop"),
  );
  const late = settingsEdits(
    app,
    phone,
    nextEditStamp(undefined, 2000, "phone"),
  );
  const merged =
    mergeSettings(mergeSettings(baseline, late).snapshot, early).snapshot;
  assertEquals(
    merged.settings,
    mergeSettings(mergeSettings(baseline, early).snapshot, late).snapshot
      .settings,
  );
  assertEquals(
    merged.settings.matchingProfiles![1].options!.prompt,
    "新的社区提示词",
  );
  assertEquals(merged.settings.matchingProfiles![1].options!.dailyLimit, 32);
  assertEquals(merged.settings.topics[0].profileId, "second");
  const removed = structuredClone(app);
  removed.matchingProfiles!.pop();
  const deletion = settingsEdits(
    app,
    removed,
    nextEditStamp(undefined, 3000, "desktop"),
  );
  const after = mergeSettings(merged, deletion).snapshot;
  assertEquals(after.settings.matchingProfiles, [{ id: "default", name: "" }]);
  assertEquals(after.settings.topics[0].profileId, undefined);
  assertEquals(mergeSettings(after, late).snapshot.settings, after.settings);
});

Deno.test("default profile names from offline clients never override the device language", () => {
  const app = defaultAppSettingsFromEnv();
  app.matchingProfiles = [{ id: "default", name: "自定义旧名称" }];
  const snapshot = initialSettingsSnapshot(app);
  const result = mergeSettings(snapshot, [{
    region: "profile/default/name",
    value: "其它设备名称",
    stamp: nextEditStamp(undefined, 1000, "desktop"),
  }]);
  assertEquals(result.snapshot.settings.matchingProfiles![0].name, "");
});

Deno.test("offline annotations merge per example and deletion survives replay", () => {
  const app = defaultAppSettingsFromEnv();
  const sample = {
    id: "a",
    title: "回顾",
    topicId: "1",
    topicNote: "",
    url: "",
    post: {
      id: "a", title: "回顾", body: "通关过程", excerpt: "", url: "",
      publishedAt: "", comments: ["当时卡住了"], commentReplies: ["后来解决了"],
    },
    reason: "已解决",
    addedAt: 1,
  };
  app.matching = normalizeMatchingSettings({
    counterexamples: [
      sample,
      { ...sample, id: "b", post: { ...sample.post, id: "b" }, addedAt: 2 },
    ],
  });
  const early = structuredClone(app), late = structuredClone(app);
  early.matching!.counterexamples.shift();
  late.matching!.counterexamples[1].reason = "讨论的是另一个玩家";
  const first = settingsEdits(app, early, nextEditStamp(undefined, 100, "one"));
  const second = settingsEdits(app, late, nextEditStamp(undefined, 200, "two"));
  const snapshot = initialSettingsSnapshot(app);
  const forward =
    mergeSettings(mergeSettings(snapshot, first).snapshot, second).snapshot;
  const reverse =
    mergeSettings(mergeSettings(snapshot, second).snapshot, first).snapshot;
  assertEquals(forward.settings, reverse.settings);
  assertEquals(forward.settings.matching!.counterexamples, [
    late.matching!.counterexamples[1],
  ]);
});
