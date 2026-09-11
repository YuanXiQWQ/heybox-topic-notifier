/**
 * @file 本文件提供《脑叶公司》Alert 测试所需的浏览器替身与受控时钟。
 */
import { findByClass, requireByClass } from "./test_helpers.ts";

/**
 * 内存版 Web Storage 替身，供测试中的 localStorage / sessionStorage 使用。
 */
export class StorageMock {
  /** 已写入的键值对。 */
  readonly values = new Map<string, string>();

  /** @param {string} key 存储键。 @return {string|null} 存储值。 */
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  /** @param {string} key 存储键。 @param {string} value 存储值。 */
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  /** @param {string} key 存储键。 */
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

/**
 * 测试用的 DOM 节点替身。
 *
 * 只保留 Alert 与 WhiteNight 生命周期真正读写的属性与事件能力。
 */
export class Element {
  alt = "";
  attributes: Record<string, string> = {};
  children: Element[] = [];
  className = "";
  classList = { add: () => {}, remove: () => {} };
  clientHeight = 48;
  clientWidth = 114;
  dataset: Record<string, string> = {};
  disabled = false;
  hidden = false;
  id = "";
  offsetWidth = 1;
  parentElement: Element | undefined = undefined;
  removed = false;
  scrollHeight = 48;
  scrollWidth = 0;
  /** 该节点额外匹配的属性选择器，用于模拟 `[data-*]` 查询。 */
  selectors = new Set<string>();
  src = "";
  styleProperties = new Map<string, string>();
  style: Record<string, unknown> = {};
  textContent = "";
  type = "";
  value = "";
  #events = new Map<string, ((event: Event) => void)[]>();
  /** 创建可记录 DOM 状态的模拟节点。 */
  constructor() {
    this.style.setProperty = (name: string, value: string) => {
      this.styleProperties.set(name, value);
      this.style[name] = value;
    };
  }
  /** @param {...Element} nodes 要追加的节点。 */ append(
    ...nodes: Element[]
  ): void {
    nodes.forEach((node) => {
      node.parentElement = this;
      this.children.push(node);
    });
  }
  /** @param {Element} child 新节点。 @param {Element} before 参照节点。 */ insertBefore(
    child: Element,
    before: Element,
  ): void {
    child.parentElement = this;
    const index = this.children.indexOf(before);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
  }
  /** @param {string} name 事件名。 @param {(event: Event) => void} listener 监听器。 */ addEventListener(
    name: string,
    listener: (event: Event) => void,
  ): void {
    this.#events.set(name, [...(this.#events.get(name) ?? []), listener]);
  }
  /** @param {string} name 事件名。 @param {(event: Event) => void} listener 监听器。 */ removeEventListener(
    name: string,
    listener: (event: Event) => void,
  ): void {
    this.#events.set(
      name,
      (this.#events.get(name) ?? []).filter((item) => item !== listener),
    );
  }
  /** @param {string} name 属性名。 @param {string} value 属性值。 */ setAttribute(
    name: string,
    value: string,
  ): void {
    this.attributes[name] = value;
    if (name === "aria-hidden") this.dataset.ariaHidden = value;
  }
  /** @param {string} name 属性名。 */ removeAttribute(name: string): void {
    delete this.attributes[name];
  }
  /** @param {string} name 属性名。 @return {string|null} 属性值。 */ getAttribute(
    name: string,
  ): string | null {
    return this.attributes[name] ?? null;
  }
  /** @param {...Element} nodes 替换当前子节点列表。 */ replaceChildren(
    ...nodes: Element[]
  ): void {
    nodes.forEach((node) => node.parentElement = this);
    this.children = [...nodes];
  }
  /** 标记节点已删除，并从父节点摘除。 */
  remove(): void {
    this.removed = true;
    const index = this.parentElement?.children.indexOf(this) ?? -1;
    if (index >= 0) this.parentElement?.children.splice(index, 1);
    this.parentElement = undefined;
  }
  /** @param {string} name 事件名。 */ dispatch(name: string): void {
    this.#events.get(name)?.forEach((listener) => listener(new Event(name)));
  }
  /**
   * 判断节点是否匹配选择器。
   *
   * 支持类选择器、`[data-*]` 属性选择器（由 `selectors` 声明）以及逗号分隔的选择器列表。
   *
   * @param {string} selector CSS 选择器。
   * @return {boolean} 匹配时返回 true。
   */
  matches(selector: string): boolean {
    return selector.split(",").some((part) => this.matchesSingle(part.trim()));
  }
  /** @param {string} selector 单个选择器。 @return {boolean} 是否匹配。 */
  matchesSingle(selector: string): boolean {
    // 显式登记的选择器优先，支持 `[data-*]`、`a[href]` 等测试需要的任意写法。
    if (this.selectors.has(selector)) return true;
    return selector.startsWith(".") &&
      this.className.split(/\s+/).includes(selector.slice(1));
  }
  /** @param {string} selector CSS 选择器。 @return {Element|undefined} 最近匹配的祖先或自身。 */
  closest(selector: string): Element | undefined {
    if (this.matches(selector)) return this;
    return this.parentElement?.closest(selector);
  }
  /** @param {string} selector CSS 选择器。 @return {Element|undefined} 首个匹配的后代。 */
  querySelector(selector: string): Element | undefined {
    return this.children.find((child) =>
      child.matches(selector) || child.querySelector(selector)
    );
  }
  /** @param {string} selector CSS 选择器。 @return {Element[]} 全部匹配的后代。 */
  querySelectorAll(selector: string): Element[] {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}

/**
 * 测试用的 Audio 替身。
 *
 * 所有实例进入共享的 `items` 列表。每个测试开始前调用 `AudioMock.reset()` 恢复默认
 * 行为并清空列表，再按需设置初始进度、初始静音状态与 `playHook`。
 */
export class AudioMock extends Element {
  /** 本次测试创建的音频实例。 */
  static items: AudioMock[] = [];
  /** 新实例的初始进度（秒）。 */
  static initialCurrentTime = 0;
  /** 新实例的初始静音状态。 */
  static initialMuted = false;
  /** 新实例的媒体时长（秒）。 */
  static nextDuration = Number.NaN;
  /** 新实例的媒体就绪状态。 */
  static nextReadyState = 0;
  /** removeAttribute("src") 是否清空 src。 */
  static clearSrcOnRemoveAttribute = false;
  /** 自定义 play 行为；返回 undefined 时使用默认行为。 */
  static playHook?: (audio: AudioMock) => Promise<void> | undefined;
  /** 还需要被拒绝的 Trumpet 播放次数，用于模拟自动播放拦截。 */
  static rejectNextTrumpetPlayCount = 0;
  /** 是否拒绝未静音的自动播放。 */
  static rejectUnmutedAutoplay = false;
  /** Trumpet 开始播放时是否把进度重置为 0。 */
  static resetTrumpetPositionOnPlay = false;
  /** 还需要延迟兑现的播放次数。 */
  static deferNextPlayCount = 0;
  /** 延迟兑现的播放回调。 */
  static deferredPlayResolvers: (() => void)[] = [];
  /** 每次播放时的状态快照。 */
  static playSnapshots: Array<{
    audio: AudioMock;
    loop: boolean;
    muted: boolean;
    src: string;
    volume: number;
  }> = [];

  /** 恢复默认行为并清空实例列表。 */
  static reset(): void {
    AudioMock.items.length = 0;
    AudioMock.initialCurrentTime = 0;
    AudioMock.initialMuted = false;
    AudioMock.nextDuration = Number.NaN;
    AudioMock.nextReadyState = 0;
    AudioMock.clearSrcOnRemoveAttribute = false;
    AudioMock.playHook = undefined;
    AudioMock.rejectNextTrumpetPlayCount = 0;
    AudioMock.rejectUnmutedAutoplay = false;
    AudioMock.resetTrumpetPositionOnPlay = false;
    AudioMock.deferNextPlayCount = 0;
    AudioMock.deferredPlayResolvers.length = 0;
    AudioMock.playSnapshots.length = 0;
  }

  /** 最近一次播放是否被浏览器自动播放策略拒绝。 */
  autoplayRejected = false;
  /** 音频时长（秒）。 */
  duration = Number.NaN;
  /** 当前播放进度（秒）。 */
  currentTime: number;
  /** 是否循环播放。 */
  loop = false;
  /** 是否静音。 */
  muted: boolean;
  /** 暂停次数。 */
  pauseCount = 0;
  /** 播放次数。 */
  playCount = 0;
  /** preload 属性值。 */
  preload = "";
  /** 媒体就绪状态。 */
  readyState = 0;
  /** 音量。 */
  volume = 1;
  /** @param {string} source 音频地址。 */
  constructor(source: string) {
    super();
    this.src = source;
    this.currentTime = AudioMock.initialCurrentTime;
    this.duration = AudioMock.nextDuration;
    this.muted = AudioMock.initialMuted;
    this.readyState = AudioMock.nextReadyState;
    AudioMock.items.push(this);
  }
  /** @return {Promise<void>} 播放结果。 */
  play(): Promise<void> {
    this.playCount++;
    AudioMock.playSnapshots.push({
      audio: this,
      loop: this.loop,
      muted: this.muted,
      src: this.src,
      volume: this.volume,
    });
    const hookResult = AudioMock.playHook?.(this);
    if (hookResult) return hookResult;
    const isTrumpet = this.src.includes("Resources/sounds/bgm/emergency");
    if (AudioMock.resetTrumpetPositionOnPlay && isTrumpet) {
      this.currentTime = 0;
    }
    if (isTrumpet && AudioMock.rejectNextTrumpetPlayCount > 0) {
      AudioMock.rejectNextTrumpetPlayCount--;
      return Promise.reject(new Error("trumpet autoplay blocked"));
    }
    if (AudioMock.rejectUnmutedAutoplay && this.muted !== true) {
      this.autoplayRejected = true;
      return Promise.reject(new Error("unmuted autoplay blocked"));
    }
    if (AudioMock.deferNextPlayCount > 0) {
      AudioMock.deferNextPlayCount--;
      return new Promise((resolve) =>
        AudioMock.deferredPlayResolvers.push(resolve)
      );
    }
    return Promise.resolve();
  }
  /** 暂停音频。 */ pause(): void {
    this.pauseCount++;
  }
  /** 释放媒体资源。 */ load(): void {}
  /** @param {string} name 属性名。 */ override removeAttribute(
    name: string,
  ): void {
    if (name === "src" && AudioMock.clearSrcOnRemoveAttribute) this.src = "";
    super.removeAttribute(name);
  }
}

/**
 * 安装《脑叶公司》Alert 测试所需的浏览器替身。
 *
 * 只模拟 Alert 生命周期真正依赖的能力：可控时钟与计时器、音频、最小 DOM 与存储。
 *
 * @param {{alertOverlays?: Element[], navigationType?: "navigate" | "reload", now?: number, pollingIntervalValue?: string}} [options] 初始导航类型、可控时钟起点、设置页轮询数值与页面上已存在的固定覆盖层。
 * @return {object} 测试上下文。
 */
export function installLobotomyCorpAlertHarness(
  options: {
    alertOverlays?: Element[];
    navigationType?: "navigate" | "reload";
    now?: number;
    pollingIntervalValue?: string;
  } = {},
) {
  // 每个测试独立使用一份干净的 Audio 实例列表与默认行为。
  AudioMock.reset();
  const browser = globalThis as typeof globalThis & {
    Audio?: unknown;
    document?: unknown;
    innerHeight?: number;
    innerWidth?: number;
    localStorage?: unknown;
    location?: unknown;
    performance?: unknown;
    sessionStorage?: unknown;
    lobotomyCorpEasterEgg?: {
      activate: (name: string) => Promise<boolean>;
      commitDisplayName: (name: string) => Promise<boolean>;
      getDangerMusicHighWaterLevel: () => number;
      getDangerScore: () => number;
      getSpecialEvent: () => string | undefined;
      getSpecialEventPhase: () => string | undefined;
      handleAbnormalitySubmitted: (name: string) => Promise<boolean>;
      matches: (name: string) => boolean;
      matchingAbnormality: (
        name: string,
      ) => { canonicalId: string } | undefined;
      prepareDisplayName: (name: string) => {
        commit: () => Promise<boolean>;
        dispose: () => void;
      };
      restartDay: () => Promise<boolean>;
      setDangerScore: (score: number) => Promise<boolean>;
      startWhiteNight: (options: { source: string }) => boolean;
    };
  };
  const original = Object.fromEntries(
    [
      "Audio",
      "document",
      "innerHeight",
      "innerWidth",
      "localStorage",
      "location",
      "performance",
      "sessionStorage",
      "setTimeout",
      "clearTimeout",
    ].map((name) => [name, Object.getOwnPropertyDescriptor(browser, name)]),
  );
  const originalDateNow = Date.now;
  const body = new Element();
  const assignedLocations: string[] = [];
  const storage = new StorageMock();
  const documentListeners = new Map<string, ((event: Event) => void)[]>();
  const createdElements: Element[] = [];
  let navigationType = options.navigationType ?? "navigate";
  let now = options.now ?? 0;
  let nextTimerId = 0;
  const timers = new Map<
    number,
    {
      callback: () => void;
      delay: number;
      cleared: boolean;
      fired: boolean;
    }
  >();
  const localeData = Deno.readTextFileSync(
    new URL("../static/fun/lobotomy-corp/Locales/zh-CN.json", import.meta.url),
  );
  const abnormalitiesData = Deno.readTextFileSync(
    new URL(
      "../static/fun/lobotomy-corp/Data/Abnormalities.json",
      import.meta.url,
    ),
  );
  Object.defineProperties(browser, {
    Audio: { configurable: true, value: AudioMock },
    document: {
      configurable: true,
      value: {
        body,
        addEventListener: (name: string, listener: (event: Event) => void) =>
          documentListeners.set(name, [
            ...(documentListeners.get(name) ?? []),
            listener,
          ]),
        createElement: () => {
          const element = new Element();
          createdElements.push(element);
          return element;
        },
        documentElement: { lang: "zh-CN" },
        getElementById: (id: string) =>
          id === "lobotomy-corp-locale-data"
            ? { textContent: localeData }
            : id === "lobotomy-corp-abnormalities-data"
            ? { textContent: abnormalitiesData }
            : null,
        querySelector: (selector: string) =>
          selector === "[data-polling-interval-value]" &&
            options.pollingIntervalValue !== undefined
            ? { value: options.pollingIntervalValue }
            : undefined,
        querySelectorAll: (selector: string) =>
          selector === ".lobotomy-corp-alert-overlay"
            ? (options.alertOverlays ?? [])
            : [],
        removeEventListener: (name: string, listener: (event: Event) => void) =>
          documentListeners.set(
            name,
            (documentListeners.get(name) ?? []).filter((item) =>
              item !== listener
            ),
          ),
      },
    },
    innerHeight: { configurable: true, value: 1080 },
    innerWidth: { configurable: true, value: 1920 },
    localStorage: { configurable: true, value: storage },
    location: {
      configurable: true,
      value: {
        assign: (href: string) => {
          assignedLocations.push(String(href));
        },
        href: "https://warmnest.test/settings",
        pathname: "/settings",
        search: "",
      },
    },
    performance: {
      configurable: true,
      value: { getEntriesByType: () => [{ type: navigationType }] },
    },
    sessionStorage: { configurable: true, value: storage },
    setTimeout: {
      configurable: true,
      value: (callback: () => void, delay = 0) => {
        const id = ++nextTimerId;
        const timer = {
          callback: () => {
            timer.fired = true;
            callback();
          },
          cleared: false,
          delay,
          fired: false,
        };
        timers.set(id, timer);
        return id;
      },
    },
    clearTimeout: {
      configurable: true,
      value: (id: number) => {
        const timer = timers.get(id);
        if (timer) timer.cleared = true;
      },
    },
  });
  Date.now = () => now;
  return {
    AudioMock,
    body,
    storage,
    timers,
    /** @return {object} 当前已加载的彩蛋 API。 */ api: () =>
      browser.lobotomyCorpEasterEgg!,
    /** 重新导入模块，模拟内部导航或完整刷新。 */ reload: () =>
      import(
        `../static/fun/lobotomy-corp/lobotomy-corp.js?test=${crypto.randomUUID()}`
      ),
    /** @param {number} value 可控时钟。 */ setNow: (value: number) => {
      now = value;
    },
    /** @param {"navigate" | "reload"} value 下一次导航类型。 */ setNavigationType:
      (value: "navigate" | "reload") => {
        navigationType = value;
      },
    /** @param {number} delay 计时器延迟。 @return {object|undefined} 仍未取消的计时器。 */ pendingTimer:
      (delay: number) =>
        [...timers.values()].find((timer) =>
          timer.delay === delay && !timer.cleared && !timer.fired
        ),
    /**
     * 按注册顺序在 document 上派发一次事件，用于模拟真实用户手势。
     *
     * @param {string} name 事件名。
     * @return {number} 已派发的监听器数量。
     */
    dispatchDocument: (name: string) => {
      const listeners = [...(documentListeners.get(name) ?? [])];
      listeners.forEach((listener) => listener(new Event(name)));
      return listeners.length;
    },
    /**
     * 在 document 上派发一次可取消事件并返回事件对象。
     *
     * 用于断言捕获阶段拦截器是否阻止了默认行为。
     *
     * @param {string} name 事件名。
     * @return {Event} 已派发的事件。
     */
    dispatchDocumentEvent: (name: string) => {
      const event = new Event(name, {cancelable: true});
      [...(documentListeners.get(name) ?? [])].forEach((listener) =>
        listener(event)
      );
      return event;
    },
    /** @return {number} 触发当前所有待执行的 16ms 回调（Advent 帧与音乐渐变步进共用该延迟）。 */
    fireFrames: () => {
      const pending = [...timers.values()].filter((timer) =>
        timer.delay === 16 && !timer.cleared && !timer.fired
      );
      pending.forEach((timer) => timer.callback());
      return pending.length;
    },
    /** @return {AudioMock|undefined} 最近创建的 Trumpet 曲目。 */ lastTrumpet:
      () =>
        [...AudioMock.items].reverse().find((audio) =>
          audio.src.includes("Resources/sounds/bgm/emergency")
        ),
    /** @return {Element[]} 本次测试中按创建顺序记录的全部 DOM 节点。 */
    createdElements: () => createdElements,
    /** @return {string[]} location.assign 收到的地址。 */
    assignedLocations: () => [...assignedLocations],
    /** @return {Element|undefined} 最近一次挂载且仍可见的 Alert overlay。 */
    overlay: () =>
      [...body.children].reverse().find((element) =>
        !element.removed && element.className === "lobotomy-corp-alert-overlay"
      ),
    /** @param {Element} overlay Alert overlay。 @return {string} Trumpet 文本。 */
    trumpet: (overlay: Element) =>
      requireByClass(overlay, "lobotomy-corp-alert-trumpet-level-content")
        .textContent,
    /** @param {Element} overlay Alert overlay。 @return {boolean} 当前是否显示四角警报框。 */
    hasHud: (overlay: Element) =>
      findByClass(overlay, "lobotomy-corp-emergency-controller") !== undefined,
    /** @param {Element} overlay Alert overlay。 @return {Element} 顶部 Restart Day 面板。 */
    panel: (overlay: Element) =>
      requireByClass(overlay, "lobotomy-corp-top-panel"),
    /** @param {Element} overlay Alert overlay。 @return {string|undefined} EmergencyImage 文件名。 */
    riskFile: (overlay: Element) =>
      requireByClass(overlay, "lobotomy-corp-alert-risk").src.split("/").at(-1),
    /** 移除测试期间安装的全部浏览器替身。 */ restore: () => {
      Date.now = originalDateNow;
      for (const [name, descriptor] of Object.entries(original)) {
        if (descriptor) Object.defineProperty(browser, name, descriptor);
        else delete (browser as Record<string, unknown>)[name];
      }
      delete browser.lobotomyCorpEasterEgg;
    },
  };
}
