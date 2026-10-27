/** @file 在两种数据库上验证离线编辑乱序、区域隔离、删除生命周期和原子竞争。 */
import { assertEquals } from "@std/assert";
import type { Storage } from "./types.ts";
import { settingsEdits } from "../sync/settings.ts";
import type { EditStamp } from "../sync/protocol.ts";

/**
 * 验证业务读取与同步裁决保持一致，较晚上传不等同于较晚修改。
 * @param {Storage} storage 待验证的真实存储适配器。
 */
export async function verifySettingsSync(storage: Storage): Promise<void> {
  const alice = storage.forUser("sync-alice");
  const bob = storage.forUser("sync-bob");
  const initial = await alice.getSettings();
  const early: EditStamp = {
    editedAt: 1000,
    counter: 0,
    deviceId: "phone",
    operationId: "early",
  };
  const late = {
    ...early,
    editedAt: 2000,
    deviceId: "web",
    operationId: "late",
  };
  const phone = {
    ...initial,
    themeColor: "#123456",
    darkMode: !initial.darkMode,
  };
  const web = { ...initial, themeColor: "#654321" };
  await alice.sync!.applySettings(settingsEdits(initial, web, late));
  const result = await alice.sync!.applySettings(
    settingsEdits(initial, phone, early),
  );
  assertEquals(result.superseded, ["setting/themeColor"]);
  assertEquals((await alice.getSettings()).themeColor, "#654321");
  assertEquals((await alice.getSettings()).darkMode, !initial.darkMode);
  assertEquals((await bob.getSettings()).themeColor, initial.themeColor);
  const beforeDuplicate = await alice.sync!.readSettings();
  await alice.sync!.applySettings(settingsEdits(initial, web, late));
  assertEquals(
    (await alice.sync!.readSettings()).revision,
    beforeDuplicate.revision,
  );

  const topicBase = {
    ...initial,
    topics: [{ id: "topic", enabled: true, note: "base", keywordRules: [] }],
  };
  await alice.sync!.applySettings(
    settingsEdits(initial, topicBase, { ...late, editedAt: 3000 }),
  );
  await alice.sync!.applySettings(
    settingsEdits(topicBase, { ...topicBase, topics: [] }, {
      ...late,
      editedAt: 5000,
    }),
  );
  const editTopic = {
    ...topicBase,
    topics: [{ ...topicBase.topics[0], note: "late edit" }],
  };
  await alice.sync!.applySettings(
    settingsEdits(topicBase, editTopic, { ...early, editedAt: 4000 }),
  );
  assertEquals(
    (await alice.getSettings()).topics.some((topic) => topic.id === "topic"),
    false,
  );
  await alice.sync!.applySettings(
    settingsEdits(topicBase, editTopic, { ...early, editedAt: 6000 }),
  );
  assertEquals(
    (await alice.getSettings()).topics.find((topic) => topic.id === "topic")
      ?.note,
    "late edit",
  );

  const edits = [
    "themeColor",
    "darkMode",
    "notificationEmailAddress",
    "notificationEmailFrom",
  ].map((field, index) => ({
    region: `setting/${field}`,
    value: ["#abcdef", true, "alice@example.com", "sender@example.com"][index],
    stamp: { ...late, editedAt: 7000, operationId: `parallel-${index}` },
  }));
  await Promise.all(edits.map((edit) => alice.sync!.applySettings([edit])));
  const merged = await alice.getSettings();
  assertEquals(merged.themeColor, "#abcdef");
  assertEquals(merged.notificationEmailFrom, "sender@example.com");
  assertEquals(merged.notificationEmailAddress, "alice@example.com");
  const latest = await alice.sync!.readSettings();
  await bob.sync!.replaceSettings(latest);
  await bob.sync!.replaceSettings(beforeDuplicate);
  assertEquals(
    (await bob.getSettings()).themeColor,
    latest.settings.themeColor,
  );
  const record = {
    id: "record",
    keyword: "help",
    location: "title" as const,
    matchedAt: "2026-01-01T00:00:00.000Z",
    post: {
      id: "post",
      title: "help",
      body: "original",
      excerpt: "",
      comments: [],
      commentReplies: [],
      publishedAt: "2026-01-01T00:00:00.000Z",
      url: "https://example.com",
    },
  };
  await alice.saveMatch(record);
  await alice.sync!.applyRecord(record.id, "history", {
    ...late,
    editedAt: 3000,
  });
  await alice.saveMatch({
    ...record,
    post: { ...record.post, body: "refreshed" },
  });
  assertEquals((await alice.listPendingMatches()).length, 0);
  assertEquals((await alice.listHistory())[0].post.body, "refreshed");
  await alice.sync!.applyRecord(record.id, "deleted", {
    ...late,
    editedAt: 5000,
  });
  await alice.sync!.applyRecord(record.id, "workspace", {
    ...early,
    editedAt: 4000,
  });
  await alice.saveMatch(record);
  assertEquals(await alice.listHistory(), []);
  await alice.sync!.applyRecord(record.id, "workspace", {
    ...early,
    editedAt: 6000,
  });
  assertEquals((await alice.listPendingMatches())[0].post.body, "refreshed");
  const beforeReplay = await alice.sync!.readRecordStates();
  await alice.sync!.applyRecord(record.id, "deleted", {
    ...late,
    editedAt: 5000,
  });
  assertEquals(await alice.sync!.readRecordStates(), beforeReplay);
  assertEquals(await bob.listHistory(), []);
  await Promise.all([
    alice.sync!.applyRecord(record.id, "deleted", { ...late, editedAt: 7000 }),
    alice.sync!.applyRecord(record.id, "history", { ...early, editedAt: 8000 }),
  ]);
  assertEquals(
    (await alice.listHistory())[0].completedAt,
    new Date(8000).toISOString(),
  );
}
