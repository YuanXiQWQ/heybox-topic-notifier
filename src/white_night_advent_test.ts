/** @file 白夜后续出逃 Simple Advent 页面原始参数回归测试。 */
import {
  assert,
  assertEquals,
  assertStrictEquals,
  findAllByClass,
  requireByClass,
} from "./test_helpers.ts";
import { Element } from "./test_harness.ts";
import {
  createWhiteNightSimpleAdvent,
  whiteNightSimpleAdventClockFitScaleForViewport,
  whiteNightSimpleAdventClockRect,
  whiteNightSimpleAdventClockViewportBounds,
  whiteNightSimpleAdventDurationMs,
  whiteNightSimpleAdventHideDurationMs,
  whiteNightSimpleAdventNameParentRect,
  whiteNightSimpleAdventNameSlots,
  whiteNightSimpleAdventNameText,
  whiteNightSimpleAdventPresentationForViewport,
  whiteNightSimpleAdventShowDurationMs,
  whiteNightSimpleAdventSmoothstep,
} from "../static/fun/lobotomy-corp/Events/WhiteNightAdvent.js";

/** Simple Advent 帧调度器使用的最小回调签名。 */
type AdventFrameCallback = (timestamp: number) => void;

/**
 * 创建可检查样式、文字量度和层级的 Simple Advent 最小 DOM。
 *
 * @return {{body: Element, document: object}} 测试文档。
 */
function createAdventDocument() {
  const body = new Element();
  return {
    body,
    document: {
      body,
      createElement: () => new Element(),
    },
  };
}

/**
 * 提取 CSS 中一个明确类选择器的规则体。
 *
 * @param {string} css 样式表文本。
 * @param {string} className CSS 类名。
 * @return {string} 对应规则体。
 */
function cssRule(css: string, className: string): string {
  return css.match(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`, "s"))?.[1] ??
    "";
}

Deno.test("Simple Advent uses literal prefab layout, visible sprites, and Best Fit limits", async () => {
  const harness = createAdventDocument();
  const frames: Array<{ callback: AdventFrameCallback; id: number }> = [];
  const cancelled = new Set<number>();
  let frameId = 0;
  let bellCount = 0;
  const controller = createWhiteNightSimpleAdvent({
    assetRoot: "/static/fun/lobotomy-corp/Assets",
    canvasScaleForViewport: () => 0.75,
    canvasViewportForUpdate: (_previous, next) => next,
    document: harness.document,
    measureName: (node, size) =>
      node.textContent === "normal-long-name"
        ? size <= 14
        : node.textContent === "two words that wrap"
        ? size <= 20
        : node.textContent === "twelfth-long-name"
        ? size <= 12
        : true,
    names: [
      "short",
      "normal-long-name",
      "two words that wrap",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "twelfth-long-name",
    ],
    now: () => 0,
    playBell: () => bellCount++,
    requestFrame: (callback) => {
      const id = ++frameId;
      frames.push({ callback, id });
      return id;
    },
    cancelFrame: (id) => cancelled.add(id),
    viewport: () => ({ height: 900, width: 1200 }),
  });
  const root = requireByClass(
    harness.body,
    "lobotomy-corp-white-night-simple-advent",
  );
  const namesLayer =
    findAllByClass(root, "lobotomy-corp-white-night-simple-advent-names")[0];
  const names = findAllByClass(
    root,
    "lobotomy-corp-white-night-simple-advent-name",
  );
  const canvas =
    findAllByClass(root, "lobotomy-corp-white-night-simple-advent-canvas")[0];
  const shader =
    findAllByClass(root, "lobotomy-corp-white-night-simple-advent-shader")[0];

  assertEquals(whiteNightSimpleAdventNameParentRect.anchoredPosition, {
    x: 0,
    y: -8.750008,
  });
  assertEquals(whiteNightSimpleAdventNameSlots[0].anchoredPosition, {
    x: 129.96,
    y: 239.4,
  });
  assertEquals(whiteNightSimpleAdventNameSlots[0].rotation, 29.999994);
  assertEquals(whiteNightSimpleAdventNameSlots[11].anchoredPosition, {
    x: 0,
    y: 275.4,
  });
  assertEquals(whiteNightSimpleAdventNameSlots[11].rotation, 0);
  assertEquals(whiteNightSimpleAdventNameText.normalMinSize, 14);
  assertEquals(whiteNightSimpleAdventNameText.twelfthMinSize, 12);
  assertEquals(whiteNightSimpleAdventNameText.maxSize, 40);
  assertEquals(namesLayer.dataset.anchoredPositionY, "-8.750008");
  assertEquals(
    canvas.styleProperties.get("--lobotomy-corp-advent-canvas-scale"),
    "0.75",
  );
  assertEquals(names.length, 12);
  // Shader 与 CanvasScaler 逻辑画布是 root 的平级层，避免背景落入 16:9 横带。
  assert(shader.parentElement === root);
  assert(canvas.parentElement === root);
  assertEquals(names.map((node) => node.dataset.index), [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
  ]);
  assertEquals(
    names[0].styleProperties.get("--lobotomy-corp-advent-name-font-size"),
    "40px",
  );
  assertEquals(
    names[1].styleProperties.get("--lobotomy-corp-advent-name-font-size"),
    "14px",
  );
  assertEquals(
    names[2].styleProperties.get("--lobotomy-corp-advent-name-font-size"),
    "20px",
  );
  assertEquals(
    names[11].styleProperties.get("--lobotomy-corp-advent-name-font-size"),
    "12px",
  );
  assertEquals(names[1].dataset.minimumFontSize, "14");
  assertEquals(names[11].dataset.minimumFontSize, "12");
  assertEquals(bellCount, 1);
  assertEquals(
    findAllByClass(root, "lobotomy-corp-white-night-simple-advent-arrow")
      .length,
    0,
  );
  assertEquals(
    findAllByClass(root, "lobotomy-corp-white-night-simple-advent-desc").length,
    0,
  );
  assertEquals(
    findAllByClass(root, "lobotomy-corp-white-night-simple-advent-black-shader")
      .length,
    0,
  );
  assertStrictEquals(controller.isFinished(), false);

  const css = await Deno.readTextFile(
    new URL("../static/fun/lobotomy-corp/lobotomy-corp.css", import.meta.url),
  );
  assertEquals(
    /object-fit:\s*contain/.test(
      cssRule(css, "lobotomy-corp-white-night-simple-advent-frame"),
    ),
    true,
  );
  assertEquals(
    /object-fit:\s*fill/.test(
      cssRule(css, "lobotomy-corp-white-night-simple-advent-lower-shader"),
    ),
    true,
  );
  assertEquals(
    css.replaceAll("\r", "").includes(
      ".lobotomy-corp-white-night-simple-advent-global-shader,\n" +
        ".lobotomy-corp-white-night-simple-advent-clock-shader {\n" +
        "  height: 100vh;\n  height: 100dvh;\n  inset: 0;\n" +
        "  object-fit: fill;\n  width: 100vw;",
    ),
    true,
  );
  assertEquals(
    /top:\s*calc\(50% \+ 8\.750008px\)/.test(
      cssRule(css, "lobotomy-corp-white-night-simple-advent-names"),
    ),
    true,
  );
  assertEquals(
    /white-space:\s*normal/.test(
      cssRule(css, "lobotomy-corp-white-night-simple-advent-name"),
    ),
    true,
  );
  assertEquals(
    /overflow-wrap:\s*normal/.test(
      cssRule(css, "lobotomy-corp-white-night-simple-advent-name"),
    ),
    true,
  );
  assertEquals(
    /transform:\s*scale\(var\(--lobotomy-corp-advent-canvas-scale\)\)/.test(
      cssRule(css, "lobotomy-corp-white-night-simple-advent-canvas"),
    ),
    true,
  );
  // Canvas 保留 1920px 的 Flex 布局宽度，避免 CanvasScaler transform 前被缩小。
  assertEquals(
    /flex-shrink:\s*0/.test(
      cssRule(css, "lobotomy-corp-white-night-simple-advent-canvas"),
    ),
    true,
  );
  assertEquals(
    /position:\s*fixed/.test(
      cssRule(css, "lobotomy-corp-white-night-simple-advent-shader"),
    ),
    true,
  );

  controller.dispose();
  assertEquals(cancelled.size, 1);
  assertEquals(harness.body.children.length, 0);
});

Deno.test("Simple Advent composes Show and Hide without visible breathing scale", () => {
  const harness = createAdventDocument();
  const frames: AdventFrameCallback[] = [];
  let logicalEndCount = 0;
  let hiddenCount = 0;
  const controller = createWhiteNightSimpleAdvent({
    assetRoot: "/Assets",
    document: harness.document,
    now: () => 0,
    onAdventEnd: () => logicalEndCount++,
    onHidden: () => hiddenCount++,
    requestFrame: (callback) => (frames.push(callback), frames.length),
  });
  const root = requireByClass(
    harness.body,
    "lobotomy-corp-white-night-simple-advent",
  );
  const clock =
    findAllByClass(root, "lobotomy-corp-white-night-simple-advent-clock")[0];
  const uiRoot =
    findAllByClass(root, "lobotomy-corp-white-night-simple-advent-ui-root")[0];
  const names = findAllByClass(
    root,
    "lobotomy-corp-white-night-simple-advent-name",
  );
  const advance = (timestamp: number) => frames.shift()!(timestamp);

  assertEquals(whiteNightSimpleAdventDurationMs, 4000);
  assertEquals(whiteNightSimpleAdventShowDurationMs, 333.33334);
  assertEquals(whiteNightSimpleAdventHideDurationMs, 500);
  assertEquals(whiteNightSimpleAdventSmoothstep(0.25), 0.15625);
  advance(whiteNightSimpleAdventShowDurationMs * 0.25);
  assertEquals(
    root.styleProperties.get("--lobotomy-corp-advent-root-alpha"),
    "0.15625",
  );
  assertEquals(
    clock.styleProperties.get("--lobotomy-corp-advent-clock-alpha"),
    "0",
  );
  advance(
    whiteNightSimpleAdventShowDurationMs / 2 +
      whiteNightSimpleAdventShowDurationMs / 2 * 0.25,
  );
  assertEquals(
    Number(
      clock.styleProperties.get("--lobotomy-corp-advent-clock-alpha"),
    ).toFixed(6),
    "0.156250",
  );

  // 本项目的 Simple Advent 实际演出验收不复刻通用 Animator 的可见 breathing scale。
  [500, 1000, 1500, 2000, 3500].forEach((timestamp) => {
    advance(timestamp);
    assertEquals(
      uiRoot.styleProperties.get("--lobotomy-corp-advent-animator-scale") ??
        "1",
      "1",
    );
  });
  advance(3999);
  assertEquals(logicalEndCount, 0);
  assertEquals(harness.body.children.length, 1);
  advance(4000);
  assertEquals(logicalEndCount, 1);
  assertStrictEquals(controller.isAdventEnded(), true);
  assertEquals(harness.body.children.length, 1);
  advance(4125);
  assertEquals(
    root.styleProperties.get("--lobotomy-corp-advent-root-alpha"),
    "0.84375",
  );
  assertEquals(
    clock.styleProperties.get("--lobotomy-corp-advent-clock-alpha"),
    "1",
  );
  assertEquals(
    names[0].styleProperties.get("--lobotomy-corp-advent-name-alpha"),
    "1",
  );
  assertEquals(
    Number(root.styleProperties.get("--lobotomy-corp-advent-root-alpha")) *
      Number(clock.styleProperties.get("--lobotomy-corp-advent-clock-alpha")) *
      Number(names[0].styleProperties.get("--lobotomy-corp-advent-name-alpha")),
    0.84375,
  );
  advance(4250);
  assertEquals(
    root.styleProperties.get("--lobotomy-corp-advent-root-alpha"),
    "0.5",
  );
  assertEquals(
    clock.styleProperties.get("--lobotomy-corp-advent-clock-alpha"),
    "1",
  );
  advance(4500);
  assertEquals(
    root.styleProperties.get("--lobotomy-corp-advent-root-alpha"),
    "0",
  );
  assertStrictEquals(controller.isFinished(), true);
  assertEquals(harness.body.children.length, 0);
  assertEquals(logicalEndCount, 1);
  assertEquals(hiddenCount, 1);
  controller.finish();
  controller.dispose();
  assertEquals(logicalEndCount, 1);
  assertEquals(hiddenCount, 1);
});

Deno.test("Simple Advent keeps fullscreen shader bounds independent from Clock CanvasScaler", () => {
  const scaleForViewport = (width: number, height: number) =>
    Math.min(width / 1920, height / 1080);
  assertEquals(
    whiteNightSimpleAdventPresentationForViewport(
      1269,
      1233,
      scaleForViewport,
    ),
    {
      background: { height: 1233, width: 1269 },
      clock: { height: 541.3078125, scale: 0.6609375, width: 541.3078125 },
    },
  );
  assertEquals(
    whiteNightSimpleAdventPresentationForViewport(1920, 1080, scaleForViewport),
    {
      background: { height: 1080, width: 1920 },
      clock: { height: 819, scale: 1, width: 819 },
    },
  );
});

Deno.test("Simple Advent Clock fit derives from prefab geometry", () => {
  // Clock：819×819，水平居中，top = 25，逻辑画布 1920×1080 且以中心为 transform-origin。
  assertEquals(whiteNightSimpleAdventClockRect.width, 819);
  assertEquals(whiteNightSimpleAdventClockRect.height, 819);
  assertEquals(whiteNightSimpleAdventClockRect.topFromCanvasCenter, 25 - 540);
  assertEquals(
    whiteNightSimpleAdventClockRect.bottomFromCanvasCenter,
    25 + 819 - 540,
  );

  // 顶部边界比底部边界严格，因此 1080 高 viewport 的 fit 由 viewportHeight / (515 × 2) 决定。
  assertEquals(
    whiteNightSimpleAdventClockFitScaleForViewport(1920, 1080),
    1080 / 1030,
  );
  // 宽而矮的 viewport 由高度上限接管；竖屏仍由宽度上限接管。
  assertEquals(
    whiteNightSimpleAdventClockFitScaleForViewport(1920, 800),
    800 / 1030,
  );
  assertEquals(
    whiteNightSimpleAdventClockFitScaleForViewport(390, 844),
    390 / 819,
  );
  // 1920×1080 下 fit 上限大于基础 CanvasScaler，Clock 不会被无谓缩小。
  assertEquals(
    whiteNightSimpleAdventPresentationForViewport(1920, 1080).clock.scale,
    1,
  );
});

Deno.test("Simple Advent Clock stays inside every supported viewport without stretching", () => {
  const viewports: Array<[number, number]> = [
    [1920, 1080],
    [1280, 720],
    [1920, 800],
    [1600, 700],
    [2560, 900],
    [1269, 1233],
    [390, 844],
    [430, 932],
  ];
  for (const [width, height] of viewports) {
    const presentation = whiteNightSimpleAdventPresentationForViewport(
      width,
      height,
    );
    const bounds = whiteNightSimpleAdventClockViewportBounds(width, height);
    const epsilon = 1e-9;
    assertEquals(
      {
        bottom: bounds.bottom <= height + epsilon,
        left: bounds.left >= -epsilon,
        right: bounds.right <= width + epsilon,
        top: bounds.top >= -epsilon,
      },
      { bottom: true, left: true, right: true, top: true },
    );
    // Clock 只做 uniform scale，不因 fit 被拉伸。
    assertEquals(presentation.clock.width, presentation.clock.height);
    assertEquals(
      presentation.clock.width,
      whiteNightSimpleAdventClockRect.width * presentation.clock.scale,
    );
    // Fullscreen Shader 仍然完整覆盖 viewport。
    assertEquals(presentation.background, { height, width });
  }
});

Deno.test("Simple Advent Clock fit uses the live viewport when only the height shrinks", () => {
  const harness = createAdventDocument();
  const resizeListeners: Array<() => void> = [];
  const originalVisualViewport = Object.getOwnPropertyDescriptor(
    globalThis,
    "visualViewport",
  );
  let live = { height: 1080, width: 1920 };
  Object.defineProperty(globalThis, "visualViewport", {
    configurable: true,
    value: {
      addEventListener: (_type: string, listener: () => void) =>
        resizeListeners.push(listener),
      removeEventListener: () => {},
    },
  });
  try {
    const controller = createWhiteNightSimpleAdvent({
      assetRoot: "/Assets",
      // base scale 只按宽度计算，模拟横屏 Match Width 的共享 CanvasScaler。
      canvasScaleForViewport: (width: number) => width / 1920,
      canvasViewportForUpdate: (_previous, next) => next,
      cancelFrame: () => {},
      document: harness.document,
      now: () => 0,
      requestFrame: () => 0,
      viewport: () => live,
    });
    const canvas = findAllByClass(
      requireByClass(harness.body, "lobotomy-corp-white-night-simple-advent"),
      "lobotomy-corp-white-night-simple-advent-canvas",
    )[0];
    assertEquals(
      canvas.styleProperties.get("--lobotomy-corp-advent-canvas-scale"),
      "1",
    );

    // 仅高度缩小（浏览器 chrome）：base scale 不变，但 Clock fit 让轮盘完整可见。
    live = { height: 800, width: 1920 };
    resizeListeners.forEach((listener) => listener());
    assertEquals(
      canvas.styleProperties.get("--lobotomy-corp-advent-canvas-scale"),
      String(800 / 1030),
    );
    const bounds = whiteNightSimpleAdventClockViewportBounds(1920, 800);
    assert(Number(bounds.top.toFixed(6)) >= 0);
    assert(Number(bounds.bottom.toFixed(6)) <= 800);
    controller.dispose();
  } finally {
    if (originalVisualViewport) {
      Object.defineProperty(
        globalThis,
        "visualViewport",
        originalVisualViewport,
      );
    } else {
      Reflect.deleteProperty(globalThis, "visualViewport");
    }
  }
});
