/** @file 疫医转变事件的使徒记录、绑定演出与白夜接管回归测试。 */
import {
  assert,
  assertEquals,
  assertStrictEquals,
  stripJavaScriptCommentsAndStrings,
} from "./test_helpers.ts";
import { installLobotomyCorpAlertHarness } from "./test_harness.ts";
import {
  apostleAdventLightClip,
} from "../static/fun/lobotomy-corp/Events/AdventLight.js";
import {
  plagueDoctorAdventEntityVideo,
  plagueDoctorAdventFocusClassName,
  plagueDoctorAdventFocusTimings,
  plagueDoctorAdventSchedule,
  plagueDoctorAdventTimings,
  plagueDoctorAdventWorldClassName,
  plagueDoctorApostleCount,
  plagueDoctorBetrayerIndex,
  plagueDoctorBindingTimings,
  plagueDoctorBlackShaderLayout,
  plagueDoctorBlackShaderSize,
  plagueDoctorCenterImageOpacity,
  plagueDoctorClockCenterContent,
  plagueDoctorClockReferenceSize,
  plagueDoctorCssArrowAngle,
  plagueDoctorDescTopForViewport,
  plagueDoctorRingHole,
  plagueDoctorSoundPaths,
  plagueDoctorStageGeometry,
  plagueDoctorStorageKey,
  plagueDoctorTransformationDanger,
} from "../static/fun/lobotomy-corp/Events/PlagueDoctor.js";
import {
  whiteNightSimpleAdventClockCenterSprite,
  whiteNightSimpleAdventColor,
} from "../static/fun/lobotomy-corp/Events/WhiteNightAdvent.js";

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
  const frameFit = Math.min(
    819 / plagueDoctorRingHole.textureWidth,
    819 /
      plagueDoctorRingHole.textureHeight,
  );
  assertClose(
    geometry.circle.width,
    plagueDoctorRingHole.width * frameFit,
    0.01,
  );
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
    css.includes("position: absolute;\n  top: 50%;") ||
      /\.lobotomy-corp-plague-doctor-advent-shader\{[\s\S]*?top: 50%;/u.test(
        css,
      ),
    "shader 图层应铺满 viewport",
  );
  // 盘心贴图要比背景更透明：整体再乘一层不透明度，并接到 CSS 变量上。
  assert(
    plagueDoctorCenterImageOpacity > 0 &&
      plagueDoctorCenterImageOpacity <= 0.5,
    "盘心贴图整体不透明度应不高于一半",
  );
  assert(
    css.includes("var(--lobotomy-corp-advent-center-opacity)"),
    "盘心贴图应使用整体不透明度变量",
  );
});

/**
 * 黑幕（DeathAngelClockDark，中间一圈正圆空洞）的尺寸必须由圆盘尺寸算出。
 *
 * 尺寸跟着 viewport 走会两头出错：非等比拉伸（fill + 100%）把空洞压成竖椭圆
 * （700×900 实测 1.82:1）；等比放大铺满（cover）又把空洞放得比圆盘大，
 * 页面浅色底就从圆盘外围漏出来。改成「黑幕 = 圆盘宽 × prefab 比值」后，
 * 空洞与圆盘的比例在任意窗口下恒定；画布之外那圈用黑幕贴图自身边缘色补上。
 */
Deno.test("疫医：黑幕尺寸由圆盘算出，空洞与圆盘比例恒定", () => {
  // 注释里会提到被禁止的写法，断言前先去注释。
  const css = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/lobotomy-corp.css",
      import.meta.url,
    ),
  ).replace(/\/\*[\s\S]*?\*\//gu, "");
  const rule =
    /\.lobotomy-corp-plague-doctor-advent-black-shader\{[\s\S]*?\n\}/u
      .exec(css)?.[0] ?? "";
  assert(rule.length > 0, "应有 BlackShader 样式");
  assert(
    !rule.includes("width: 2112px") && !rule.includes("height: 1188px"),
    "黑幕尺寸应由脚本按圆盘算出，不在样式里写死",
  );
  assert(
    !rule.includes("width: 100%") && !rule.includes("height: 100%"),
    "黑幕尺寸不得跟着 viewport 走",
  );
  assert(
    !rule.includes("background-size: 100%") &&
      !rule.includes("background-size: cover"),
    "贴图尺寸要按圆盘给（脚本写 background-size），不能跟着 viewport 走",
  );
  // 贴图按 prefab 尺寸居中画。
  assert(
    rule.includes("background-position: center") &&
      rule.includes("background-repeat: no-repeat"),
    "黑幕应把贴图居中绘制",
  );
  // 不能用 border 补边：贴图盒子边缘的抗锯齿会与 border 接缝处外面的东西混合，
  // 宿主底面取页面底色后就是一条能看见的浅色横线。
  assertEquals(
    /border/u.test(rule),
    false,
    "黑幕不得用 border 补边（会在接缝处露出浅色缝）",
  );
  // 画布之外那圈改用独立延伸带，颜色取贴图自身边缘色 rgb(8,1,0)（实测值），
  // 它与贴图重叠、外边界留在视口之外，抗锯齿两边都落在同色里。
  const bandRule =
    /\.lobotomy-corp-plague-doctor-advent-black-shader-band\{[\s\S]*?\n\}/u
      .exec(css)?.[0] ?? "";
  assert(bandRule.length > 0, "应有黑幕延伸带样式");
  assert(
    bandRule.includes("background-color: rgb(8 1 0)"),
    "延伸带应使用黑幕贴图自身的边缘色",
  );
  assertEquals(/border|gradient|box-shadow/u.test(bandRule), false);
  assert(
    rule.includes("top: calc(50% - 30px)"),
    "黑幕中心应沿用 prefab 的相对画布中心上移 30",
  );
  assert(
    !css.includes("black-backdrop") &&
      !Deno.readTextFileSync(
        new URL(
          "../static/fun/lobotomy-corp/Events/PlagueDoctor.js",
          import.meta.url,
        ),
      ).includes("blackBackdrop"),
    "不得为了补边另造图层，应只用原始黑幕等比覆盖",
  );
});

Deno.test("疫医：黑幕渲染尺寸由圆盘尺寸推出", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from({ length: plagueDoctorApostleCount }, () => "x"),
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    await advance(harness, clock, 16);

    const blackShader = harness.createdElements().find((element) =>
      !element.removed &&
      element.className === "lobotomy-corp-plague-doctor-advent-black-shader"
    );
    assert(blackShader, "完整降临应挂载黑幕");
    const dialWidth = plagueDoctorStageGeometry.clock.width;
    const expectedWidth = plagueDoctorBlackShaderSize.width * dialWidth /
      plagueDoctorClockReferenceSize;
    const expectedHeight = plagueDoctorBlackShaderSize.height * dialWidth /
      plagueDoctorClockReferenceSize;
    // 贴图尺寸只跟圆盘走：空洞与圆盘的比例就是 prefab 的 2112×1188 : 819，跟窗口无关。
    assertEquals(
      blackShader!.styleProperties.get("background-size"),
      `${expectedWidth}px ${expectedHeight}px`,
    );
    assertClose(expectedWidth / dialWidth, 2112 / 819, 1e-9);
    assertClose(expectedHeight / dialWidth, 1188 / 819, 1e-9);
    assertEquals(
      blackShader!.styleProperties.get("width"),
      `${expectedWidth}px`,
    );
    assertEquals(
      blackShader!.styleProperties.get("height"),
      `${expectedHeight}px`,
    );
    // 画布之外那圈由四条延伸带补上（测试宿主 1920×1080、画布缩放 1，上下各一条）。
    const bands = harness.createdElements().filter((element) =>
      !element.removed &&
      element.className ===
        "lobotomy-corp-plague-doctor-advent-black-shader-band"
    );
    assertEquals(bands.length, 4);
    const layout = plagueDoctorBlackShaderLayout({
      canvasScale: 1,
      dialWidth,
      viewportHeight: 1080,
      viewportWidth: 1920,
    });
    bands.forEach((element, index) => {
      const box = layout.bands[index];
      const visible = box.width > 0 && box.height > 0;
      assertEquals(
        element.styleProperties.get("display"),
        visible ? "block" : "none",
      );
      if (!visible) return;
      assertEquals(
        element.styleProperties.get("width"),
        `${box.width}px`,
      );
      assertEquals(
        element.styleProperties.get("height"),
        `${box.height}px`,
      );
    });
  } finally {
    harness.restore();
  }
});

/**
 * 黑幕在画布之外的延伸带必须盖住整个 viewport，且与贴图重叠。
 *
 * 贴图边缘那一行会被抗锯齿，混的就是接缝外面的东西；延伸带一旦没有盖到视口外，
 * 或者没有和贴图重叠，宿主底面取页面底色后那里就会留下一条浅色横线
 * （700×900 实测 y=222 那行是 58,47,48，上下都是 11,3,3）。
 */
Deno.test("疫医：黑幕延伸带覆盖整个 viewport，并与贴图重叠", () => {
  const dialWidth = plagueDoctorStageGeometry.clock.width;
  const textureScale = dialWidth / plagueDoctorClockReferenceSize;
  const textureWidth = plagueDoctorBlackShaderSize.width * textureScale;
  const textureHeight = plagueDoctorBlackShaderSize.height * textureScale;
  for (
    const viewport of [
      { height: 1080, width: 2560 },
      { height: 1080, width: 1920 },
      { height: 1200, width: 1600 },
      { height: 900, width: 1440 },
      { height: 720, width: 1280 },
      { height: 768, width: 1024 },
      { height: 1200, width: 900 },
      { height: 900, width: 700 },
      { height: 800, width: 480 },
    ]
  ) {
    const scale = Math.min(viewport.width / 1920, viewport.height / 1080);
    const label = `${viewport.width}×${viewport.height}`;
    const layout = plagueDoctorBlackShaderLayout({
      canvasScale: scale,
      dialWidth,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });
    const [top, bottom, left, right] = layout.bands;
    const viewportWidth = viewport.width / scale;
    const viewportHeight = viewport.height / scale;
    // 每一条都必须顶到视口之外。
    assert(top.top <= 0 && top.width >= viewportWidth, `${label} 上边界没盖住`);
    assert(
      bottom.top + bottom.height >= viewportHeight &&
        bottom.width >= viewportWidth,
      `${label} 下边界没盖住`,
    );
    assert(left.left <= 0 && left.height > 0, `${label} 左边界没盖住`);
    assert(
      right.left + right.width >= viewportWidth && right.height > 0,
      `${label} 右边界没盖住`,
    );
    // 与贴图重叠：贴图边缘的抗锯齿要落在同色带里。
    const textureTop = viewportHeight / 2 - 30 - textureHeight / 2;
    const textureBottom = textureTop + textureHeight;
    const textureLeft = viewportWidth / 2 - textureWidth / 2;
    const textureRight = textureLeft + textureWidth;
    assert(top.top + top.height > textureTop, `${label} 上边界没和贴图重叠`);
    assert(bottom.top < textureBottom, `${label} 下边界没和贴图重叠`);
    assert(left.left + left.width > textureLeft, `${label} 左边界没和贴图重叠`);
    assert(right.left < textureRight, `${label} 右边界没和贴图重叠`);
  }
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

/**
 * 取出当前仍挂载在页面上的 AdventLight 根节点。
 *
 * @param harness 彩蛋测试环境。
 * @return 最近创建且未被移除的 AdventLight 节点。
 */
function findAdventLight(
  harness: ReturnType<typeof installLobotomyCorpAlertHarness>,
) {
  return harness.createdElements().filter((element) =>
    !element.removed && element.className === "lobotomy-corp-advent-light"
  ).at(-1);
}

/** 取测试 DOM 里第一个匹配类名的节点（含 createdElements 与 body 子树）。 */
function findByClassName(
  harness: ReturnType<typeof installLobotomyCorpAlertHarness>,
  className: string,
) {
  return harness.createdElements().find((element) =>
    element.className === className
  );
}

/**
 * 完整降临必须有独立的网页宿主隔离层（world surface）。
 *
 * 原作 AdventClockUI 是半透明 UI，游戏里它后面是游戏世界；网页没有游戏世界，
 * 所以要先铺一层不透明的 viewport-space 黑底，把普通网站隔离在下面。
 */
Deno.test("疫医：完整降临挂载独立 world 层，且在原作 UI 之下", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from({ length: plagueDoctorApostleCount }, () => "x"),
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    await advance(harness, clock, 16);

    const world = findByClassName(harness, plagueDoctorAdventWorldClassName);
    assert(world, "完整降临应挂载 world 层");
    const root = world!.parentElement;
    assertEquals(root?.className, "lobotomy-corp-plague-doctor-advent");
    // world 是 root 的第一个子节点 → 在原作 UI（1920×1080 canvas）之下。
    assertEquals(root!.children[0], world);
    const canvas = root!.children[1];
    assertEquals(canvas.className, "lobotomy-corp-plague-doctor-advent-canvas");
    // world 不在被 CanvasScaler 缩放的画布内部。
    assert(
      canvas !== world!.parentElement,
      "world 不能放进 1920×1080 画布",
    );
    assertEquals(canvas.children.includes(world!), false);
  } finally {
    harness.restore();
  }
});

/**
 * 黑幕延伸带必须跟着黑幕的开关走。
 *
 * 绑定阶段黑幕是关的（`SetEffect(false)`），延伸带也属于黑幕——不一起收起的话，
 * 窄屏下画布之外的上下两边会被填成深色（实测就是这样）。
 */
Deno.test("疫医：绑定阶段黑幕延伸带收起", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    for (let index = 1; index <= 2; index++) {
      await api.commitDisplayName(`apostle-${index}`);
      await advance(harness, clock, plagueDoctorBindingTimings.nameEffectMs);
    }
    /** @return {import("./test_harness.ts").Element[]} 当前仍挂载的延伸带 */
    const liveBands = () =>
      harness.createdElements().filter((element) =>
        !element.removed &&
        element.className ===
          "lobotomy-corp-plague-doctor-advent-black-shader-band"
      );
    const bindingBands = liveBands();
    assert(bindingBands.length > 0, "绑定阶段也应挂延伸带（只是收起）");
    for (const band of bindingBands) {
      assertEquals(
        band.styleProperties.get("--lobotomy-corp-advent-layer-alpha"),
        "0",
        "绑定阶段延伸带必须收起",
      );
    }
  } finally {
    harness.restore();
  }
});

/** 绑定阶段的表盘不需要宿主隔离层（只有完整降临需要）。 */
Deno.test("疫医：绑定阶段不创建 world 层", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    await api.commitDisplayName("使徒甲");
    await advance(harness, clock, 200);
    assertEquals(
      harness.createdElements().some((element) =>
        element.className === plagueDoctorAdventWorldClassName
      ),
      false,
      "绑定阶段不应有 world 层",
    );
  } finally {
    harness.restore();
  }
});

/**
 * world 层是 viewport-space 的不透明底层：不跟 CanvasScaler 缩放、不继承 root alpha、
 * 没有淡入淡出，也不靠 border/gradient/box-shadow/1px 线条去遮白线。
 *
 * 底色必须是**宿主页面底色**而不是纯黑：原作 DeathAngelClockDark 是带正圆开口的深色幕布，
 * 开口处按设计要露出后面的世界；铺纯黑会把盘心那块开口一起糊成黑圆。
 */
Deno.test("疫医：world 层是 viewport-space 固定底面，且不含遮挡补丁", () => {
  const css = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/lobotomy-corp.css",
      import.meta.url,
    ),
  );
  const rule =
    /\.lobotomy-corp-plague-doctor-advent-world\{[\s\S]*?\n\}/u.exec(css)
      ?.[0] ??
      "";
  assert(rule.length > 0, "应有 world 层样式");
  // 不透明：网站内容一律透不出来。
  assertEquals(/background:\s*transparent/u.test(rule), false);
  // 取宿主页面底色，跟随明暗主题；不能用纯黑，否则盘心开口会变成黑圆。
  assert(
    rule.includes("background: var(--bg"),
    "world 层应取宿主页面底色",
  );
  assertEquals(
    /background:\s*(#000|#000000|black|rgb\(0 0 0\))/u.test(rule),
    false,
    "world 层不能用纯黑（会把盘心开口糊死）",
  );
  assert(rule.includes("position: fixed"), "world 层应为 fixed");
  assert(rule.includes("inset: 0"), "world 层应铺满 viewport");
  assert(rule.includes("pointer-events: none"), "world 层不应接收指针事件");
  // 不继承 root alpha、不跟随画布缩放、没有自己的过渡动画。
  assertEquals(rule.includes("--lobotomy-corp-advent-root-alpha"), false);
  assertEquals(rule.includes("transform"), false);
  assertEquals(rule.includes("transition"), false);
  assertEquals(rule.includes("animation"), false);
  // 不用 border / gradient / box-shadow / 1px 线条遮白线。
  assertEquals(rule.includes("border"), false);
  assertEquals(/gradient|box-shadow|1px/u.test(rule), false);
  // 网页宿主专用的命名，不能混进原作素材名。
  assertEquals(
    plagueDoctorAdventWorldClassName,
    "lobotomy-corp-plague-doctor-advent-world",
  );
});

/** world 层只隔离宿主，原作 Shader 链必须原样保留。 */
Deno.test("疫医：world 层不影响原作 Shader 链", async () => {
  const source = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Events/PlagueDoctor.js",
      import.meta.url,
    ),
  );
  for (
    const sprite of [
      "GlobalShader.png",
      "DeathAngelClockDark.png",
      "ClockShader.png",
      "LowerShader.png",
    ]
  ) {
    assert(source.includes(sprite), `仍应引用原作 ${sprite}`);
  }
  assert(
    source.includes("shader.append(blackShader, clockShader, lowerShader)"),
    "Shader 子层结构应保持原作顺序",
  );
  // 去注释后再查禁用写法，避免注释里提到这些名字造成误判。
  const code = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(
    /^[ \t]*\/\/.*$/gmu,
    "",
  );
  assertEquals(
    /linear-gradient|radial-gradient|box-shadow|scrollbar-width|::-webkit-scrollbar/u
      .test(code),
    false,
    "不得为遮挡白线引入渐变/阴影或隐藏滚动条",
  );

  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from({ length: plagueDoctorApostleCount }, () => "x"),
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    await advance(harness, clock, 16);

    const shader = findByClassName(
      harness,
      "lobotomy-corp-plague-doctor-advent-shader",
    );
    assert(shader, "完整降临应有 Shader 节点");
    assert(
      (shader!.styleProperties.get("background-image") ?? "")
        .includes("GlobalShader.png"),
      "Shader 节点自身仍应是 GlobalShader",
    );
    // 黑幕、ClockShader、LowerShader 的先后顺序不变；画布外的黑幕延伸带排在黑幕之下。
    assertEquals(
      shader!.children.map((child) => child.className),
      [
        "lobotomy-corp-plague-doctor-advent-black-shader-band",
        "lobotomy-corp-plague-doctor-advent-black-shader-band",
        "lobotomy-corp-plague-doctor-advent-black-shader-band",
        "lobotomy-corp-plague-doctor-advent-black-shader-band",
        "lobotomy-corp-plague-doctor-advent-black-shader",
        "lobotomy-corp-plague-doctor-advent-clock-shader",
        "lobotomy-corp-plague-doctor-advent-lower-shader",
      ],
    );
  } finally {
    harness.restore();
  }
});

/**
 * 疫医转变开场：圆盘聚焦的是收容单元里那具疫医实体（不是白夜本体）。
 *
 * 原作调用链：`PlagueDoctor.OnClockUIEnd()` 先把镜头移向 `PlagueDoctorAnim._eye1`
 * （`CameraMoveEvent(_eye1.position - (0.2, 0.9), 4f, 1f)`），镜头到位后回调
 * `PlagueDoctorAnim.OnStartAdvent()` 起 3 秒计时，`Rate >= 0.2 / 0.6` 时依次打开
 * `_eye1` / `_eye2`（睁眼），计时结束才由 `OnPlagueDoctorAdventEnd()` 关掉疫医、
 * 让白夜单位登场。
 *
 * 网页用的视频自带头 1 秒镜头移动，因此整段「聚焦疫医 → 白夜登场」就是演出最前面的
 * `cameraMoveMs + plagueDoctorAdventMs + cameraMoveMs`（最后 1 秒是白夜换场，
 * 镜头同时开始移向第一名使徒），之后必须撤掉。
 */
Deno.test("疫医：开场聚焦疫医实体的视频挂在世界层并按时收尾", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from({ length: plagueDoctorApostleCount }, () => "x"),
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    await advance(harness, clock, 16);

    const entity = findByClassName(
      harness,
      "lobotomy-corp-plague-doctor-advent-world-entity",
    );
    assert(entity, "完整降临应挂载疫医实体视频");
    assertStrictEquals(
      entity!.src,
      `/static/fun/lobotomy-corp/Assets/Resources/sprites/creaturesprite/deathangel/${plagueDoctorAdventEntityVideo}`,
    );
    // 视频属于世界层：必须排在同级的 Shader 图层之前（也就是整块原作 UI 之下）。
    const addApostle = findByClassName(
      harness,
      "lobotomy-corp-plague-doctor-advent-add-apostle",
    );
    assert(addApostle, "完整降临应有 AddApostle 节点");
    const order = addApostle!.children.map((child) => child.className);
    assert(
      order.indexOf("lobotomy-corp-plague-doctor-advent-world-entity") <
        order.indexOf("lobotomy-corp-plague-doctor-advent-shader"),
      `疫医实体必须画在 Shader 之下，实际顺序 ${order.join(" / ")}`,
    );

    // 演出第 1 帧：镜头开始移向疫医，实体视频同步开播。
    assertStrictEquals(entity!.hidden, false);

    // 睁眼结束后的那一秒是白夜换场（`OnPlagueDoctorAdventEnd()`），视频里已经包含，
    // 换场这一秒走完才撤掉。
    const entityVisibleFor = plagueDoctorAdventTimings.cameraMoveMs +
      plagueDoctorAdventTimings.plagueDoctorAdventMs +
      plagueDoctorAdventTimings.cameraMoveMs;
    // 3 秒睁眼演出还在进行中（距离结束还有 200ms）：实体必须仍然可见。
    await advance(harness, clock, entityVisibleFor - 216);
    assertStrictEquals(
      entity!.hidden,
      false,
      "白夜换场那一秒结束前实体都应可见",
    );
    await advance(harness, clock, 400);
    assertStrictEquals(
      entity!.hidden,
      true,
      "睁眼结束后应撤掉疫医实体视频",
    );
  } finally {
    harness.restore();
  }
});

/**
 * 镜头交接：疫医变白夜只有一瞬间，镜头随即移到「显示名称输入框」。
 *
 * 原作里 `OnPlagueDoctorAdventEnd()` 一边关疫医一边开白夜，紧接着
 * `ExecuteNextAdventTarget()` 就把镜头移向本次转变的员工（`_advent_cameraMove`）。
 * 网页没有员工，于是聚焦网页自己的显示名称输入框，并在每名使徒的钟声那一刻把它
 * 里面的文字换成这名使徒的名字（那次保存的是异想体时改用编号），并做一次淡入淡出。
 */
Deno.test("疫医：镜头交接到显示名称输入框并按使徒轮换文本", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    // 前 11 名是普通名字，第 12 名提交异想体编号（记录里会存它的本地化名）。
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: [
          "甲",
          "乙",
          "丙",
          "丁",
          "戊",
          "己",
          "庚",
          "辛",
          "壬",
          "癸",
          "子",
        ],
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    // 第 12 名绑定的仍然是本地化名。
    assertEquals(api.plagueDoctorApostles().at(-1), "疫医");
    // 先走完整 12 名的绑定演出（Name Effect），之后才进入完整降临。
    await advance(harness, clock, plagueDoctorBindingTimings.nameEffectMs);
    await advance(harness, clock, 16);

    const focus = findByClassName(harness, plagueDoctorAdventFocusClassName);
    assert(focus, "完整降临应挂载聚焦视图");
    const focusInput = focus!.children[0];
    assert(focusInput, "聚焦视图里应有输入框");
    // 聚焦视图放在宿主隔离层里：它是网页界面，必须画在表盘 UI 之下。
    const world = findByClassName(harness, plagueDoctorAdventWorldClassName);
    assert(world, "完整降临应有宿主隔离层");
    assertStrictEquals(
      world!.children.some((child) =>
        child.className === plagueDoctorAdventFocusClassName
      ),
      true,
      "聚焦视图应挂在宿主隔离层里",
    );
    assertStrictEquals(
      focus!.styleProperties.get("--lobotomy-corp-advent-focus-alpha"),
      "0",
    );

    const schedule = plagueDoctorAdventSchedule(plagueDoctorApostleCount);
    const focusAt = (index: number) =>
      schedule.steps.find((step) =>
        step.kind === "cameraFocus" && step.index === index
      )!.at;
    const entity = findByClassName(
      harness,
      "lobotomy-corp-plague-doctor-advent-world-entity",
    );
    const focusAlpha = () =>
      Number(focus!.styleProperties.get("--lobotomy-corp-advent-focus-alpha"));
    const textAlpha = () =>
      Number(
        focusInput!.styleProperties.get(
          "--lobotomy-corp-advent-focus-text-alpha",
        ),
      );

    const shift = (element: { styleProperties: Map<string, string> }) =>
      Number(
        /translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/u.exec(
          element.styleProperties.get("transform") ?? "",
        )?.[1],
      );
    // 白夜登场（= 镜头交界的起点）：白夜还在画面里，输入框还在画面外等着移进来。
    await advance(harness, clock, focusAt(0));
    assert(shift(entity!) <= 0, `白夜还没开始移动，实际 ${shift(entity!)}`);
    assert(
      shift(focus!) > 0,
      `镜头移动前输入框应在画面外，实际 ${shift(focus!)}`,
    );
    assertStrictEquals(entity!.hidden, false);

    // 镜头移动过半：白夜本体向左平移出画面、输入框从右侧移进来（不是淡出）。
    await advance(harness, clock, plagueDoctorAdventFocusTimings.handoffMs / 2);
    assertStrictEquals(focusAlpha(), 1);
    // 两者朝相反方向同步移动：白夜移出多少，输入框就移进多少，方向由输入框
    // 在页面里的真实位置决定（不写死左右）。
    assert(
      shift(focus!) !== 0 &&
        Math.sign(shift(focus!)) === -Math.sign(shift(entity!)),
      `白夜与输入框应反向移动，实际 ${shift(focus!)} / ${shift(entity!)}`,
    );

    // 镜头到位（第一名使徒）：实体撤掉，输入框里是第一名使徒的名字。
    await advance(harness, clock, plagueDoctorAdventFocusTimings.handoffMs / 2);
    assertStrictEquals(focusAlpha(), 1);
    assertStrictEquals(entity!.hidden, true);
    assertStrictEquals(focusInput!.value, "甲");
    assertClose(textAlpha(), 1, 0.01);

    // 轮到第二名：钟声那一刻先淡出旧名字，再换成新名字淡入。
    await advance(harness, clock, focusAt(1) - focusAt(0));
    assertStrictEquals(focusInput!.value, "甲");
    await advance(
      harness,
      clock,
      plagueDoctorAdventFocusTimings.textFadeOutMs + 32,
    );
    assertStrictEquals(focusInput!.value, "乙");
    assert(textAlpha() < 0.2, "换名字时文本应当还在淡入");
    await advance(
      harness,
      clock,
      plagueDoctorAdventFocusTimings.textFadeInMs,
    );
    assertClose(textAlpha(), 1, 0.01);

    // 第 12 名是异想体，输入框里显示它的编号而不是本地化名。
    await advance(harness, clock, focusAt(11) - focusAt(1));
    await advance(
      harness,
      clock,
      plagueDoctorAdventFocusTimings.textFadeOutMs + 32,
    );
    assertStrictEquals(focusInput!.value, "O-01-45");
  } finally {
    harness.restore();
  }
});

/**
 * 完整降临期间锁住宿主滚动，结束后精确恢复原 inline 值。
 *
 * 全局 `:root { overflow-y: scroll }` 说明 `<html>` 才是滚动容器，因此主要锁它，
 * `body` 一并锁；恢复时写回锁之前的 exact 值，而不是一律置空。
 */
Deno.test("疫医：完整降临锁住网页滚动并在结束后精确恢复", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from({ length: plagueDoctorApostleCount }, () => "x"),
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    // 模拟页面本来就有 inline overflow 与滚动位置。
    harness.documentElement.style.overflow = "auto";
    harness.body.style.overflow = "visible";
    harness.setScrollPosition(0, 420);

    await api.commitDisplayName("O-01-45");
    await advance(harness, clock, 16);
    // 演出期间：真锁滚动（不是视觉隐藏滚动条）。
    assertStrictEquals(harness.documentElement.style.overflow, "hidden");
    assertStrictEquals(harness.body.style.overflow, "hidden");
    assertStrictEquals(harness.scrollState().y, 420);
    assertEquals(harness.scrollState().calls, []);

    // 正常结束后：精确恢复原值，滚动位置不动。
    const schedule = plagueDoctorAdventSchedule(plagueDoctorApostleCount);
    await advance(harness, clock, schedule.totalMs);
    assertStrictEquals(harness.documentElement.style.overflow, "auto");
    assertStrictEquals(harness.body.style.overflow, "visible");
    assertStrictEquals(harness.scrollState().y, 420);
    assertEquals(harness.scrollState().calls, []);
    // world 层随 root 一起清理，DOM 里不留残余。
    assertEquals(
      harness.body.querySelectorAll(
        `.${plagueDoctorAdventWorldClassName}`,
      ).length,
      0,
    );
  } finally {
    harness.restore();
  }
});

/** 中途 abort / reset 也要恢复滚动，并清掉 world 层。 */
Deno.test("疫医：完整降临中途 reset 后恢复滚动并清理 world 层", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from({ length: plagueDoctorApostleCount }, () => "x"),
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    harness.documentElement.style.overflow = "scroll";
    harness.setScrollPosition(0, 260);

    await api.commitDisplayName("O-01-45");
    await advance(harness, clock, 6000);
    assertStrictEquals(harness.documentElement.style.overflow, "hidden");

    // “重新开始这一天”会走 plagueDoctorEvent.reset()，属于中止路径。
    await api.restartDay();
    await flushMicrotasks();
    assertStrictEquals(harness.documentElement.style.overflow, "scroll");
    assertStrictEquals(harness.body.style.overflow, "");
    assertStrictEquals(harness.scrollState().y, 260);
    assertEquals(harness.scrollState().calls, []);
    assertEquals(
      harness.body.querySelectorAll(
        `.${plagueDoctorAdventWorldClassName}`,
      ).length,
      0,
    );
  } finally {
    harness.restore();
  }
});

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
    // 完整降临包含疫医自身演出与逐名使徒的镜头 + 4 秒降临，共 64 秒。
    const schedule = plagueDoctorAdventSchedule(plagueDoctorApostleCount);
    assertEquals(
      schedule.totalMs,
      plagueDoctorAdventTimings.cameraMoveMs +
        plagueDoctorAdventTimings.plagueDoctorAdventMs +
        plagueDoctorApostleCount *
          (plagueDoctorAdventTimings.cameraMoveMs +
            plagueDoctorAdventTimings.adventAnimMs),
    );
    await advance(harness, clock, schedule.totalMs);
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

/**
 * 完整降临的音频调用链必须和原件一致。
 *
 * - `PlagueDoctor.OnClockUIEnd()`：镜头开始移向疫医的同一刻敲一次钟（`Lucifer_Bell0`）。
 * - 每名使徒 `ExecuteNextAdventTarget()` 先敲钟，随后 `DeathAngelApostle.Escape()` 里的
 *   `MakeAdventSound()` 再放一首合唱（`Choir1`）与一句随机低语
 *   （`Lucifer_Apostle_Whisper0~2`），三者是同一刻。
 * - 第 12 名是叛徒，原作在 `Escape()` 之前就因 `AposlteModel == null` 返回，
 *   所以它只有钟声。绑定阶段另计：每人一次 `Lucifer_Tick1` 与一次钟声。
 */
Deno.test("疫医：完整降临的音频调用链与原件一致", async () => {
  const harness = installLobotomyCorpAlertHarness();
  const originalRandom = Math.random;
  try {
    // 原作是 Random.Range(0, 3)，固定成 0 以便断言选中 Whisper0。
    Math.random = () => 0;
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    for (let index = 1; index <= plagueDoctorApostleCount; index++) {
      await api.commitDisplayName(`apostle-${index}`);
      await advance(harness, clock, plagueDoctorBindingTimings.nameEffectMs);
    }
    await advance(
      harness,
      clock,
      plagueDoctorAdventSchedule(plagueDoctorApostleCount).totalMs,
    );
    /** @param {string} path 音频路径 @return {string} 文件名 */
    const soundName = (path: string) => path.split("/").at(-1) ?? "";
    const bell = soundName(plagueDoctorSoundPaths.bell);
    const choir = soundName(plagueDoctorSoundPaths.choir);
    const whisper = soundName(plagueDoctorSoundPaths.whispers[0]);
    /** 完整降临这条链上会用到的音频文件名。 */
    const relevant = new Set([bell, choir, whisper]);
    const played = harness.AudioMock.items.map((audio) => soundName(audio.src));
    // 从过场 BGM 那一条开始看（前面的绑定阶段另有滴答与钟声）。
    const bgmIndex = played.findIndex(
      (name) => name === soundName(plagueDoctorSoundPaths.advent),
    );
    assert(bgmIndex >= 0, "完整降临应播放 Lucifer_Advent1");
    const adventSounds = played.slice(bgmIndex)
      .filter((name) => relevant.has(name));
    /** 期望序列：开场钟声 → 每名使徒「钟声、(合唱、低语)」；第 12 名是叛徒，只有钟声。 */
    const expected = [bell];
    for (let index = 0; index < plagueDoctorApostleCount; index++) {
      expected.push(bell);
      if (index !== plagueDoctorBetrayerIndex) expected.push(choir, whisper);
    }
    assertEquals(adventSounds, expected);
    // 绑定阶段每人一次滴答。
    assertEquals(
      played.filter((name) => name === soundName(plagueDoctorSoundPaths.tick))
        .length,
      plagueDoctorApostleCount,
    );
    assertEquals(
      harness.AudioMock.items.some((audio) =>
        audio.src.includes(plagueDoctorSoundPaths.advent)
      ),
      true,
      "完整降临应有专属 BGM Lucifer_Advent1",
    );
  } finally {
    Math.random = originalRandom;
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

/**
 * 中日文的使徒名字与台词要整段换系统 CJK 字体。
 *
 * 原版名字槽位是 BMDOHYEON、台词槽位是 NanumMyeongjo，都是韩文字体：实测 12 条中文台词
 * 用到的 142 个汉字里 BMDOHYEON 缺 32 个、NanumMyeongjo 一个都没有。原作一个 Legacy Text
 * 只用一支字体，所以这里也是整段切换（`data-cjk="1"`），而不是让浏览器逐字回退。
 */
/**
 * 台词槽位（ApostleDesc）要钉在可见画面底部，不能跟着画布往上飘。
 *
 * prefab 里它是「相对画布中心下移 438」的矩形，16:9 下边缘离画面底 12；网页把整块
 * 1920×1080 构图 fit 进 viewport 后，非 16:9 窗口上下会有黑边，台词若仍按画布坐标摆
 * 就会浮到画面中部（900×1200 实测离画面底 352px，700×900 是 257px）。
 */
Deno.test("疫医：台词槽位钉在画面底部，16:9 时保持 prefab 位置", async () => {
  const desc = plagueDoctorStageGeometry.desc;
  // 16:9：结果必须正好是 prefab 的 888（画面比例正确时位置完全不变）。
  assertEquals(
    plagueDoctorDescTopForViewport({ canvasScale: 1, viewportHeight: 1080 }),
    desc.top,
  );
  for (
    const viewport of [
      { height: 1080, width: 2560 },
      { height: 1080, width: 1920 },
      { height: 900, width: 1440 },
      { height: 1200, width: 900 },
      { height: 900, width: 700 },
      { height: 800, width: 480 },
    ]
  ) {
    const scale = Math.min(viewport.width / 1920, viewport.height / 1080);
    const label = `${viewport.width}×${viewport.height}`;
    const top = plagueDoctorDescTopForViewport({
      canvasScale: scale,
      viewportHeight: viewport.height,
    });
    // 画布上下居中：画面底在画布坐标里是 540 + viewportHeight / (2 × scale)。
    const bottomInCanvas = viewport.height / (2 * scale) + 540;
    assertClose(bottomInCanvas - (top + desc.height), 12, 1e-9);
    assert(top >= desc.top, `${label} 台词不该比 16:9 时更靠上`);
  }

  // 页面确实按这条规则设置 top（测试宿主 1920×1080、画布缩放 1）。
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from({ length: plagueDoctorApostleCount }, () => "x"),
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    await advance(harness, clock, 16);
    const element = findByClassName(
      harness,
      "lobotomy-corp-plague-doctor-advent-desc",
    );
    assert(element, "完整降临应有台词槽位");
    assertEquals(element!.styleProperties.get("top"), `${desc.top}px`);
  } finally {
    harness.restore();
  }
});

Deno.test("疫医：中日文名字与台词整段切换系统字体", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: ["使徒一号"],
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    await advance(harness, clock, 16);
    // 走到第一名使徒的台词（ExecuteNextAdventTarget → SetAdventDesc）。
    await advance(
      harness,
      clock,
      plagueDoctorAdventTimings.cameraMoveMs +
        plagueDoctorAdventTimings.plagueDoctorAdventMs +
        16,
    );
    const names = harness.createdElements().filter((element) =>
      element.className === "lobotomy-corp-plague-doctor-advent-name"
    );
    assert(names.length > 0, "完整降临应有名字槽位");
    const chinese = names.find((element) => element.textContent === "使徒一号");
    assert(chinese, "应能找到中文名字槽位");
    assertEquals(chinese!.dataset.cjk, "1");
    // 没有名字的槽位不该带这个标记。
    assertEquals(
      names.some((element) =>
        element.textContent === "" && element.dataset.cjk === "1"
      ),
      false,
    );
    const desc = findByClassName(
      harness,
      "lobotomy-corp-plague-doctor-advent-desc",
    );
    assert(desc, "完整降临应有台词槽位");
    assert(
      /[\u4e00-\u9fff]/u.test(desc!.textContent),
      `台词应为中文，实际：${desc!.textContent}`,
    );
    assertEquals(desc!.dataset.cjk, "1");
  } finally {
    harness.restore();
  }
});

Deno.test("疫医：完整降临逐名员工播放原始 AdventLight", async () => {
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
    const light = findAdventLight(harness);
    assert(light, "完整降临应挂载 AdventLight 视觉层");
    const particle = light!.children[0];
    // 光效必须加载 GUID c99b… 反查到的原始 Sprite，而不是自制贴图。
    assert(
      particle.styleProperties.get("--lobotomy-corp-advent-light-sprite")!
        .includes("Resources/texture/particle/Copy.png"),
      "AdventLight 必须使用原始 Copy.png",
    );
    const visible = () =>
      particle.styleProperties.get(
        "--lobotomy-corp-advent-light-visible",
      );
    const scale = () =>
      Number(
        particle.styleProperties.get("--lobotomy-corp-advent-light-scale"),
      );
    const firstFrameScale = apostleAdventLightClip.curves.scale.keys[0].value;

    // 转盘刚进入完整降临时不能提前点亮。
    assertStrictEquals(visible(), "0");
    // 疫医自身的 3 秒 Advent 演出期间仍然没有聚焦到任何员工。
    await advance(
      harness,
      clock,
      plagueDoctorAdventTimings.cameraMoveMs +
        plagueDoctorAdventTimings.plagueDoctorAdventMs,
    );
    assertStrictEquals(visible(), "0", "镜头聚焦完成前不得播放 AdventLight");
    // 第一名员工镜头到位 → StartAdventAnim → Run 从第 0 帧开始。
    await advance(harness, clock, plagueDoctorAdventTimings.cameraMoveMs);
    assertStrictEquals(visible(), "1");
    assertClose(scale(), firstFrameScale);
    // AdventLight 播完（m_StopTime 1.85 秒）后复位，不会一直留在画面上。
    await advance(harness, clock, 2000);
    assertStrictEquals(visible(), "0");
    // 第二名员工：镜头聚焦期间保持关闭……
    await advance(harness, clock, 2000);
    assertStrictEquals(visible(), "0", "下一名员工聚焦时光效必须复位");
    // ……聚焦完成后重新 Run，仍然从第 0 帧开始。
    await advance(harness, clock, plagueDoctorAdventTimings.cameraMoveMs);
    assertStrictEquals(visible(), "1");
    assertClose(scale(), firstFrameScale);
  } finally {
    harness.restore();
  }
});

/**
 * 第 12 名使徒是「叛徒」，没有 AdventLight 光效。
 *
 * 原作依据：`ApostleStaticInfo.GetApostleType(11)` 返回 `ApostleType.BETRAYER`；
 * `DeathAngel.GenApostle()` 不为它生成使徒单位（只挂 `DeathAngelBetrayerBuf`），
 * 因此 `AdventClockUI.ExecuteNextAdventTarget()` 在镜头移动后因 `AposlteModel == null`
 * 直接 return，`StartAdventAnim()` 里 `TurnOnAdventLight()` 抛出的空引用被
 * `catch (Exception)` 吞掉：这一名只有镜头、台词与名字变红。
 */
Deno.test("疫医：第 12 名（叛徒）不播放 AdventLight", async () => {
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
    const light = harness.createdElements().filter((element) =>
      !element.removed && element.className === "lobotomy-corp-advent-light"
    ).at(-1);
    assert(light, "完整降临应挂载 AdventLight 视觉层");
    const particle = light!.children[0];
    const visible = () =>
      particle.styleProperties.get("--lobotomy-corp-advent-light-visible");

    const schedule = plagueDoctorAdventSchedule(plagueDoctorApostleCount);
    const adventAnimAt = (index: number) =>
      schedule.steps.find((step) =>
        step.kind === "adventAnim" && step.index === index
      )!.at;
    // 第 11 名（index 10）聚焦完成 → Run 出光。
    await advance(harness, clock, adventAnimAt(10));
    assertStrictEquals(visible(), "1");
    // 第 12 名（index 11，叛徒）聚焦完成 → 不能出光。
    await advance(harness, clock, adventAnimAt(11) - adventAnimAt(10));
    assertStrictEquals(visible(), "0", "叛徒不应播放 AdventLight");
    // 该名仍然照常走完 4 秒降临计时（名字变红、台词淡入），只是没有光效。
    await advance(harness, clock, plagueDoctorAdventTimings.adventAnimMs);
    assertStrictEquals(visible(), "0");
    // 绑定阶段每名使徒都会建一套名字节点，这里取最后（本次降临）的那一套。
    const twelfthName = harness.createdElements().filter((element) =>
      !element.removed &&
      element.className === "lobotomy-corp-plague-doctor-advent-name" &&
      element.dataset.index === "11"
    ).at(-1);
    assert(twelfthName, "应有第 12 个名字槽位");
    const color = /rgb\(([\d.]+) ([\d.]+) ([\d.]+)\)/u.exec(
      twelfthName!.styleProperties.get(
        "--lobotomy-corp-advent-name-color",
      ) ?? "",
    );
    assert(color, "叛徒的名字仍应变成降临色");
    assertClose(Number(color![1]), whiteNightSimpleAdventColor.red * 255, 0.01);
    assertClose(
      Number(color![2]),
      whiteNightSimpleAdventColor.green * 255,
      0.01,
    );
    assertClose(
      Number(color![3]),
      whiteNightSimpleAdventColor.blue * 255,
      0.01,
    );
  } finally {
    harness.restore();
  }
});

Deno.test("疫医：第一次满 12 使徒只结算一次 98 且不走 Simple Advent", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    // 本次登录会话已经绑定满 12 名使徒，但还没有转变过。
    harness.storage.setItem(
      plagueDoctorStorageKey,
      JSON.stringify({
        apostles: Array.from({ length: plagueDoctorApostleCount }, () => "x"),
        recording: true,
        transformed: false,
      }),
    );
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    await api.commitDisplayName("O-01-45");
    // 完整降临结束前不结算。
    assertStrictEquals(api.getDangerScore(), 0);
    await advance(
      harness,
      clock,
      plagueDoctorAdventSchedule(plagueDoctorApostleCount).totalMs,
    );
    // 只结算疫医转变的固定 +98，不额外计算 WhiteNight 的 ALEPH 危急值。
    assertStrictEquals(api.getDangerScore(), plagueDoctorTransformationDanger);
    assertStrictEquals(plagueDoctorTransformationDanger, 98);
    assertStrictEquals(api.getSpecialEvent(), "white-night");
    // 首次转变走 Full Advent，不能再挂一次白夜出逃用的 Simple Advent。
    assert(
      harness.createdElements().some((element) =>
        element.className === "lobotomy-corp-plague-doctor-advent"
      ),
      "首次转变应播放疫医表盘的完整降临",
    );
    assertStrictEquals(
      harness.createdElements().some((element) =>
        element.id === "lobotomy-corp-white-night-simple-advent"
      ),
      false,
      "plague-doctor-transformation 不应播放 Simple Advent",
    );
  } finally {
    harness.restore();
  }
});

Deno.test("疫医：同一登录会话内刷新保留使徒，重新登录后清空", async () => {
  const harness = installLobotomyCorpAlertHarness({
    loginSession: "session-a",
  });
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
  const harness = installLobotomyCorpAlertHarness({
    loginSession: "session-a",
  });
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

Deno.test("疫医：转盘转动期间拦截页面点击，演出结束后放开", async () => {
  const harness = installLobotomyCorpAlertHarness();
  try {
    await harness.reload();
    const api = harness.api();
    const clock = { value: 0 };
    // 演出开始前不拦截。
    assertStrictEquals(
      harness.dispatchDocumentEvent("click").defaultPrevented,
      false,
    );
    await api.commitDisplayName("O-01-45");
    await api.commitDisplayName("使徒甲");
    // 绑定演出进行中：点击被吞掉。
    assertStrictEquals(
      harness.dispatchDocumentEvent("click").defaultPrevented,
      true,
    );
    assertStrictEquals(
      harness.dispatchDocumentEvent("pointerdown").defaultPrevented,
      true,
    );
    await advance(harness, clock, plagueDoctorBindingTimings.nameEffectMs);
    // 演出结束后恢复。
    assertStrictEquals(
      harness.dispatchDocumentEvent("click").defaultPrevented,
      false,
    );
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
