/** @file 将设置拆成独立区域，并按编辑版本合并，保留被删除话题的生命周期标记。 */
import type { AppSettings, TopicRule } from "../models.ts";
import { normalizeMatchingSettings } from "../services/matching_settings.ts";
import { baselineStamp, compareEdits, type EditStamp } from "./protocol.ts";

/** 一个可独立裁决的设置区域。 */
export type SettingsRegion = { value: unknown; stamp: EditStamp };
/** 设置的持久版本快照，revision 只用于数据库并发检查，不决定编辑胜负。 */
export type SettingsSyncSnapshot = {
  revision: string;
  sequence: number;
  regions: Record<string, SettingsRegion>;
  settings: AppSettings;
};
/** 同一操作对一个设置区域的修改。 */
export type SettingsEdit = { region: string; value: unknown; stamp: EditStamp };
/** 一次合并后的快照及被较新编辑覆盖的区域。 */
export type SettingsMerge = {
  snapshot: SettingsSyncSnapshot;
  applied: string[];
  superseded: string[];
};
/** 必须一起验证与保存的通知连接配置。 */
const groups = {
  smtp: [
    "notificationSmtpHost",
    "notificationSmtpPort",
    "notificationSmtpSecure",
    "notificationSmtpUsername",
    "notificationSmtpPassword",
  ],
  emailApi: ["notificationEmailApiUrl", "notificationEmailApiToken"],
} as const;
/** AI 连接字段作为同一组，防止拼出不匹配的模型、地址和凭据。 */
const aiConnectionFields = ["provider", "apiUrl", "apiKey", "model"] as const;

/**
 * 展开完整设置，话题按稳定 ID 隔离，删除通过 present 区域表达。
 * @param {AppSettings} settings 完整应用设置。
 * @return {Record<string, unknown>} 区域和值。
 */
export function splitSettings(settings: AppSettings): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const grouped = new Set<string>(Object.values(groups).flat());
  for (const [key, value] of Object.entries(settings)) {
    if (!["topics", "polling", "matching"].includes(key) && !grouped.has(key)) {
      values[`setting/${key}`] = value;
    }
  }
  for (const [name, fields] of Object.entries(groups)) {
    values[`group/${name}`] = Object.fromEntries(
      fields.map((field) => [field, settings[field]]),
    );
  }
  const {
    intervalUnit,
    intervalValue,
    intervalStartedAt: _intervalStartedAt,
    ...polling
  } = settings.polling;
  values["polling/interval"] = { intervalUnit, intervalValue };
  // 调度起点由实际生效的启用和间隔修改计算，不作为用户独立编辑的区域。
  for (const [key, value] of Object.entries(polling)) {
    values[`polling/${key}`] = value;
  }
  const matching = normalizeMatchingSettings(settings.matching);
  values["matching/connection"] = Object.fromEntries(
    aiConnectionFields.map((field) => [field, matching[field]]),
  );
  for (const [key, value] of Object.entries(matching)) {
    if (!(aiConnectionFields as readonly string[]).includes(key)) {
      values[`matching/${key}`] = value;
    }
  }
  for (const [index, topic] of settings.topics.entries()) {
    const prefix = `topic/${encodeURIComponent(topic.id)}/`;
    values[prefix + "present"] = true;
    values[prefix + "order"] = index;
    values[prefix + "enabled"] = topic.enabled;
    values[prefix + "note"] = topic.note;
    values[prefix + "keywordRules"] = topic.keywordRules;
  }
  return values;
}

/**
 * 用确定的零版本接纳已有设置，不给旧数据伪造新的编辑时间。
 * @param {AppSettings} settings 既有设置。
 * @return {SettingsSyncSnapshot} 初始同步快照。
 */
export function initialSettingsSnapshot(
  settings: AppSettings,
): SettingsSyncSnapshot {
  return {
    revision: "baseline",
    sequence: 0,
    settings: structuredClone(settings),
    regions: Object.fromEntries(
      Object.entries(splitSettings(settings)).map((
        [region, value],
      ) => [region, { value, stamp: baselineStamp }]),
    ),
  };
}

/**
 * 从用户看到的基线和提交值提取变化，未改动区域不参加覆盖。
 * @param {AppSettings} base 编辑开始时的设置。
 * @param {AppSettings} next 用户提交的设置。
 * @param {EditStamp} stamp 编辑版本。
 * @return {SettingsEdit[]} 仅包含实际变化的区域。
 */
export function settingsEdits(
  base: AppSettings,
  next: AppSettings,
  stamp: EditStamp,
): SettingsEdit[] {
  const before = splitSettings(base);
  const after = splitSettings(next);
  const edits: SettingsEdit[] = [];
  for (const [region, value] of Object.entries(after)) {
    if (JSON.stringify(before[region]) !== JSON.stringify(value)) {
      edits.push({ region, value, stamp });
    }
  }
  for (const region of Object.keys(before)) {
    if (
      region.startsWith("topic/") && region.endsWith("/present") &&
      !(region in after)
    ) edits.push({ region, value: false, stamp });
  }
  return edits;
}

/**
 * 将所有获胜区域重建成业务设置，并保持话题删除与较晚修改的确定性。
 * @param {SettingsSyncSnapshot} snapshot 待投影的区域快照。
 * @return {AppSettings} 对业务层可见的设置。
 */
export function projectSettings(snapshot: SettingsSyncSnapshot): AppSettings {
  const result = structuredClone(snapshot.settings);
  result.matching = normalizeMatchingSettings(result.matching);
  const topics = new Map<
    string,
    {
      topic: TopicRule;
      order: number;
      present: SettingsRegion;
      latest: EditStamp;
    }
  >();
  for (const [region, entry] of Object.entries(snapshot.regions)) {
    const [kind, field, part] = region.split("/");
    if (kind === "setting") {
      Object.assign(result, { [field]: structuredClone(entry.value) });
    }
    if (kind === "group") Object.assign(result, structuredClone(entry.value));
    if (kind === "polling") {
      Object.assign(
        result.polling,
        field === "interval" ? entry.value : { [field]: entry.value },
      );
    }
    if (kind === "matching") {
      Object.assign(
        result.matching,
        field === "connection" ? entry.value : { [field]: entry.value },
      );
    }
    if (kind !== "topic") continue;
    const item = topics.get(field) ??
      {
        topic: {
          id: decodeURIComponent(field),
          enabled: false,
          note: "",
          keywordRules: [],
        },
        order: 0,
        present: { value: false, stamp: baselineStamp },
        latest: baselineStamp,
      };
    if (part === "present") item.present = entry;
    else if (part === "order") item.order = Number(entry.value);
    else Object.assign(item.topic, { [part]: structuredClone(entry.value) });
    if (part !== "present" && compareEdits(entry.stamp, item.latest) > 0) {
      item.latest = entry.stamp;
    }
    topics.set(field, item);
  }
  result.topics = [...topics.values()].filter((item) =>
    item.present.value === true ||
    compareEdits(item.latest, item.present.stamp) > 0
  )
    .sort((a, b) =>
      a.order - b.order ||
      (a.topic.id < b.topic.id ? -1 : a.topic.id === b.topic.id ? 0 : 1)
    ).map((item) => item.topic);
  return result;
}

/**
 * 合并区域编辑，重复上传保持幂等，乱序上传不改变最终赢家。
 * @param {SettingsSyncSnapshot} current 数据库当前快照。
 * @param {readonly SettingsEdit[]} edits 待重放编辑。
 * @return {SettingsMerge} 新快照和区域裁决。
 */
export function mergeSettings(
  current: SettingsSyncSnapshot,
  edits: readonly SettingsEdit[],
): SettingsMerge {
  const snapshot = structuredClone(current);
  const applied: string[] = [];
  const superseded: string[] = [];
  for (const edit of edits) {
    const previous = snapshot.regions[edit.region];
    const comparison = compareEdits(
      edit.stamp,
      previous?.stamp ?? baselineStamp,
    );
    if (comparison > 0) {
      snapshot.regions[edit.region] = {
        value: structuredClone(edit.value),
        stamp: edit.stamp,
      };
      applied.push(edit.region);
    } else if (comparison < 0) superseded.push(edit.region);
  }
  snapshot.settings = projectSettings(snapshot);
  const pollChanged =
    current.settings.polling.enabled !== snapshot.settings.polling.enabled ||
    current.settings.polling.intervalUnit !==
      snapshot.settings.polling.intervalUnit ||
    current.settings.polling.intervalValue !==
      snapshot.settings.polling.intervalValue;
  if (pollChanged) {
    const time = Math.max(
      snapshot.regions["polling/enabled"]?.stamp.editedAt ?? 0,
      snapshot.regions["polling/interval"]?.stamp.editedAt ?? 0,
    );
    snapshot.settings.polling.intervalStartedAt = new Date(time).toISOString();
  }
  if (applied.length) {
    snapshot.revision = crypto.randomUUID();
    snapshot.sequence++;
  }
  return { snapshot, applied, superseded };
}
