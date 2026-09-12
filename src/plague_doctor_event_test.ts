/** @file 疫医转变事件的使徒记录、绑定演出与白夜接管回归测试。 */
import {
  assert,
  assertEquals,
  assertStrictEquals,
  stripJavaScriptCommentsAndStrings,
} from "./test_helpers.ts";
import { installLobotomyCorpAlertHarness } from "./test_harness.ts";
import {
  plagueDoctorAdventTimings,
  plagueDoctorApostleCount,
  plagueDoctorBindingTimings,
  plagueDoctorClockCenterContent,
  plagueDoctorCssArrowAngle,
  plagueDoctorRingHole,
  plagueDoctorSoundPaths,
  plagueDoctorStageGeometry,
  plagueDoctorStorageKey,
  plagueDoctorTransformationDanger,
} from "../static/fun/lobotomy-corp/Events/PlagueDoctor.js";
import { whiteNightSimpleAdventClockCenterSprite } from "../static/fun/lobotomy-corp/Events/WhiteNightAdvent.js";

/** 断言数值与期望值的误差在容差内。 */
function assertClose(actual: number, expected: number, tolerance = 0.01): void {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `期望 ${expected}（容差 ${tolerance}），实际 ${actual}`,
  );
}

Deno.test("疫医：表盘几何与 AdventClockUI.prefab 完全一致", () => {
  const geometry = plagueDoctorStageGeometry;
  // AddApostle/Clock：819×819、距顶 25、水平居中。
  assertEquals(geometry.clock, {
    height: 819,
    left: 550.5,
    top: 25,
    width: 819,
  });
  // Point 在 Clock 正中心，Arrow 以底边中心为枢轴向上伸出 216。
  assertEquals(geometry.arrow, {
    height: 216,
    offsetX: 1,
    offsetY: -15.1,
    width: 60,
  });
  assertClose(geometry.nameParentOffsetY, 8.750008);
  // BlackShader：DeathAngelClockDark 2112×1188，中心相对画布中心上移 30。
  assertEquals(geometry.blackShader, {
    height: 1188,
    left: -96,
    top: -84,
    width: 2112,
  });
  // Lowershader：1920×292.8，中心相对画布中心下移 405.6。
  assertClose(geometry.lowerShader.top, 799.2);
  assertEquals(geometry.lowerShader.left, 0);
  assertEquals(geometry.lowerShader.width, 1920);
  assertClose(geometry.lowerShader.height, 292.8);
  // ApostleDesc：1600×180，中心相对画布中心下移 438。
  assertEquals(geometry.desc, {
    height: 180,
    left: 160,
    top: 888,
    width: 1600,
  });
  // Circle：ClockCenter 贴图对齐到 ClockFrame 的圆环内孔（尺寸与盘心一致）。
  const sprite = whiteNightSimpleAdventClockCenterSprite;
  const frameFit = Math.min(819 / plagueDoctorRingHole.textureWidth, 819 /
    plagueDoctorRingHole.textureHeight);
  assertClose(geometry.circle.width, plagueDoctorRingHole.width * frameFit, 0.01);
  assertClose(
    geometry.circle.height,
    plagueDoctorRingHole.height * frameFit,
    0.01,
  );
  assert(
    geometry.circle.width < geometry.clock.width / 2,
    "圆盘中心贴图必须小于圆盘直径的一半，不能盖住整个圆环",
  );
  assertClose(
    geometry.circle.left + geometry.circle.width / 2,
    geometry.clock.left + geometry.clock.width / 2,
    0.01,
  );
  assertClose(
    geometry.circle.top + geometry.circle.height / 2,
    geometry.clock.top + geometry.clock.height / 2,
    0.01,
  );
  assertClose(geometry.circle.rotation, 179.51292, 0.0001);
  assertClose(
    geometry.circle.backgroundSizeWidth,
    sprite.texture.width * frameFit,
    0.01,
  );
  assertClose(
    geometry.circle.backgroundSizeHeight,
    sprite.texture.height * frameFit,
    0.01,
  );
  assertClose(
    geometry.circle.backgroundPositionX,
    -plagueDoctorClockCenterContent.x * frameFit,
    0.01,
  );
  assertClose(
    geometry.circle.backgroundPositionY,
    -plagueDoctorClockCenterContent.y * frameFit,
    0.01,
  );
});

Deno.test("疫医：指针从垂直向上开始顺时针转动", () => {
  // SetArrowRotation 使用 Unity 旋转（逆时针为正），CSS rotate 顺时针为正。
  assertClose(plagueDoctorCssArrowAngle(0), 0);
  assertClose(plagueDoctorCssArrowAngle(1), 30);
  assertClose(plagueDoctorCssArrowAngle(11), 330);
  assertClose(plagueDoctorCssArrowAngle(12), 360);
  const css = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/lobotomy-corp.css",
      import.meta.url,
    ),
  );
  // 指针框必须从枢轴向上伸出（-100%），枢轴才留在圆盘中心。
  assert(
    css.includes("calc(-100% + var(--lobotomy-corp-advent-arrow-offset-y))"),
    "指针应以底边中心为枢轴向上伸出",
  );
  // shader 图层按 viewport 铺满，背景不会只覆盖 16:9 逻辑画布。
  assert(
    css.includes("position: absolute;\n  top: 50%;")
      || /\.lobotomy-corp-plague-doctor-advent-shader\{[\s\S]*?top: 50%;/u.test(css),
    "shader 图层应铺满 viewport",
  );
});

Deno.test("疫医：表盘只引用 prefab 里真实连接的 sprite 与字体", () => {
  const source = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Events/PlagueDoctor.js",
      import.meta.url,
    ),
  );
  // BlackShader 在 prefab 中引用 DeathAngelClockDark 这张暗角图。
  assert(source.includes("DeathAngelClockDark.png"));
  assert(!source.includes("BlackFilter"));
  for (
    const sprite of [
      "ClockFrame.png",
      "ClockArrow.png",
      "ClockCenter.png",
      "GlobalShader.png",
      "ClockShader.png",
      "LowerShader.png",
    ]
  ) {
    assert(source.includes(sprite), `表盘应引用 ${sprite}`);
  }
  const css = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/lobotomy-corp.css",
      import.meta.url,
    ),
  );
  // ApostleDesc 使用 NanumMyeongjo；名字仍然使用 BMDOHYEON。
  assert(css.includes("NanumMyeongjo.ttf"));
  assert(css.includes("BMDOHYEON.ttf"));
});

Deno.test("彩蛋演出代码不依赖 HTMLCollection 上的数组方法", () => {
  const eventsRoot = new URL(
    "../static/fun/lobotomy-corp/Events/",
    import.meta.url,
  );
  const entries = [...Deno.readDirSync(eventsRoot)]
    .filter((entry) => entry.isFile && entry.name.endsWith(".js"));
  assert(entries.length > 0, "Events 目录应包含彩蛋模块");
  for (const entry of entries) {
    const code = stripJavaScriptCommentsAndStrings(
      Deno.readTextFileSync(new URL(entry.name, eventsRoot)),
    );
    assertEquals(
      /\.children\s*\.\s*(?:forEach|map|filter|some|every|reduce|find)\b/u
        .test(code),
      false,
      `${entry.name} 应在 HTMLCollection 上使用 Array.from 或索引访问`,
    );
  }
});

/** 让等待中的微任务（演出完成回调）全部执行。 */
async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

/**
 * 推进演出时钟并触发已排队的动画帧。
 *
 * @param harness 彩蛋测试环境。
 * @param clock 当前受控时钟的可写引用。
 * @param ms 需要推进的毫秒数。
 * @return {Promise<void>} 演出与完成回调执行结束时完成。
 */
async function advance(
  harness: ReturnType<typeof installLobotomyCorpAlertHarness>,
  clock: { value: number },
  ms: number,
): Promise<void> {
  clock.value += ms;
  harness.setNow(clock.value);
  harness.fireFrames();
  await flushMicrotasks();
  harness.fireFrames();
  await flushMicrotasks();
}

Deno.test("疫医：第一次保存 O-01-45 只开始记录，不计为使徒", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    await api.commitDisplayName("O-01-45");
    assertStrictEquals(api.plagueDoctorRecording(), true);
    assertEquals(api.plagueDoctorApostles(), []);
    assertStrictEquals(api.getDangerScore(), 0);
    assertStrictEquals(api.getSpecialEvent(), undefined);
  } finally {
    harness.restore();
  }
});

Deno.test("疫医：记录期间每次保存绑定一名使徒，识别到异想体时写异想体名", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    await api.commitDisplayName("O-01-45");
    await advance(harness, clock, plagueDoctorBindingTimings.nameEffectMs);
    assertEquals(api.plagueDoctorApostles(), ["疫医"]);
    await api.commitDisplayName("  hello  ");
    await advance(harness, clock, plagueDoctorBindingTimings.nameEffectMs);
    assertEquals(api.plagueDoctorApostles(), ["疫医", "  hello  "]);
    // 绑定期间不产生普通异想体危急值。
    assertStrictEquals(api.getDangerScore(), 0);
  } finally {
    harness.restore();
  }
});

Deno.test("疫医：记录期间提交白夜编号只绑定使徒，不激活白夜", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    await api.commitDisplayName("T-03-46");
    await advance(harness, clock, plagueDoctorBindingTimings.nameEffectMs);
    assertEquals(api.plagueDoctorApostles(), ["白夜"]);
    assertStrictEquals(api.getSpecialEvent(), undefined);
    assertStrictEquals(api.getDangerScore(), 0);
  } finally {
    harness.restore();
  }
});

Deno.test("疫医：记录期间别碰我不接管显示名称保存", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    assertStrictEquals(api.blocksDisplayNameSave("O-05-47"), true);
    await api.commitDisplayName("O-01-45");
    assertStrictEquals(api.blocksDisplayNameSave("O-05-47"), false);
  } finally {
    harness.restore();
  }
});

Deno.test("疫医：第 12 名使徒后走完整降临并进入白夜", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    for (let index = 1; index <= plagueDoctorApostleCount; index++) {
      await api.commitDisplayName(`apostle-${index}`);
      await advance(harness, clock, plagueDoctorBindingTimings.nameEffectMs);
    }
    assertEquals(api.plagueDoctorApostles().length, plagueDoctorApostleCount);
    // 转变演出开始前不应提前结算。
    assertStrictEquals(api.getDangerScore(), 0);
    const adventTotalMs = plagueDoctorApostleCount *
      (plagueDoctorAdventTimings.cameraMoveMs +
        plagueDoctorAdventTimings.adventAnimMs);
    await advance(harness, clock, adventTotalMs);
    assertStrictEquals(api.getDangerScore(), plagueDoctorTransformationDanger);
    assertStrictEquals(api.getSpecialEvent(), "white-night");
    const adventBgm = harness.AudioMock.items.find((audio) =>
      audio.src.includes(plagueDoctorSoundPaths.advent)
    );
    assert(adventBgm, "完整降临应播放 Lucifer_Advent1");
    // 白夜登场时过场 BGM 必须收掉（对应 OnEndAdventEffect 的 ClearUniqueBgm）。
    assert(
      adventBgm!.pauseCount > 0,
      "白夜出现前应停止疫医过场 BGM",
    );
    assert(
      harness.AudioMock.items.some((audio) =>
        audio.src.includes(plagueDoctorSoundPaths.tick)
      ),
      "绑定使徒应播放 Lucifer_Tick1",
    );
  } finally {
    harness.restore();
  }
});

Deno.test("疫医：已经转变过的会话再次提交 O-01-45 直接进入白夜", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from({ length: plagueDoctorApostleCount }, () => "x"),
        recording: true,
        transformed: true,
      }),
    );
    await harness.reload();
    const api = harness.api();
    await api.commitDisplayName("O-01-45");
    assertStrictEquals(api.getDangerScore(), plagueDoctorTransformationDanger);
    assertStrictEquals(api.getSpecialEvent(), "white-night");
  } finally {
    harness.restore();
  }
});

Deno.test("疫医：同一登录会话内刷新保留使徒，重新登录后清空", async () => {
  const harness = installLobotomyCorpAlertHarness({ loginSession: "session-a" });
  try {
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    await api.commitDisplayName("使徒甲");
    await advance(harness, clock, plagueDoctorBindingTimings.nameEffectMs);
    assertEquals(api.plagueDoctorApostles(), ["使徒甲"]);

    // 同一登录会话内刷新：使徒记录保留。
    await harness.reload();
    assertEquals(harness.api().plagueDoctorApostles(), ["使徒甲"]);
    assertStrictEquals(harness.api().plagueDoctorRecording(), true);

    // 重新登录：会话标识变化，已绑定的使徒必须清空。
    harness.setLoginSession("session-b");
    await harness.reload();
    assertEquals(harness.api().plagueDoctorApostles(), []);
    assertStrictEquals(harness.api().plagueDoctorRecording(), false);
  } finally {
    harness.restore();
  }
});

Deno.test("疫医：重新登录后连已转变标记也一并清空", async () => {
  const harness = installLobotomyCorpAlertHarness({ loginSession: "session-a" });
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from({ length: plagueDoctorApostleCount }, () => "x"),
        loginSession: "session-a",
        recording: true,
        transformed: true,
      }),
    );
    await harness.reload();
    assertEquals(
      harness.api().plagueDoctorApostles().length,
      plagueDoctorApostleCount,
    );

    harness.setLoginSession("session-b");
    await harness.reload();
    const api = harness.api();
    assertEquals(api.plagueDoctorApostles(), []);
    // 重新登录后再次提交 O-01-45 只是重新开始记录，不再立刻进入白夜。
    await api.commitDisplayName("O-01-45");
    assertStrictEquals(api.plagueDoctorRecording(), true);
    assertStrictEquals(api.getSpecialEvent(), undefined);
    assertStrictEquals(api.getDangerScore(), 0);
  } finally {
    harness.restore();
  }
});

Deno.test("疫医：白夜进行期间再次提交 O-01-45 不重复结算", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from({ length: plagueDoctorApostleCount }, () => "x"),
        recording: true,
        transformed: true,
      }),
    );
    await harness.reload();
    const api = harness.api();
    await api.commitDisplayName("O-01-45");
    assertStrictEquals(api.getDangerScore(), plagueDoctorTransformationDanger);
    await api.commitDisplayName("O-01-45");
    assertStrictEquals(api.getDangerScore(), plagueDoctorTransformationDanger);
  } finally {
    harness.restore();
  }
});
