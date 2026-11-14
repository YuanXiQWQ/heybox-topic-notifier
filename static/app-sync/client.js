/** @file 将本地编辑可靠落盘，再按原始编辑时间向当前账号重放。 */
(() => {
  /** 页面所属账号，始终与重放前的服务端会话再核对。 */
  const userId = document.body.dataset.appUserId;
  if (!userId || !globalThis.AppLocalStore || !globalThis.crypto?.subtle) {
    return;
  }
  /** 旧离线 HTML 也加载本机偏好入口，安装包资源可在断网升级后提供该脚本。 */
  globalThis.applicationAppearanceReady = globalThis.applicationAppearance
      ? Promise.resolve(globalThis.applicationAppearance)
      : import('/static/device-preferences.js').then(() => globalThis.applicationAppearance);
  void globalThis.applicationAppearanceReady.catch(() => {
  });
  /** 当前设备的持久元数据和时钟校准。 */
  let metadata;
  /** 当前页面最后生成的编辑，时钟倒退不会改变本机操作顺序。 */
  let previous;
  /** 合并同一页面内重复触发的同步请求。 */
  let flushing;
  /** 当前轮次期间新增的同步请求，后台续传不阻塞本地受理。 */
  let requestedFlush;
  /** 表格基线不包含本地投影，失败撤回和离线重启均从同一基线重算。 */
  let recordBaseline;
  /** 基线请求开始时间，晚于它的确认结果仍覆盖可能过期的服务器快照。 */
  let recordReadAt = Number(document.documentElement.dataset.appRecordReadAt) || 0;
  /** 本地操作和服务器确认都会使早先发起的表格刷新失效。 */
  let recordRevision = 0;
  /** 当前表格包含本地投影时，同签名服务器响应也需要重建基线。 */
  let recordProjected = false;
  /** 串行投影，避免较早的 IndexedDB 读取覆盖较晚的编辑。 */
  let rendering = Promise.resolve();
  /** 尚未完成本机落盘的操作，退出和更新必须等待。 */
  const writes = new Set();
  /** 当前账号的本地数据库接口，离线旧页面可按版本补齐队列能力。 */
  let store = globalThis.AppLocalStore;
  /** 页面初始化前的结构，不把运行中的彩蛋场景或临时弹窗复制进启动快照。 */
  const initialPage = document.documentElement.cloneNode(true);
  recordBaseline = initialPage.querySelector('[data-match-table-section]')?.cloneNode(true);
  /** 本地元数据初始化任务。 */
  const ready = initialize();

  /**
   * 恢复设备版本和待同步操作，后台校准时钟与注册离线资源处理器。
   * @return {Promise<void>} 本地状态就绪。
   */
  async function initialize() {
    if (typeof store.operations !== 'function' || typeof store.settle !== 'function') {
      await import('/static/app-sync/store.js?v=20261114-responsive-actions');
      store = globalThis.AppLocalStore;
    }
    metadata = await store.readState(userId, 'device') ??
        {deviceId: crypto.randomUUID(), offset: 0};
    const pending = await store.operations(userId);
    previous =
        pending.filter((operation) =>
                operation.stamp.deviceId === metadata.deviceId
            )
            .map((operation) => operation.stamp).sort(compareStamp).slice(-1)[0] ??
        metadata.previous;
    await store.writeState(userId, 'device', metadata);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/app-sw.js', {scope: '/'}).then(
          async () => {
            const registration = await navigator.serviceWorker.ready;
            registration.active?.postMessage({type: 'app-session', userId});
            registration.active?.postMessage({type: 'app-pages', userId});
            registration.active?.postMessage({
              type: 'app-resources',
              urls: [
                ...document.querySelectorAll(
                    'script[src],link[rel=\'stylesheet\'],link[rel=\'modulepreload\']',
                ),
              ].map((element) => element.src || element.href),
            });
          },
      ).catch(() => {
      });
    }
    void flush('background');
  }

  /**
   * 对本地操作使用与服务端一致的版本顺序。
   * @param {object} left 左版本。
   * @param {object} right 右版本。
   * @return {number} 比较结果。
   */
  function compareStamp(left, right) {
    for (const key of ['editedAt', 'counter', 'deviceId', 'operationId']) {
      if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
    }
    return 0;
  }

  /**
   * 生成一次编辑版本，网络重试复用已保存的版本。
   * @return {object} 新版本。
   */
  function editStamp() {
    const editedAt = Math.max(
        Date.now() + metadata.offset,
        previous?.editedAt ?? 0,
    );
    previous = {
      editedAt,
      counter: editedAt === previous?.editedAt ? previous.counter + 1 : 0,
      deviceId: metadata.deviceId,
      operationId: crypto.randomUUID(),
    };
    return previous;
  }

  /**
   * 序列化业务表单，不把设备显示偏好或 CSRF 令牌写进离线队列。
   * @param {FormData | URLSearchParams} form 表单快照。
   * @return {string} 可重放的业务字段。
   */
  function serialize(form) {
    const params = new URLSearchParams();
    for (const [name, value] of form) {
      if (!['csrfToken', 'darkMode', 'themeColor', 'locale'].includes(name) && !name.startsWith('sync')) {
        params.append(name, String(value));
      }
    }
    return params.toString();
  }

  /**
   * 将输入控件当前值反映到 HTML，供断网重启恢复同样的页面和编辑器。
   * @return {string} 当前本地页面快照。
   */
  function capturePage() {
    const clone = /** @type {HTMLElement} */ (initialPage.cloneNode(true));
    for (
        const source of document.querySelectorAll(
        '#settings-autosave-form,[data-match-table-section]',
    )
        ) {
      const selector = source.id
          ? `#${CSS.escape(source.id)}`
          : `[data-match-table-section="${
              CSS.escape(source.dataset.matchTableSection)
          }"]`;
      clone.querySelector(selector)?.replaceWith(
          (source.matches('[data-match-table-section]') && recordBaseline ? recordBaseline : source).cloneNode(true));
    }
    clone.setAttribute(
        'style',
        document.documentElement.getAttribute('style') ?? '',
    );
    clone.setAttribute(
        'data-color-mode',
        document.documentElement.getAttribute('data-color-mode') ?? 'light',
    );
    clone.dataset.appRecordReadAt = String(recordReadAt);
    const positions = new Map();
    [...clone.querySelectorAll('input,select,textarea')].forEach((element) => {
      if (!element.name) return;
      const formId = element.getAttribute('form') ||
          element.closest('form')?.id;
      if (formId !== 'settings-autosave-form') return;
      const position = positions.get(element.name) ?? 0;
      positions.set(element.name, position + 1);
      const current =
          [...document.querySelectorAll(`[name="${CSS.escape(element.name)}"]`)]
              .filter((candidate) => candidate.form?.id === formId)[position];
      if (!current) return;
      if (element instanceof HTMLInputElement) {
        if (element.type === 'file') return;
        element.setAttribute('value', current.value);
        element.toggleAttribute('checked', current.checked);
      } else if (element instanceof HTMLTextAreaElement) {
        element.textContent = current.value;
      } else {
        [...element.options].forEach((option, optionIndex) =>
            option.toggleAttribute(
                'selected',
                current.options[optionIndex].selected,
            )
        );
      }
    });
    clone.querySelectorAll('dialog[open]').forEach((dialog) =>
        dialog.removeAttribute('open')
    );
    clone.querySelectorAll('*').forEach((element) => {
      for (const attribute of [...element.attributes]) {
        if (
            attribute.name.startsWith('data-') &&
            attribute.name.endsWith('-initialized')
        ) element.removeAttribute(attribute.name);
      }
    });
    clone.querySelectorAll('[data-match-table-form]').forEach((form) => {
      form.removeAttribute('data-match-table-submitting');
      form.removeAttribute('aria-busy');
      form.querySelectorAll('button[type=\'submit\']').forEach((button) =>
          button.removeAttribute('disabled')
      );
    });
    return '<!doctype html>' + clone.outerHTML;
  }

  /**
   * 原子保存设置和快照，主设置与时段子页共用快照；离线返回本地受理状态。
   * @param {FormData} form 用户本次设置。
   * @param {string} base 用户编辑前的表单。
   * @return {Promise<Response>} 服务器响应或本地已保存响应。
   */
  async function submitSettings(form, base) {
    const html = capturePage();
    await ready;
    const operation = {
      kind: 'settings',
      target: '/settings',
      body: serialize(form),
      base: serialize(new URLSearchParams(base)),
      stamp: editStamp(),
    };
    const existing = await store.readState(
        userId,
        `page:${location.pathname}${location.pathname === '/settings' && location.search === '?panel=polling' ? '' : location.search}`,
    );
    await store.append(
        userId,
        operation,
        `page:${location.pathname}${location.pathname === '/settings' && location.search === '?panel=polling' ? '' : location.search}`,
        {
          html,
          headers: existing?.headers,
          body: operation.body,
          stamp: operation.stamp,
        },
    );
    metadata.previous = previous;
    await store.writeState(userId, 'device', metadata);
    void flush('edit');
    return new Response(null, {status: 202, headers: {'x-app-local': '1'}});
  }

  /**
   * 持久保存记录移动或删除；本地受理不等待网络，上传由后台队列完成。
   * @param {string} target 受支持的本站记录操作。
   * @param {FormData} form 已选择记录及返回路径。
   * @return {Promise<Response>} 已可靠保存的本地受理响应。
   */
  async function submitRecords(target, form) {
    await ready;
    const path = new URL(target, location.origin).pathname;
    if (
        !['/matches/complete', '/matches/delete', '/matches/restore'].includes(
            path,
        )
    ) throw new Error('Unsupported offline action');
    const selected = new Set(form.getAll('matchId').map(String));
    // 此处使用标准浏览器 API 或页面声明的宿主接口；IDE 的跨脚本推断不完整。
    // noinspection JSUnresolvedReference
    const rows = Object.fromEntries(
        [.../** @type {NodeListOf<HTMLTableRowElement>} */ (document.querySelectorAll('tr[data-record-id]'))].filter((row) =>
            selected.has(row.dataset.recordId)
        ).map((row) => [row.dataset.recordId, row.outerHTML]),
    );
    // 此处使用标准浏览器 API 或页面声明的宿主接口；IDE 的跨脚本推断不完整。
    // noinspection JSUnresolvedReference
    const operation = {
      kind: 'record',
      target: path,
      body: serialize(form),
      rows,
      records: [.../** @type {NodeListOf<HTMLTableRowElement>} */ (document.querySelectorAll('tr[data-record-id]'))].filter(row => selected.has(row.dataset.recordId))
          .map(row => ({id: row.dataset.recordId, postId: row.dataset.recordPostId})),
      stamp: editStamp(),
    };
    const existing = await store.readState(
        userId,
        `page:${location.pathname}${location.pathname === '/settings' && location.search === '?panel=polling' ? '' : location.search}`,
    );
    await store.append(
        userId,
        operation,
        `page:${location.pathname}${location.pathname === '/settings' && location.search === '?panel=polling' ? '' : location.search}`,
        {
          html: capturePage(),
          headers: existing?.headers,
          stamp: operation.stamp,
          recordReadAt,
        },
    );
    recordRevision++;
    document.dispatchEvent(new CustomEvent('application-local-records'));
    await applyPendingRecords();
    void flush('edit');
    return new Response(null, {status: 202, headers: {'x-app-local': '1'}});
  }

  /**
   * 验证账号后重放队列；暂时失败保留重试，明确拒绝撤回投影并显示错误。
   * @return {Promise<void>} 本次同步尝试结束。
   */
  async function drain() {
    try {
      const pending = (await store.pending(userId)).sort((a, b) => compareStamp(a.stamp, b.stamp));
      const started = Date.now();
      const response = await fetch('/api/sync/session', {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return;
      const session = await response.json();
      if (session.userId !== userId) return;
      metadata.offset = Math.round(
          session.serverTime - (started + Date.now()) / 2,
      );
      metadata.previous = previous;
      await store.writeState(userId, 'device', metadata);
      for (const operation of pending) {
        const body = new URLSearchParams(operation.body);
        body.set('csrfToken', session.csrfToken);
        body.set('syncStamp', JSON.stringify(operation.stamp));
        if (operation.kind === 'settings') body.set('syncBase', operation.base);
        // 两个分支都只包含字符串请求头，未选中的键不会写入对象。
        // noinspection JSValidateTypes
        /** @type {Record<string, string>} */
        const headers = operation.kind === 'settings'
            ? {'x-autosave': '1', 'x-settings-sync': '1'}
            : {'x-match-table-refresh': '1', 'x-record-sync': '1'};
        const saved = await fetch(operation.target, {
          method: 'POST',
          headers,
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        });
        const rejected = operation.kind === 'record' && [400, 404, 410, 422].includes(saved.status);
        if (!saved.ok && !rejected) {
          showRecordStatus('pending', `HTTP ${saved.status}\n${(await saved.text()).slice(0, 2000)}`);
          return;
        }
        if (operation.kind === 'record') {
          await store.settle(userId, {...operation, delivery: rejected ? 'rejected' : 'confirmed',
            settledAt: Date.now(), error: rejected ? `HTTP ${saved.status}\n${(await saved.text()).slice(0, 2000)}` : undefined});
          recordRevision++;
          await applyPendingRecords();
          document.dispatchEvent(new CustomEvent('application-local-records'));
        } else await store.acknowledge(userId, operation.stamp.operationId);
      }
      if (
          pending.length &&
          !(await store.pending(userId)).length
      ) document.dispatchEvent(new CustomEvent('application-sync-complete'));
    } catch {
      // 无法确认服务端处理结果时保留原操作，下一次重放仍使用同一版本。
    }
  }

  /**
   * 合并并发请求，并立即续传当前轮次期间新增的编辑；多标签页共享 Web Lock。
   * @param {string} reason 同步来源。
   * @return {Promise<void>} 同步尝试结束。
   */
  function flush(reason = 'background') {
    if (flushing && reason === 'background') return flushing;
    requestedFlush = reason;
    flushing = flushing ?? Promise.resolve().then(async () => {
      while (requestedFlush) {
        requestedFlush = undefined;
        if (navigator.locks) await navigator.locks.request(`heybox-sync:${userId}`, drain);
        else await drain();
      }
    }).finally(() => {
      flushing = undefined;
    });
    return flushing;
  }

  /**
   * 将待同步的记录管理状态投影到已缓存表格，不影响其它账号的页面。
   * @return {Promise<void>} 本地表格更新完成。
   */
  function applyPendingRecords() {
    rendering = rendering.catch(() => {}).then(renderRecords);
    return rendering;
  }

  /**
   * 从服务器基线重放有效记录操作，保留选择并恢复被拒绝操作对应的行。
   * @return {Promise<void>} 表格投影完成。
   */
  async function renderRecords() {
    await ready;
    const stored = await store.operations(userId);
    const cached = await store.readState(userId, `page:${location.pathname}${location.search}`);
    if (cached?.html && cached.recordReadAt > recordReadAt) {
      const baseline = new DOMParser().parseFromString(cached.html, 'text/html').querySelector('[data-match-table-section]');
      if (baseline) {
        recordBaseline = baseline;
        recordReadAt = cached.recordReadAt;
      }
    }
    const all = stored.filter((operation) =>
        operation.kind === 'record' && (!operation.delivery || operation.settledAt >= recordReadAt)
    ).sort((a, b) => compareStamp(a.stamp, b.stamp));
    const operations = all.filter((operation) => operation.delivery !== 'rejected');
    recordProjected = all.length > 0;
    const section = document.querySelector('[data-match-table-section]');
    if (!section) return;
    recordBaseline = recordBaseline ?? section.cloneNode(true);
    const selected = new Set([...section.querySelectorAll('input[name="matchId"]:checked')].map((input) => input.value));
    const tbody = section.querySelector('tbody');
    if (tbody) {
      tbody.textContent = '';
      for (const row of recordBaseline.querySelector('tbody').children) tbody.appendChild(row.cloneNode(true));
      tbody.querySelectorAll('button[type="submit"]').forEach((button) => button.removeAttribute('disabled'));
    }
    for (const operation of operations) {
      const ids = new Set(
          new URLSearchParams(operation.body).getAll('matchId'),
      );
      const table = document.querySelector('[data-match-table-form] table');
      if (table && operation.target !== '/matches/delete') {
        for (const id of ids) {
          if (table.querySelector(`tr[data-record-id="${CSS.escape(id)}"]`)) {
            continue;
          }
          if (
              location.pathname === '/' && operation.target !== '/matches/restore'
          ) continue;
          const html = operation.rows?.[id];
          if (!html) continue;
          const parsed = new DOMParser().parseFromString(
              `<table>${html}</table>`,
              'text/html',
          );
          const row = parsed.querySelector('tr[data-record-id]');
          if (!row) continue;
          row.querySelectorAll('button[type=\'submit\']').forEach((button) =>
              button.removeAttribute('disabled')
          );
          const checkbox = row.querySelector('input[name=\'matchId\']');
          checkbox?.removeAttribute('checked');
          checkbox?.removeAttribute('data-history-match-checkbox');
          checkbox?.removeAttribute('data-pending-match-checkbox');
          checkbox?.setAttribute(
              location.pathname === '/'
                  ? 'data-pending-match-checkbox'
                  : 'data-history-match-checkbox',
              '',
          );
          row.querySelector('[data-match-restore]')?.closest('td')?.remove();
          const primary = row.querySelector('td:last-child button');
          const heading = table.querySelector('th:last-child button');
          if (primary && heading) {
            primary.innerHTML = heading.innerHTML;
            primary.setAttribute(
                'aria-label',
                heading.getAttribute('aria-label'),
            );
            primary.setAttribute(
                'data-tooltip',
                heading.getAttribute('data-tooltip'),
            );
          }
          if (location.pathname === '/history') {
            const secondary = table.querySelector(
                '[data-match-secondary-bulk]',
            );
            if (secondary) {
              const cell = document.createElement('td');
              cell.className = 'table-action-cell';
              const button = /** @type {HTMLButtonElement} */ (secondary.cloneNode(true));
              button.removeAttribute('data-match-secondary-bulk');
              button.setAttribute('data-match-restore', '');
              button.name = 'matchId';
              button.value = id;
              cell.append(button);
              row.insertBefore(cell, row.lastElementChild);
            }
          }
          table.querySelector('tbody')?.append(row);
        }
      }
      for (const row of /** @type {NodeListOf<HTMLTableRowElement>} */ (document.querySelectorAll('tr[data-record-id]'))) {
        if (!ids.has(row.dataset.recordId)) continue;
        if (
            operation.target === '/matches/delete' ||
            (operation.target === '/matches/complete' &&
                location.pathname === '/')
        ) row.remove();
        else {
          row.dataset.recordStatus = operation.target === '/matches/restore'
              ? 'workspace'
              : 'history';
          const restore = row.querySelector('[data-match-restore]');
          if (restore) restore.hidden = row.dataset.recordStatus !== 'history';
        }
      }
    }
    for (
        const section of document.querySelectorAll('[data-match-table-section]')
        ) {
      const empty = !section.querySelector('tbody tr[data-record-id]');
      const form = section.querySelector('[data-match-table-form]');
      const message = section.querySelector('[data-match-empty-message]');
      if (form) form.hidden = empty;
      if (message) message.hidden = !empty;
    }
    for (const input of section.querySelectorAll('input[name="matchId"]')) input.checked = selected.has(input.value);
    globalThis.__matchTableFilterInit?.();
    globalThis.__matchTableRelativeTimeUpdate?.();
    globalThis.__matchTableOverflowUpdate?.();
    const rejected = all.filter((operation) => operation.delivery === 'rejected');
    showRecordStatus(rejected.length ? 'error' : all.some((operation) => !operation.delivery) ? 'pending' : '',
      rejected.map((operation) => operation.error).join('\n'));
  }

  /**
   * 使用现有保存文案和可展开错误样式显示记录队列状态。
   * @param {string} state pending、error 或空状态。
   * @param {string} details 可安全作为纯文本显示的错误详情。
   */
  function showRecordStatus(state, details = '') {
    const status = document.querySelector('[data-record-sync-status]');
    if (!status) return;
    status.hidden = !state;
    status.querySelector('summary').textContent = status.dataset[state] || '';
    status.querySelector('p').textContent = details;
  }

  /**
   * 记录读取开始时的本地版本，过期响应不能覆盖并发操作。
   * @return {{revision: number, readAt: number, projected: boolean}} 本次读取令牌。
   */
  function beginRecordRefresh() {
    return {revision: recordRevision, readAt: Date.now(), projected: recordProjected};
  }

  /**
   * 检查响应期间是否发生本地编辑或投递确认。
   * @param {{revision: number}} token 读取令牌。
   * @return {boolean} 可以应用当前响应。
   */
  function isRecordRefreshCurrent(token) {
    return token.revision === recordRevision;
  }

  /**
   * 保存局部刷新后的可见页面，以便断网重启看到已确认的结果。
   * @return {Promise<void>} 页面持久化完成。
   */
  async function savePage() {
    await ready;
    const name = `page:${location.pathname}${location.pathname === '/settings' && location.search === '?panel=polling' ? '' : location.search}`;
    const existing = await store.readState(userId, name);
    await store.writeState(userId, name, {...existing, html: capturePage(), recordReadAt});
    await store.prune(userId);
  }

  globalThis.addEventListener('online', () => {
    void ready.then(() => flush());
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void ready.then(() => flush());
  });
  document.addEventListener('application-records-rendered', (event) => {
    recordBaseline = document.querySelector('[data-match-table-section]')?.cloneNode(true);
    if (event.detail?.recordReadAt) recordReadAt = event.detail.recordReadAt;
    void applyPendingRecords().then(savePage).catch(() => {
    });
  });
  setInterval(() => {
    void ready.then(async () => {
      if ((await store.pending(userId)).length) await flush();
    }).catch(() => {
    });
  }, 5000);
  void ready.then(applyPendingRecords).catch(() => {
  });

  /**
   * 跟踪一次本地提交，落盘失败会阻止更新退出。
   * @param {Function} submit 提交方法。
   * @param {Array<unknown>} args 提交参数。
   * @return {Promise<Response>} 本地或服务器处理结果。
   */
  function tracked(submit, args) {
    const promise = submit(...args);
    writes.add(promise);
    promise.then(() => writes.delete(promise), () => writes.delete(promise));
    return promise;
  }

  /**
   * 保存仍处于防抖窗口内的设置，并等待本地事务结束。
   * @return {Promise<void>} 可以安全结束应用进程。
   */
  async function prepareForExit() {
    await ready;
    const saveSettings = globalThis.flushSettingsEdits ?? globalThis.saveSettingsNow;
    if (saveSettings && !await saveSettings()) {
      throw new Error('Settings are not saved');
    }
    while (writes.size) await Promise.all([...writes]);
  }

  // 公开的宿主接口按需或经动态脚本调用，保留已声明的控制能力。
  // noinspection JSUnusedGlobalSymbols
  globalThis.applicationSync = {
    ready,
    submitSettings: (...args) => tracked(submitSettings, args),
    submitRecords: (...args) => tracked(submitRecords, args),
    prepareForExit,
    applyPendingRecords,
    beginRecordRefresh,
    isRecordRefreshCurrent,
    showRecordStatus,
    flush,
    capturePage,
    userId,
  };
})();
