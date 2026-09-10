/** @file 白夜后续出逃 Simple Advent 页面原始参数回归测试。 */
import { assertEquals } from "./test_helpers.ts";
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
 * @return {{body: AdventNode, document: object}} 测试文档。
 */
function createAdventDocument() {
  class AdventNode {
    alt = "";
    children: AdventNode[] = [];
    className = "";
    clientHeight = 48;
    clientWidth = 114;
    dataset: Record<string, string> = {};
    id = "";
    parentElement?: AdventNode;
    scrollHeight = 48;
    scrollWidth = 0;
    src = "";
    styleValues = new Map<string, string>();
    style = {
      setProperty: (name: string, value: string) => {
        this.styleValues.set(name, value);
      },
    };
    textContent = "";

    /** @param {...AdventNode} children 要挂载的节点。 */
    append(...children: AdventNode[]): void {
      children.forEach((child) => {
        child.parentElement = this;
        this.children.push(child);
      });
    }

    /** @param {string} _name 属性名。 @param {string} _value 属性值。 */
    setAttribute(_name: string, _value: string): void {}

    /** 从父节点移除自身。 */
    remove(): void {
      const index = this.parentElement?.children.indexOf(this) ?? -1;
      if (index >= 0) this.parentElement?.children.splice(index, 1);
      this.parentElement = undefined;
    }
  }
  const body = new AdventNode();
  return {
    body,
    document: {
      body,
      createElement: () => new AdventNode(),
    },
  };
}

/**
 * 收集给定类名的所有后代节点。
 *
 * @param {object} root 根节点。
 * @param {string} className 目标类名。
 * @return {Array<object>} 匹配节点。
 */
function findByClass<T extends { children: T[]; className: string }>(
  root: T,
  className: string,
): T[] {
  return [
    ...(root.className === className ? [root] : []),
    ...root.children.flatMap((child) => findByClass(child, className)),
  ];
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
  const root = harness.body.children[0];
  const namesLayer =
    findByClass(root, "lobotomy-corp-white-night-simple-advent-names")[0];
  const names = findByClass(
    root,
    "lobotomy-corp-white-night-simple-advent-name",
  );
  const canvas =
    findByClass(root, "lobotomy-corp-white-night-simple-advent-canvas")[0];
  const shader =
    findByClass(root, "lobotomy-corp-white-night-simple-advent-shader")[0];

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
    canvas.styleValues.get("--lobotomy-corp-advent-canvas-scale"),
    "0.75",
  );
  assertEquals(names.length, 12);
  // Shader 与 CanvasScaler 逻辑画布必须是 root 的平级层，避免背景再次落入 16:9 横带。
  assertEquals(shader.parentElement === root, true);
  assertEquals(canvas.parentElement === root, true);
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
    names[0].styleValues.get("--lobotomy-corp-advent-name-font-size"),
    "40px",
  );
  assertEquals(
    names[1].styleValues.get("--lobotomy-corp-advent-name-font-size"),
    "14px",
  );
  assertEquals(
    names[2].styleValues.get("--lobotomy-corp-advent-name-font-size"),
    "20px",
  );
  assertEquals(
    names[11].styleValues.get("--lobotomy-corp-advent-name-font-size"),
    "12px",
  );
  assertEquals(names[1].dataset.minimumFontSize, "14");
  assertEquals(names[11].dataset.minimumFontSize, "12");
  assertEquals(bellCount, 1);
  assertEquals(
    findByClass(root, "lobotomy-corp-white-night-simple-advent-arrow").length,
    0,
  );
  assertEquals(
    findByClass(root, "lobotomy-corp-white-night-simple-advent-desc").length,
    0,
  );
  assertEquals(
    findByClass(root, "lobotomy-corp-white-night-simple-advent-black-shader")
      .length,
    0,
  );
  assertEquals(controller.isFinished(), false);

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
  // Canvas 必须保留 1920px 的 Flex 布局宽度，避免 CanvasScaler transform 前被再次缩小。
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
  const root = harness.body.children[0];
  const clock =
    findByClass(root, "lobotomy-corp-white-night-simple-advent-clock")[0];
  const uiRoot =
    findByClass(root, "lobotomy-corp-white-night-simple-advent-ui-root")[0];
  const names = findByClass(
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
    root.styleValues.get("--lobotomy-corp-advent-root-alpha"),
    "0.15625",
  );
  assertEquals(
    clock.styleValues.get("--lobotomy-corp-advent-clock-alpha"),
    "0",
  );
  advance(
    whiteNightSimpleAdventShowDurationMs / 2 +
      whiteNightSimpleAdventShowDurationMs / 2 * 0.25,
  );
  assertEquals(
    Number(
      clock.styleValues.get("--lobotomy-corp-advent-clock-alpha"),
    ).toFixed(6),
    "0.156250",
  );

  // 本项目的 Simple Advent 实际演出验收不复刻通用 Animator 的可见 breathing scale。
  [500, 1000, 1500, 2000, 3500].forEach((timestamp) => {
    advance(timestamp);
    assertEquals(
      uiRoot.styleValues.get("--lobotomy-corp-advent-animator-scale") ?? "1",
      "1",
    );
  });
  advance(3999);
  assertEquals(logicalEndCount, 0);
  assertEquals(harness.body.children.length, 1);
  advance(4000);
  assertEquals(logicalEndCount, 1);
  assertEquals(controller.isAdventEnded(), true);
  assertEquals(harness.body.children.length, 1);
  advance(4125);
  assertEquals(
    root.styleValues.get("--lobotomy-corp-advent-root-alpha"),
    "0.84375",
  );
  assertEquals(
    clock.styleValues.get("--lobotomy-corp-advent-clock-alpha"),
    "1",
  );
  assertEquals(
    names[0].styleValues.get("--lobotomy-corp-advent-name-alpha"),
    "1",
  );
  assertEquals(
    Number(root.styleValues.get("--lobotomy-corp-advent-root-alpha")) *
      Number(clock.styleValues.get("--lobotomy-corp-advent-clock-alpha")) *
      Number(names[0].styleValues.get("--lobotomy-corp-advent-name-alpha")),
    0.84375,
  );
  advance(4250);
  assertEquals(
    root.styleValues.get("--lobotomy-corp-advent-root-alpha"),
    "0.5",
  );
  assertEquals(
    clock.styleValues.get("--lobotomy-corp-advent-clock-alpha"),
    "1",
  );
  advance(4500);
  assertEquals(
    root.styleValues.get("--lobotomy-corp-advent-root-alpha"),
    "0",
  );
  assertEquals(controller.isFinished(), true);
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

Deno.test("Simple Advent Clock fit derives from prefab geometry instead of magic percentages", () => {
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
    // Clock 只允许 uniform scale，不得因 fit 被拉伸。
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
    const canvas = findByClass(
      harness.body.children[0],
      "lobotomy-corp-white-night-simple-advent-canvas",
    )[0];
    assertEquals(
      canvas.styleValues.get("--lobotomy-corp-advent-canvas-scale"),
      "1",
    );

    // 仅高度缩小（浏览器 chrome）：base scale 不变，但 Clock fit 必须让轮盘完整可见。
    live = { height: 800, width: 1920 };
    resizeListeners.forEach((listener) => listener());
    assertEquals(
      canvas.styleValues.get("--lobotomy-corp-advent-canvas-scale"),
      String(800 / 1030),
    );
    const bounds = whiteNightSimpleAdventClockViewportBounds(1920, 800);
    assertEquals(Number(bounds.top.toFixed(6)) >= 0, true);
    assertEquals(Number(bounds.bottom.toFixed(6)) <= 800, true);
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
