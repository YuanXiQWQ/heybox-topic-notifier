/** @file 为原生应用固定导航、同步真实返回状态，并在导航前等待离线编辑落盘。 */
(() => {
  const native = globalThis.appNative;
  const android = globalThis.HeyboxNative;
  if (!native && !android) return;
  const root = document.documentElement;
  root.dataset.applicationPlatform = android ? 'android' : 'windows';
  const back = document.querySelector('[data-app-back]');
  const status = document.querySelector('[data-app-navigation-status]');
  const navigation = document.querySelector('[data-app-navigation]');
  const savedForms = new WeakSet();
  let canGoBack = false;
  let pending = false;
  let revision = 0;

  /** 按原生历史当前位置和保存状态设置真正的禁用属性。 */
  function renderBack() {
    if (back) back.disabled = !canGoBack || pending;
  }

  /**
   * 只接纳原生提供的历史状态，不用包含前进记录的 history.length 推断。
   * @param {object} state 原生设备状态。
   */
  function receiveState(state) {
    if (typeof state?.navigation?.canGoBack !== 'boolean') return;
    canGoBack = state.navigation.canGoBack;
    renderBack();
  }

  /** 底部导航随语言换行和窗口尺寸变化，为正文保留实际占用的高度。 */
  function measureNavigation() {
    if (!navigation || root.dataset.applicationPlatform !== 'android') return;
    root.style.setProperty('--app-bottom-nav-height', `${Math.ceil(navigation.getBoundingClientRect().height)}px`);
  }

  /**
   * 在设置和离线事务完成、原提交事件退出后执行最后一次导航，失败时保留编辑页。
   * @param {() => void} operation 已通过来源与目标校验的导航操作。
   * @return {Promise<void>} 本次导航处理完成。
   */
  async function navigate(operation) {
    const current = ++revision;
    const page = location.href;
    pending = true;
    renderBack();
    if (status) status.hidden = true;
    try {
      if (globalThis.applicationSync) await globalThis.applicationSync.prepareForExit();
      else if (globalThis.flushSettingsEdits && !await globalThis.flushSettingsEdits()) throw new Error('Settings are not saved');
      // 浏览器在提交事件分发期间会忽略重入的 requestSubmit，即便保存 Promise 已完成。
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (current === revision && location.href === page) operation();
    } catch (error) {
      if (current === revision && status) {
        status.textContent = status.dataset.saveError;
        status.title = error instanceof Error ? error.message : '';
        status.hidden = false;
      }
    } finally {
      if (current === revision) {
        pending = false;
        renderBack();
      }
    }
  }

  /** 只有真实历史允许返回时才发起保存与返回，禁用状态不会退到应用后台。 */
  function goBack() {
    if (canGoBack && !pending) void navigate(() => history.back());
  }
  back?.addEventListener('click', goBack);

  /**
   * 导航表单沿用原提交语义，且与设置页已有的保存监听器兼容。
   * @param {SubmitEvent} event 导航表单提交。
   */
  function submitNavigation(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.closest('[data-app-navigation]') || event.defaultPrevented) return;
    if (savedForms.delete(form)) return;
    event.preventDefault();
    const submitter = event.submitter;
    void navigate(() => {
      savedForms.add(form);
      form.requestSubmit(submitter ?? undefined);
    });
  }
  document.addEventListener('submit', submitNavigation, true);

  let refreshState;
  if (native) {
    native.onState(receiveState);
    refreshState = () => { void native.info().then(receiveState).catch(() => {}); };
  } else {
    // 认证页尚未创建共享桥接器；只接收导航请求，保留登录分发器的其它消息。
    const id = `navigation-${Date.now()}`;
    const previous = android.onmessage;
    android.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'state' || message.id === id) receiveState(message.value);
        if (message.id === id) return;
      } catch { /* 不接纳格式错误的原生消息。 */ }
      previous?.(event);
    };
    refreshState = () => { try { android.postMessage(JSON.stringify({id, method: 'info'})); } catch { /* 端口未就绪时按钮保持禁用。 */ } };
  }
  document.addEventListener('application-native-state', (event) => receiveState(event.detail));
  addEventListener('pageshow', () => { pending = false; renderBack(); refreshState(); measureNavigation(); });
  addEventListener('resize', measureNavigation);
  if (navigation && typeof ResizeObserver === 'function') new ResizeObserver(measureNavigation).observe(navigation);
  refreshState();
  measureNavigation();
})();
