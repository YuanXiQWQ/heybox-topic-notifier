/**
 * @file 本文件提供无需认证即可读取的站点图标响应。
 */

/**
 * 小黑盒应用图标的 PNG Base64 数据。
 */
const faviconPngBase64 = [
  "iVBORw0KGgoAAAANSUhEUgAAAPsAAAD7CAMAAACbrBKUAAAAn1BMVEXx8vM5PD/r7O3O0NFydHd+gILw8fHs7e7u7/Du7u9bXmBER0rk5eZAQ0bAwcONkJJ4en1SVVhJTE87PkHn6Ond3t/X2Nq6u72ys7Wdn6FYWl3x8vLg4uNrbW9jZmjT1NaVl5mAg4U9QEPGx8nKzM2mp6lfYWROUVPMzs+pq62jpKaIi41wcnTR0tNGSUysra+KjI6GiIpMT1FFSEuJi41uXjzMAAAEhUlEQVR42uzdi1JaMRSF4b0QjoCgXOTWApaK1BvW2r7/s7XBdjJThEIHkpi1/jf4JuNw9jlOtimllFJKKaWUUkoppZRSSimllFJKKaV276Ox9lF2yrjthYXtov3csCQqQp/7GMD3+6olUBH63E/g+nBu8Qt67t4OPPZt/7I4dwCfLy5tv/KxA52bwvYpJ/u+f/Z52YHHK9u53OzofmvYjmVn3+PXPkP7zn/2Wdp3/LXP1L7Tr32udqBzV9j28rUD9WvbWs52oNWzLeVtR/NTyTaWuR34MixsQ9nbgemtvR2BHaiM7a0o7GiOarYehx1oD2wtFjswWZtueezr0y2RfW26pbL/Nd2S2YGyn27p7PDTLZ8d6HwtzMVoBxar6ZbT/jrdvgN76e6mdkC7n26TtxfDL8DooHY/3aZtv50CQOWwdj/dJmwfz4Aj2oHZOFF7bdTEke04G9VStA/awBHtfrpNzn41AYLY3XSblL3x0EUwO7oPjWTs1ZsnIKAdeLqppmE//wAEs/vpNgF7vwwEtfvpNrL98uIzgtv9dBvRXnztADHsfrqNZV8ugKh2YLGMY583Ed2O5jyGvdpGAna0qxHsQyRhxzCCvXJ4e6eL/atEsJcPbr+wXgV7V87Cfmtm8ymn/eT3Sy9au1npU5PWbtZrhbFXE7SbXdePb68mee6/Ku46R7cneu6vIyKt3az/yGt3r4R47Va9P6O1mzW+dWntZssJr92KT7x2sxaxvU9stymxvSL7+7Yvsbll5vbLLjbVvczcbg/Y1IPlbi9Gi/pbLUZF9vYtyS677LLLLrvssssuu+yyy76DvUZrrxGfe4363GWXXXbZZZdddtlll/1/7KXnl7O3enkuZW9vYVOt3O0NbK6RuT2h/zmR/dD2FrG9TmzHCbF9UvDaMTvltePDOa8deOzz2t1dHLT21R4FWjtQv+a1A60er93dNElrB16GBa0dmM557UBlnKD9NIwdzdFpYvbTMHZ/0+Sc0w5M5rVKFvYZ/quD22cR7INE7IMI9qKehL1eRLBbv5OAvXNlMezWK0e3l3sW1u47r0ey+5dD0exW3DxFsPsLemPYfY0f3dB2fzFzJLvvahLU7i/kTsBuNmgHs/vH40TsVhudBbH7C/jTsbt1CwHsfvFCUnazk2kQu1u4kZzd3TR5RLtftJKi3d80eQS7f+2ZqN2s1zqOffbndXfCdrPrxTHsd68LtRK3u0vpD28vBueFpW/3N00exu57D3a3hILX7m6a5LVb9f47rX110ySt3U23vHY33fLa7XTUpLWbjSu8drdHgdduxfCF1r6abmntbrrltbs9Crx29xGH1r7aqZmSvWRBu5okYy+Fs/vHXF67251Ma3cfcXjtblc6r919xKG1rx5zae3uMZfX7h5zee1uXRitffURh9bu1oXx2t1HHF7773VhY9tennazxnP7wv5RrvZ/J7vssssuu+yyyy677LLLLrvsxprsnMnOmeycyc6Z7JzJzpnsnMn+cyMTjPp9ZIJRv49MMOr3kQlGtt95mEYq4AEA0Tdj8kbuGBgAAAAASUVORK5CYII=",
].join("");

/**
 * 解码 Base64 字符串。
 *
 * @param {string} value 待解码的 Base64 字符串。
 * @return {Uint8Array} 解码后的字节数组。
 */
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * 已解码的站点图标 PNG 数据。
 */
const faviconPng = decodeBase64(faviconPngBase64);

/**
 * 创建可公开缓存的站点图标响应。
 *
 * @return {Response} 站点图标响应。
 */
export function faviconResponse(): Response {
  return new Response(faviconPng.slice(), {
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "image/png",
    },
  });
}
