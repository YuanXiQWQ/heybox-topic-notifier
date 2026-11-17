/** @file 在真实设置页验证日期选择、草稿保存、重复开关弹窗和卡片排序。 */
globalThis.entryProbe = 'pending';
try {
  if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once: true}));
  /** @param {boolean} value 断言结果。 @param {string} message 失败说明。 */
  const check = (value, message) => { if (!value) throw new Error(message); };
  /** @return {Promise<void>} 等待布局稳定。 */
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await frame();
  const root = document.querySelector('[data-schedule-page]');
  const list = root.querySelector('[data-schedule-list]');
  const dialog = root.querySelector('[data-schedule-dates]');
  const calendar = dialog.querySelector('[data-schedule-calendar]');
  const era = dialog.querySelector('[data-schedule-era]');
  const fields = side => dialog.querySelector(`[data-schedule-date="${side}"]`);
  const field = (side, part) => fields(side).querySelector(`[data-date-part="${part}"]`);
  const state = () => JSON.parse(root.querySelector('[name="pollSchedule"]').value);
  let saves = 0;
  globalThis.scheduleAutoSave = () => { saves++; };
  check(!root.hidden && list.children.length === 2, 'real advanced settings page must be initialized');
  check(!root.querySelector('.schedule-drag-instruction'), 'redundant drag instruction');
  const [first, second] = list.children;
  check(second.getBoundingClientRect().top - first.getBoundingClientRect().bottom >= 15, 'cards need visible spacing');
  const handle = first.querySelector('[data-schedule-drag]');
  const actions = first.querySelector('.schedule-actions');
  for (const button of [handle, ...actions.children]) {
    check(getComputedStyle(button).backgroundColor !== 'rgba(0, 0, 0, 0)', 'action needs a visible surface');
    check(getComputedStyle(button).backgroundColor !== getComputedStyle(first).backgroundColor, 'action surface must differ from card');
    check(button.getBoundingClientRect().height >= 44, 'action needs a full touch target');
  }
  const card = first.getBoundingClientRect(), drag = handle.getBoundingClientRect(), footer = actions.getBoundingClientRect();
  check(Math.abs(drag.left - card.left - 1) < 1 && Math.abs(drag.top - card.top - 1) < 1, 'drag surface must meet card edges');
  check(Math.abs(footer.right - card.right + 1) < 1 && Math.abs(footer.bottom - card.bottom + 1) < 1, 'action surface must meet card edges');
  check(document.documentElement.scrollWidth <= innerWidth + 1, 'page must not overflow horizontally');
  first.querySelector('[data-schedule-range]').click();
  await frame();
  const controls = () => dialog.querySelectorAll('input,select').length;
  const initialControls = controls();
  check(calendar instanceof HTMLSelectElement && era instanceof HTMLSelectElement, 'calendar and era must be native selects');
  check(!dialog.querySelector('datalist,input[list],input[type="text"]'), 'date picker must not create editable suggestions');
  check([...calendar.options].map(option => option.value).join() === 'gregory,chinese', 'both calendar choices must remain available');
  check([...era.options].map(option => option.value).join() === 'ce,roc,ganzhi', 'all applicable eras must remain available');
  check(!field('start', 'cycle').getBoundingClientRect().width, 'hidden cycle must not duplicate the year');
  check(field('start', 'time').value === '10:00' && field('end', 'time').value === '21:00', 'existing times must be retained');
  /** @param {HTMLElement} control 日期控件。 @param {string} value 用户选择或数字输入。 */
  const choose = (control, value) => {
    control.value = value;
    control.dispatchEvent(new Event('input', {bubbles: true}));
    control.dispatchEvent(new Event('change', {bubbles: true}));
  };
  choose(field('start', 'year'), '2024');
  check(state().rows[0].start === '2024--T10:00', 'incomplete date must be saved as a draft');
  choose(field('start', 'month'), '01');
  choose(field('start', 'day'), '31');
  choose(field('start', 'month'), '02');
  check(field('start', 'day').value === '31' && field('start', 'day').getAttribute('aria-invalid') === 'true', 'changing month must preserve and flag the invalid day');
  check(field('start', 'day').selectedOptions[0].disabled, 'invalid retained day must not become a selectable date');
  choose(field('start', 'day'), '29');
  choose(field('start', 'year'), '2023');
  check(field('start', 'day').getAttribute('aria-invalid') === 'true', 'non-leap year must flag February 29');
  choose(field('start', 'year'), '2024');
  for (const [part, value] of [['year', '2024'], ['month', '02'], ['day', '29']]) choose(field('end', part), value);
  check(state().rows[0].start === '2024-02-29T10:00' && state().rows[0].end === '2024-02-29T21:00', 'complete date must reach the saved schedule');
  check(field('start', 'day').getAttribute('aria-invalid') === 'false', 'restored leap date must become valid');
  const original = state().rows[0].start;
  choose(calendar, 'chinese');
  check(state().rows[0].calendar === 'chinese', 'calendar selection must update state');
  choose(calendar, 'gregory');
  check(state().rows[0].start === original, 'calendar round-trip must preserve the instant');
  choose(era, 'ganzhi');
  check(field('start', 'year').hidden && !field('start', 'cycle').hidden, 'cycle must replace the numeric year');
  choose(era, 'ce');
  check(!field('start', 'year').hidden && field('start', 'cycle').hidden && state().rows[0].start === original, 'era round-trip must restore the date and exactly one year control');
  for (const side of ['start', 'end']) choose(field(side, 'year'), '1948');
  check(!era.querySelector('[value="roc"]').disabled, 'valid historical date must enable ROC era');
  choose(era, 'roc');
  check(field('start', 'year').value === '37', 'historical era must display its own year');
  choose(era, 'ce');
  for (let repeat = 0; repeat < 3; repeat++) {
    root.querySelector('[data-schedule-close]').click();
    first.querySelector('[data-schedule-range]').click();
    check(controls() === initialControls && !dialog.querySelector('datalist'), 'reopening dialog must not duplicate controls');
    check(field('start', 'year').value === '1948', 'reopening dialog must preserve edits');
  }
  root.querySelector('[data-schedule-close]').click();
  first.querySelector('[data-schedule-add]').click();
  check(state().rows.length === 3 && state().rows[2].id === 'second', 'add inserts immediately after the selected card');
  const added = list.children[1];
  added.querySelector('[data-schedule-drag]').dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
  check(state().rows[1].id === 'second' && list.children[1].dataset.id === 'second', 'reordering must update both saved priority and DOM');
  added.querySelector('[data-schedule-remove]').click();
  check(state().rows.length === 2 && state().rows[0].start === '1948-02-29T10:00', 'removing added card must preserve the edited date');
  check(saves > 0, 'edits must use the existing autosave callback');
  list.children[0].querySelector('[data-schedule-range]').click();
  await frame();
  console.log('POLLING_SETTINGS_OK', JSON.stringify({controls: controls(), saves, width: innerWidth}));
  globalThis.entryProbe = 'passed';
} catch (error) {
  globalThis.entryProbe = String(error.stack || error);
}
