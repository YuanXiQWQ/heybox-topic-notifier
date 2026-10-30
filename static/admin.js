/** @file 管理表单的本地时间转换与重复提交反馈。 */
for (const form of document.querySelectorAll(".admin-panel form")) {
  form.addEventListener("submit", () => {
    const expires = form.querySelector('input[name="expiresAt"]');
    if (expires instanceof HTMLInputElement && expires.value) {
      const value = new Date(expires.value).toISOString();
      expires.type = "hidden";
      expires.value = value;
    }
    for (const button of form.querySelectorAll('button[type="submit"]')) {
      if (button instanceof HTMLButtonElement) button.disabled = true;
    }
  });
}

/** 恢复浏览器返回页面时的提交按钮，表单仍由服务器重新验证。 */
addEventListener("pageshow", () => {
  for (
    const button of document.querySelectorAll(
      '.admin-panel button[type="submit"]',
    )
  ) {
    if (button instanceof HTMLButtonElement) button.disabled = false;
  }
});
