/** @file 统一悬浮、键盘和触屏长按提示；轻点不展示，长按不触发原操作。 */
// @ts-check
(() => {
  /** 长按时限与允许的手指移动距离。 */
  const holdMs = 500, moveTolerance = 10;
  /** 弹层与视口、目标间的留白。 */
  const padding = 8;
  /** 支持完整文本预览的表格元素。 */
  const clippedSelector =
    ".match-table-title-link.is-overflowing, .table-clip.is-overflowing, .match-detail-list.is-overflowing";
  /** 根层弹框避免被表格和设置面板裁剪。 */
  const tooltip = document.createElement("div");
  tooltip.id = "app-tooltip";
  tooltip.className = "app-tooltip";
  tooltip.hidden = true;
  tooltip.setAttribute("role", "tooltip");
  document.body.append(tooltip);
  /** @type {HTMLElement | undefined} 当前提示目标。 */
  let activeTarget;
  /** 长按提示在松手后仍保持可读。 */
  let touchPreview = false;
  /** 最近输入方式，用于过滤触摸产生的聚焦事件。 */
  let input = "keyboard";
  /** @type {{id: number; x: number; y: number; target: HTMLElement; surface: HTMLElement; timer: ReturnType<typeof setTimeout>} | undefined} 待识别长按。 */
  let press;
  /** @type {HTMLElement | undefined} 已消费长按的区域，阻止同一手势的后续点击。 */
  let blockedClick;

  /**
   * 查找提示目标；长按列的留白也能读取溢出的内容。
   * @param {EventTarget | null} node 事件目标。
   * @param {boolean} [includeClipped] 是否包含表格溢出内容。
   * @return {HTMLElement | undefined} 可展示的目标。
   */
  function findTarget(node, includeClipped = false) {
    if (!(node instanceof Element)) return undefined;
    const hint = node.closest("[data-tooltip]");
    if (hint instanceof HTMLElement && hint.dataset.tooltip?.trim()) {
      return hint;
    }
    if (
      !includeClipped || node.closest("button, input, select, textarea, label")
    ) return undefined;
    const clipped = node.closest(clippedSelector) ??
      node.closest(".match-table td")?.querySelector(clippedSelector);
    return clipped instanceof HTMLElement ? clipped : undefined;
  }

  /**
   * 提取纯文本，保留详情列表分行，不复制交互元素或不可信 HTML。
   * @param {HTMLElement} target 提示目标。
   * @return {string} 完整文案。
   */
  function labelFor(target) {
    if (target.dataset.tooltip) return target.dataset.tooltip.trim();
    if (target.matches(".match-detail-list")) {
      return Array.from(target.children).map((row) =>
        row.textContent?.trim() ?? ""
      ).join("\n");
    }
    return target.textContent?.trim() ?? "";
  }

  /**
   * 将弹层限制在可见视口内，兼容底部行、窄屏及屏幕键盘。
   * @return {void} 定位完成。
   */
  function positionTooltip() {
    if (!activeTarget) return;
    const viewport = globalThis.visualViewport;
    const width = viewport?.width ?? globalThis.innerWidth;
    const height = viewport?.height ?? globalThis.innerHeight;
    const leftEdge = (viewport?.offsetLeft ?? 0) + padding;
    const topEdge = (viewport?.offsetTop ?? 0) + padding;
    tooltip.style.maxWidth = `${Math.max(0, width - padding * 2)}px`;
    tooltip.style.maxHeight = `${
      Math.max(0, Math.min(height * 0.6, height - padding * 2))
    }px`;
    const rect = activeTarget.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const preferredLeft = document.documentElement.dir === "rtl"
      ? rect.left
      : rect.right - box.width;
    const left = Math.max(
      leftEdge,
      Math.min(preferredLeft, leftEdge + width - padding * 2 - box.width),
    );
    const bottom = topEdge + height - padding * 2;
    const preferredTop = rect.bottom + padding + box.height <= bottom
      ? rect.bottom + padding
      : rect.top - box.height - padding;
    const top = Math.max(topEdge, Math.min(preferredTop, bottom - box.height));
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  /**
   * 隐藏提示，保留目标原有的无障碍说明。
   * @return {void} 提示已关闭。
   */
  function hideTooltip() {
    if (activeTarget) {
      const ids = (activeTarget.getAttribute("aria-describedby") ?? "").split(
        /\s+/,
      ).filter((id) => id && id !== tooltip.id);
      if (ids.length) {
        activeTarget.setAttribute("aria-describedby", ids.join(" "));
      } else activeTarget.removeAttribute("aria-describedby");
    }
    activeTarget = undefined;
    touchPreview = false;
    tooltip.hidden = true;
  }

  /**
   * 展示文案，长按时允许在弹层内滚动完整内容，不抢占焦点。
   * @param {HTMLElement} target 提示目标。
   * @param {boolean} [touch] 是否由长按触发。
   * @return {void} 提示已显示。
   */
  function showTooltip(target, touch = false) {
    const label = labelFor(target);
    if (!label || !target.isConnected) return;
    hideTooltip();
    activeTarget = target;
    touchPreview = touch;
    tooltip.classList.toggle("is-touch-preview", touch);
    tooltip.classList.toggle(
      "is-content-preview",
      !target.hasAttribute("data-tooltip"),
    );
    tooltip.textContent = label;
    tooltip.scrollTop = 0;
    const ids = (target.getAttribute("aria-describedby") ?? "").split(/\s+/)
      .filter(Boolean);
    target.setAttribute("aria-describedby", [...ids, tooltip.id].join(" "));
    tooltip.hidden = false;
    positionTooltip();
  }

  /** @return {void} 清理长按计时器，不阻止页面滚动或缩放。 */
  function cancelPress() {
    if (press) clearTimeout(press.timer);
    press = undefined;
  }

  /** @return {void} 展示长按详情并消费此手势，避免松手跳转或执行按钮。 */
  function activatePress() {
    if (!press || !press.target.isConnected) return;
    blockedClick = press.surface;
    showTooltip(press.target, true);
  }

  document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") {
      document.documentElement.removeAttribute("data-hover-input");
      return;
    }
    document.documentElement.setAttribute("data-hover-input", "");
    input = "mouse";
    if (touchPreview) return;
    const target = findTarget(event.target);
    if (
      target &&
      !(event.relatedTarget instanceof Node &&
        target.contains(event.relatedTarget))
    ) showTooltip(target);
  });
  document.addEventListener("pointerout", (event) => {
    if (event.pointerType !== "mouse" || touchPreview) return;
    if (
      activeTarget &&
      !(event.relatedTarget instanceof Node &&
        activeTarget.contains(event.relatedTarget))
    ) hideTooltip();
  });
  document.addEventListener("pointerdown", (event) => {
    blockedClick = undefined;
    cancelPress();
    input = event.pointerType === "mouse" ? "mouse" : "touch";
    if (input === "touch") {
      document.documentElement.removeAttribute("data-hover-input");
    }
    if (event.target instanceof Node && tooltip.contains(event.target)) return;
    if (input === "mouse") {
      if (touchPreview || findTarget(event.target) !== activeTarget) {
        hideTooltip();
      }
      return;
    }
    hideTooltip();
    if (input !== "touch" || !event.isPrimary || event.button !== 0) return;
    const target = findTarget(event.target, true);
    if (!target) return;
    const surface = target.closest(".match-table td") ?? target;
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      target,
      surface: surface instanceof HTMLElement ? surface : target,
      timer: setTimeout(activatePress, holdMs),
    };
  }, true);
  document.addEventListener("pointermove", (event) => {
    if (!press || event.pointerId !== press.id) return;
    if (
      Math.hypot(event.clientX - press.x, event.clientY - press.y) >
        moveTolerance
    ) {
      blockedClick = press.surface;
      cancelPress();
    }
  }, { passive: true });
  document.addEventListener("pointerup", (event) => {
    if (event.pointerId === press?.id) cancelPress();
  });
  document.addEventListener("pointercancel", () => {
    cancelPress();
    hideTooltip();
  });
  document.addEventListener("contextmenu", (event) => {
    if (input !== "touch") return;
    if (press) activatePress();
    if (
      blockedClick && event.target instanceof Node &&
      blockedClick.contains(event.target)
    ) event.preventDefault();
  });
  document.addEventListener("click", (event) => {
    if (
      blockedClick && event.target instanceof Node &&
      blockedClick.contains(event.target)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
  }, true);
  document.addEventListener("click", (event) => {
    if (
      input !== "touch" && activeTarget &&
      findTarget(event.target) === activeTarget
    ) showTooltip(activeTarget);
  });
  document.addEventListener("focusin", (event) => {
    if (input === "touch") return;
    const target = findTarget(event.target);
    if (target?.matches(":focus-visible")) showTooltip(target);
  });
  document.addEventListener("focusout", (event) => {
    if (!touchPreview && findTarget(event.target) === activeTarget) {
      hideTooltip();
    }
  });
  document.addEventListener("keydown", (event) => {
    input = "keyboard";
    blockedClick = undefined;
    cancelPress();
    if (event.key === "Escape") hideTooltip();
  }, true);
  globalThis.addEventListener("scroll", (event) => {
    if (event.target instanceof Node && tooltip.contains(event.target)) return;
    cancelPress();
    if (touchPreview) hideTooltip();
    else positionTooltip();
  }, true);
  globalThis.addEventListener("resize", positionTooltip);
  globalThis.visualViewport?.addEventListener("resize", positionTooltip);
  globalThis.visualViewport?.addEventListener("scroll", positionTooltip);
  /** @return {void} 页面离开或进入后台时清理手势与弹层。 */
  function reset() {
    cancelPress();
    blockedClick = undefined;
    hideTooltip();
  }
  globalThis.addEventListener("blur", reset);
  globalThis.addEventListener("pagehide", reset);
  globalThis.addEventListener("popstate", reset);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset();
  });
  new MutationObserver(() => {
    if (
      (activeTarget && !activeTarget.isConnected) ||
      (press && !press.target.isConnected)
    ) reset();
  }).observe(document.body, { childList: true, subtree: true });

  /**
   * 头像完成加载后再显示，避免内联事件与破损图片。
   * @param {HTMLImageElement} image 待加载头像。
   * @return {void} 回调已安装。
   */
  function revealImageAfterLoad(image) {
    const reveal = () => {
      image.hidden = false;
    };
    if (image.complete && image.naturalWidth > 0) reveal();
    else image.addEventListener("load", reveal, { once: true });
  }
  document.querySelectorAll("img[data-reveal-on-load]").forEach((image) => {
    if (image instanceof HTMLImageElement) revealImageAfterLoad(image);
  });
})();
