/**
 * @file 本文件负责将自定义提示框渲染到页面根节点，避免被父容器裁剪或遮挡。
 */
// @ts-check

(() => {
  const tooltipGap = 8;
  const viewportPadding = 8;
  const tooltip = document.createElement('div');
  tooltip.className = 'app-tooltip';
  tooltip.hidden = true;
  tooltip.setAttribute('role', 'tooltip');
  document.body.append(tooltip);

  /**
   * 当前显示提示框的触发元素。
   *
   * @type {HTMLElement | undefined}
   */
  let activeTarget;

  /**
   * 从事件目标中获取带提示文案的元素。
   *
   * @param {EventTarget | null} target 事件目标。
   * @return {HTMLElement | undefined} 提示框触发元素。
   */
  function findTooltipTarget(target) {
    if (!(target instanceof Element)) return undefined;
    const element = target.closest('[data-tooltip]');
    return element instanceof HTMLElement ? element : undefined;
  }

  /**
   * 将提示框定位在触发元素下方；底部空间不足时显示在其上方。
   *
   * @param {HTMLElement} target 提示框触发元素。
   */
  function positionTooltip(target) {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const maximumLeft = Math.max(
        viewportPadding,
        globalThis.innerWidth - tooltipRect.width - viewportPadding,
    );
    const preferredLeft = document.documentElement.dir === 'rtl'
        ? targetRect.left
        : targetRect.right - tooltipRect.width;
    const left = Math.min(
        Math.max(preferredLeft, viewportPadding),
        maximumLeft,
    );
    const belowTop = targetRect.bottom + tooltipGap;
    const aboveTop = targetRect.top - tooltipRect.height - tooltipGap;
    const top = belowTop + tooltipRect.height <=
    globalThis.innerHeight - viewportPadding ||
    aboveTop < viewportPadding
        ? belowTop
        : aboveTop;

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  /**
   * 显示指定元素的提示框。
   *
   * @param {HTMLElement} target 提示框触发元素。
   */
  function showTooltip(target) {
    const label = target.dataset.tooltip?.trim();
    if (!label) return;
    activeTarget = target;
    tooltip.textContent = label;
    tooltip.hidden = false;
    positionTooltip(target);
  }

  /**
   * 隐藏当前提示框。
   */
  function hideTooltip() {
    activeTarget = undefined;
    tooltip.hidden = true;
  }

  /**
   * 在上传头像加载成功后显示它，避免使用被 CSP 禁止的内联 onload 属性。
   *
   * @param {HTMLImageElement} image 需要在加载成功后显示的头像。
   */
  function revealImageAfterLoad(image) {
    const reveal = () => {
      image.hidden = false;
    };
    if (image.complete && image.naturalWidth > 0) {
      reveal();
      return;
    }
    image.addEventListener('load', reveal, {once: true});
  }

  /**
   * 初始化需要在资源加载后显示的头像。
   */
  function initializeDeferredImages() {
    document.querySelectorAll('img[data-reveal-on-load]').forEach((image) => {
      if (image instanceof HTMLImageElement) revealImageAfterLoad(image);
    });
  }

  /**
   * 判断事件的 relatedTarget 是否仍位于提示框目标内部。
   *
   * @param {Element} target 提示框目标。
   * @param {EventTarget|null} related 事件的 relatedTarget。
   * @return {boolean} 仍在目标内部时返回 true。
   */
  function containsRelatedTarget(target, related) {
    return related instanceof Node && target.contains(related);
  }

  document.addEventListener('pointerover', (event) => {
    const target = findTooltipTarget(event.target);
    if (!target || containsRelatedTarget(target, event.relatedTarget)) return;
    showTooltip(target);
  });

  document.addEventListener('pointerout', (event) => {
    const target = findTooltipTarget(event.target);
    if (
        !target || target !== activeTarget ||
        containsRelatedTarget(target, event.relatedTarget)
    ) {
      return;
    }
    hideTooltip();
  });

  document.addEventListener('focusin', (event) => {
    const target = findTooltipTarget(event.target);
    if (target) showTooltip(target);
  });

  document.addEventListener('focusout', (event) => {
    if (findTooltipTarget(event.target) === activeTarget) hideTooltip();
  });

  document.addEventListener('click', (event) => {
    const target = findTooltipTarget(event.target);
    if (target && target === activeTarget) showTooltip(target);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideTooltip();
  });

  globalThis.addEventListener('resize', () => {
    if (activeTarget) positionTooltip(activeTarget);
  });
  globalThis.addEventListener('scroll', () => {
    if (activeTarget) positionTooltip(activeTarget);
  }, true);
  initializeDeferredImages();
})();
