/** @file 在实际设置页检查原输入框身份、盒模型、文字过渡与结束恢复。 */
globalThis.entryProbe = 'pending';
globalThis.entryStage = 'import';
try {
  const {playPlagueDoctorAdvent, plagueDoctorAdventSchedule} = await import('/static/fun/lobotomy-corp/Events/PlagueDoctor.js');
  await new Promise((resolve) => {
    if (document.readyState !== 'loading') resolve();
    else document.addEventListener('DOMContentLoaded', resolve, {once: true});
  });
  globalThis.entryStage = 'ready';
  const input = document.querySelector('[data-account-display-name-input]');
  const parent = input.parentElement;
  const form = input.form;
  const formId = form.getAttribute('id');
  const original = {value: input.value, style: input.getAttribute('style'), className: input.className,
    readonly: input.getAttribute('readonly'), next: input.nextSibling};
  const before = getComputedStyle(input);
  const appearance = Object.fromEntries(['fontSize', 'paddingLeft', 'paddingRight', 'borderRadius', 'borderTopWidth', 'textAlign', 'backgroundColor'].map((key) => [key, before[key]]));
  const width = input.getBoundingClientRect().width;
  const height = input.getBoundingClientRect().height;
  const names = ['这是一个很长的显示名称用来检查文字内边距和遮挡', '第二名使徒', ...Array(10).fill('使徒')];
  const originalNow = performance.now;
  let time = 0;
  performance.now = () => time;
  const frame = async (at) => {
    globalThis.entryStage = 'frame ' + at;
    time = at;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };
  const assert = (value, message) => { if (!value) throw new Error(message); };
  try {
    for (const {interrupted, centered} of [{interrupted: true}, {interrupted: false}, {interrupted: true, centered: true}]) {
      if (centered) {
        Object.assign(input.style, {position: 'fixed', width: width + 'px', height: height + 'px',
          left: (innerWidth - width) / 2 + 'px', top: (innerHeight - height) / 2 + 'px'});
      }
      const expectedStyle = input.getAttribute('style');
      time = 0;
      let ended = false;
      const event = playPlagueDoctorAdvent({assetRoot: '/static/fun/lobotomy-corp/Assets', names,
        focusTexts: names, onAdventEnd: () => { ended = true; assert(input.parentElement === parent, 'field must be restored before completion callback'); }});
      assert(document.querySelector('.lobotomy-corp-plague-doctor-advent-focus-input') === input, 'temporary input replaced the real field');
      assert(input.form === form, 'field lost its original form association');
      const during = getComputedStyle(input);
      for (const [key, value] of Object.entries(appearance)) assert(during[key] === value, key + ' changed: ' + during[key] + ' / ' + value);
      assert(Math.abs(input.offsetWidth - width) < 1 && Math.abs(input.offsetHeight - height) < 1, 'source control dimensions changed');
      await frame(4000);
      await frame(4500);
      const entity = document.querySelector('.lobotomy-corp-plague-doctor-advent-world-entity');
      assert(!entity.hidden && getComputedStyle(input).color.endsWith(', 0)'), 'text appeared before WhiteNight left');
      await frame(5000);
      assert(entity.hidden && getComputedStyle(input).color.endsWith(', 0)'), 'handoff did not hide WhiteNight before text');
      await frame(5400);
      assert(input.value === names[0], 'first apostle name missing');
      const visible = getComputedStyle(input).color;
      await frame(9000);
      await frame(9100);
      const fading = getComputedStyle(input).color;
      assert(input.value === names[0] && fading !== visible && fading.startsWith('rgba('), 'old text did not fade out');
      await frame(9230);
      assert(input.value === names[1] && getComputedStyle(input).color.startsWith('rgba('), 'new text did not fade in');
      await frame(9600);
      assert(getComputedStyle(input).color === visible, 'text opacity did not recover');
      if (interrupted) event.dispose();
      else await frame(plagueDoctorAdventSchedule(12).totalMs);
      assert(ended === !interrupted, 'completion callback mismatch');
      assert(input.parentElement === parent && input.nextSibling === original.next, 'field position not restored');
      assert(input.form === form && form.getAttribute('id') === formId, 'form association not restored');
      const actual = {value: input.value, className: input.className, style: input.getAttribute('style'), readonly: input.getAttribute('readonly')};
      assert(actual.value === original.value && actual.className === original.className &&
        (actual.style || null) === (expectedStyle || null) && actual.readonly === original.readonly,
      'field state not restored: ' + JSON.stringify({interrupted, actual, expected: {...original, style: expectedStyle, next: undefined}}));
      if (original.style == null) input.removeAttribute('style');
      else input.setAttribute('style', original.style);
    }
  } finally {
    performance.now = originalNow;
  }
  console.log('ADVENT_REAL_INPUT_OK', JSON.stringify({width, height, appearance}));
  globalThis.entryProbe = 'passed';
} catch (error) {
  globalThis.entryProbe = String(error);
}
