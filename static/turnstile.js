/**
 * @file 本文件按页面交互需要加载、渲染和重置 Cloudflare Turnstile。
 */

(() => {
  /**
   * Turnstile 官方脚本地址；显式渲染避免脚本自动扫描隐藏组件。
   */
  const turnstileApiUrl =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  /**
   * Turnstile 验证成功后保持展开的时间。
   */
  const turnstileSuccessDisplayMs = 1800;
  /**
   * Turnstile 成功状态收起动画时间。
   */
  const turnstileCollapseAnimationMs = 280;
  /**
   * 各 Turnstile 组件的挂载状态。
   */
  const widgetStates = new WeakMap();
  /**
   * 当前页面共享的 Turnstile 官方脚本加载 Promise。
   */
  let turnstileLoadPromise;

  /**
   * 获取或创建指定组件的挂载状态。
   *
   * @param {HTMLElement} widget Turnstile 组件容器。
   * @return {{failed: boolean, renderPromise?: Promise<void>, token: string, waiters: Array<(ready: boolean) => void>, widgetId?: string}} 组件挂载状态。
   */
  function stateFor(widget) {
    let state = widgetStates.get(widget);
    if (!state) {
      state = {
        failed: false,
        token: '',
        waiters: [],
      };
      widgetStates.set(widget, state);
    }
    return state;
  }

  /**
   * 调用页面中注册的 Turnstile 生命周期回调。
   *
   * @param {HTMLElement} widget Turnstile 组件容器。
   * @param {string} attribute 回调名称所在的数据属性。
   * @param {unknown} [value] 回调参数。
   */
  function callConfiguredCallback(widget, attribute, value) {
    const callbackName = widget.dataset[attribute]?.trim();
    const callback = callbackName ? globalThis[callbackName] : undefined;
    if (typeof callback === 'function') callback(value);
  }

  /**
   * 结束当前等待 Turnstile token 的调用方。
   *
   * @param {ReturnType<typeof stateFor>} state 组件挂载状态。
   * @param {boolean} ready Turnstile 是否已经生成可用 token。
   */
  function resolveWaiters(state, ready) {
    const waiters = state.waiters.splice(0);
    waiters.forEach((resolve) => resolve(ready));
  }

  /**
   * 确保 Cloudflare Turnstile 官方脚本只加载一次。
   *
   * @return {Promise<Object>} 已加载的 Turnstile 全局对象。
   */
  function ensureLoaded() {
    if (globalThis.turnstile) {
      return Promise.resolve(globalThis.turnstile);
    }
    if (turnstileLoadPromise) {
      return turnstileLoadPromise;
    }

    turnstileLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'turnstile-api-script';
      script.src = turnstileApiUrl;
      script.async = true;
      script.defer = true;
      script.addEventListener(
          'load',
          () => {
            if (globalThis.turnstile) {
              resolve(globalThis.turnstile);
            } else {
              reject(new Error('Turnstile API did not initialize.'));
            }
          },
          {once: true},
      );
      script.addEventListener(
          'error',
          () => reject(new Error('Turnstile API failed to load.')),
          {once: true},
      );
      document.head.append(script);
    }).catch((error) => {
      turnstileLoadPromise = undefined;
      throw error;
    });
    return turnstileLoadPromise;
  }

  /**
   * 获取组件中 Cloudflare 写入的响应输入框。
   *
   * @param {HTMLElement} widget Turnstile 组件容器。
   * @return {HTMLInputElement|undefined} 响应输入框。
   */
  function responseInput(widget) {
    const input = widget.querySelector(
        'input[name="cf-turnstile-response"]',
    );
    return input instanceof HTMLInputElement ? input : undefined;
  }

  /**
   * 等待当前组件生成有效 token。
   *
   * @param {HTMLElement} widget Turnstile 组件容器。
   * @return {Promise<boolean>} token 可用时返回 true。
   */
  function waitForToken(widget) {
    const state = stateFor(widget);
    if (state.token) {
      return Promise.resolve(true);
    }
    if (state.failed) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => state.waiters.push(resolve));
  }

  /**
   * 标记组件验证成功，并显示短暂成功状态。
   *
   * @param {HTMLElement} widget Turnstile 组件容器。
   * @param {string} token Turnstile 响应 token。
   */
  function finishVerification(widget, token) {
    const state = stateFor(widget);
    state.failed = false;
    state.token = token;
    resolveWaiters(state, true);
    collapse(widget);
  }

  /**
   * 标记组件验证失败并通知等待中的调用方。
   *
   * @param {HTMLElement} widget Turnstile 组件容器。
   * @param {string} callbackAttribute 失败后需要调用的回调属性。
   * @param {unknown} [value] 回调参数。
   */
  function failVerification(widget, callbackAttribute, value) {
    const state = stateFor(widget);
    state.failed = true;
    state.token = '';
    resolveWaiters(state, false);
    callConfiguredCallback(widget, callbackAttribute, value);
  }

  /**
   * 在验证成功后按现有视觉节奏收起组件。
   *
   * @param {HTMLElement} widget Turnstile 组件容器。
   */
  function collapse(widget) {
    const response = responseInput(widget);
    if (!response?.value.trim()) {
      return;
    }

    widget.dataset.turnstileComplete = 'true';
    globalThis.setTimeout(() => {
      if (widget.dataset.turnstileComplete !== 'true') return;

      widget.dataset.turnstileCollapsing = 'true';
      globalThis.setTimeout(() => {
        if (widget.dataset.turnstileComplete === 'true') {
          widget.hidden = true;
        }
      }, turnstileCollapseAnimationMs);
    }, turnstileSuccessDisplayMs);
  }

  /**
   * 恢复指定组件的可见状态。
   *
   * @param {HTMLElement} widget Turnstile 组件容器。
   */
  function reveal(widget) {
    delete widget.dataset.turnstileComplete;
    delete widget.dataset.turnstileCollapsing;
    widget.hidden = false;
  }

  /**
   * 渲染指定 Turnstile 组件并等待其 token。
   *
   * @param {HTMLElement} widget Turnstile 组件容器。
   * @return {Promise<boolean>} token 可用时返回 true。
   */
  function mount(widget) {
    if (!(widget instanceof HTMLElement)) {
      return Promise.resolve(false);
    }

    const siteKey = widget.dataset.sitekey?.trim();
    if (!siteKey) {
      return Promise.resolve(false);
    }

    const state = stateFor(widget);
    if (state.widgetId !== undefined) {
      if (state.failed) reset(widget);
      return waitForToken(widget);
    }
    if (state.renderPromise) {
      return state.renderPromise.then(() => waitForToken(widget));
    }

    state.renderPromise = ensureLoaded()
        .then((turnstile) => {
          if (state.widgetId !== undefined) return;
          state.widgetId = turnstile.render(widget, {
            callback: (token) => finishVerification(widget, token),
            'error-callback': (code) =>
              failVerification(widget, 'turnstileErrorCallback', code),
            'expired-callback': () => {
              state.failed = false;
              state.token = '';
              resolveWaiters(state, false);
              callConfiguredCallback(
                  widget,
                  'turnstileExpiredCallback',
              );
            },
            sitekey: siteKey,
          });
        })
        .catch((error) => {
          failVerification(widget, 'turnstileErrorCallback', error);
        })
        .finally(() => {
          state.renderPromise = undefined;
        });
    return state.renderPromise.then(() => waitForToken(widget));
  }

  /**
   * 重置指定组件，使其为下一次验证重新生成 token。
   *
   * @param {HTMLElement} widget Turnstile 组件容器。
   */
  function reset(widget) {
    if (!(widget instanceof HTMLElement)) return;

    const state = stateFor(widget);
    state.failed = false;
    state.token = '';
    resolveWaiters(state, false);
    reveal(widget);

    if (
        state.widgetId !== undefined &&
        globalThis.turnstile &&
        typeof globalThis.turnstile.reset === 'function'
    ) {
      globalThis.turnstile.reset(state.widgetId);
    }
  }

  /**
   * 判断组件当前是否位于可见区域。
   *
   * @param {HTMLElement} widget Turnstile 组件容器。
   * @return {boolean} 组件可见时返回 true。
   */
  function isVisible(widget) {
    return !widget.hidden && !widget.closest('[hidden]');
  }

  /**
   * 按组件的 data-turnstile-mode 配置挂载当前可见或立即需要的组件。
   *
   * @param {ParentNode} [root] 查询范围。
   */
  function mountConfiguredWidgets(root = document) {
    root.querySelectorAll('[data-turnstile-mode]').forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      const mode = element.dataset.turnstileMode;
      if (mode === 'eager' || (mode === 'visible' && isVisible(element))) {
        void mount(element);
      }
    });
  }

  /**
   * 启动自动挂载并监听隐藏状态变化。
   */
  function startAutoMount() {
    mountConfiguredWidgets();
    const observer = new MutationObserver(() => mountConfiguredWidgets());
    observer.observe(document.documentElement, {
      attributeFilter: ['hidden'],
      attributes: true,
      childList: true,
      subtree: true,
    });
  }

  /**
   * 收起页面上全部 Turnstile 组件。
   */
  function collapseAll() {
    document.querySelectorAll('.cf-turnstile').forEach((widget) => {
      if (widget instanceof HTMLElement) collapse(widget);
    });
  }

  /**
   * 恢复页面上全部 Turnstile 组件。
   */
  function revealAll() {
    document.querySelectorAll('.cf-turnstile').forEach((widget) => {
      if (widget instanceof HTMLElement) reveal(widget);
    });
  }

  globalThis.WarmNestTurnstile = {
    collapseAll,
    mount,
    reset,
    resetAll: () => {
      document.querySelectorAll('.cf-turnstile').forEach((widget) => {
        if (widget instanceof HTMLElement) reset(widget);
      });
    },
    revealAll,
  };
  globalThis.collapseTurnstileWidget = collapseAll;
  globalThis.revealTurnstileWidgets = revealAll;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAutoMount, {once: true});
  } else {
    startAutoMount();
  }
})();
