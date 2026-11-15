/** @file 在服务器隔离浏览器展示官方验证，仅转发用户的鼠标键盘输入。 */
import { chromium } from "npm:playwright@1.64.0";
import { isAbsolute } from "node:path";
import {
  requireSdkCaptcha,
  requireSdkCaptchaReceipt,
} from "../../src/services/heybox_sdk_captcha.ts";

/** 隔离支持目录，验证回执不能写入日志或页面。 */
const root = Deno.args[0] ?? "";
if (Deno.args.length !== 1 || !isAbsolute(root)) {
  throw new Error("Private support directory required");
}
/** 操作目录必须归当前账号独占，不能指向个人浏览器目录。 */
const info = await Deno.lstat(root);
if (
  !info.isDirectory || info.isSymlink ||
  (Deno.build.os !== "windows" &&
    ((info.mode! & 0o077) !== 0 || info.uid !== Deno.uid()))
) throw new Error("Private support directory required");
/** 上游提供的公开验证码应用编号。 */
const challenge = requireSdkCaptcha(
  JSON.parse(await Deno.readTextFile(`${root}/challenge.json`)).challenge,
);
if (!challenge) throw new Error("No pending verification challenge");
/** 仅绑定服务器回环，客户端通过隐藏的 SSH 转发访问。 */
const port = 28793;
/** 会话内操作校验符，只嵌入同源控制页面。 */
const csrf = crypto.randomUUID();
/** 浏览器状态不会包含验证回执内容。 */
let received = false, ready = false;
/** 独立浏览器保留正常沙箱，不接触个人浏览器配置。 */
const context = await chromium.launchPersistentContext(`${root}/profile`, {
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  chromiumSandbox: true,
  viewport: { width: 960, height: 720 },
  args: ["--disable-dev-shm-usage"],
});
/** 固定验证页面，不接受任意导航地址。 */
const page = context.pages()[0] ?? await context.newPage();
/**
 * 接收官方页面返回的真实票据，只保存一次，不输出内容。
 * @param {unknown} value 官方验证码回调。
 * @return {Promise<void>} 合法回执已写入私有文件。
 */
async function receiveProof(value: unknown): Promise<void> {
  if (received) return;
  const proof = value as { ret?: number; ticket?: string; randstr?: string };
  if (proof?.ret !== 0) return;
  const receipt = requireSdkCaptchaReceipt(
    {
      challengeId: challenge!.id,
      ticket: proof.ticket,
      randstr: proof.randstr,
      receivedAt: Date.now(),
    },
    challenge,
    Date.now(),
  );
  await Deno.writeTextFile(`${root}/proof.json`, JSON.stringify(receipt), {
    mode: 0o600,
    createNew: true,
  });
  received = true;
}
await page.exposeFunction("captchaCallback", receiveProof);
/** 官方验证码使用动态脚本，回调仅替代原生客户端的消息传递。 */
const target =
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小黑盒官方安全验证</title>
<style>body{font:18px sans-serif;background:#f5f5f5;text-align:center;padding:30px}button{padding:14px 24px;font-size:18px}</style>
<p>此页面在服务器的隔离浏览器中运行。</p><p>请亲自完成下方官方人机验证。</p><button id="show">打开验证</button>
<script src="https://turing.captcha.qcloud.com/TCaptcha.js"></script><script>
let widget;
document.getElementById('show').onclick=()=>{widget=new TencentCaptcha(${
    JSON.stringify(challenge.appId)
  },result=>{
if(result.ret===0&&!String(result.ticket).startsWith('trerror_')){window.captchaCallback(result).then(()=>{document.getElementById('show').textContent='回执已收到，等待服务器验证';}).catch(()=>{document.getElementById('show').textContent='回执保存失败，请检查服务';});}
},{userLanguage:'zh-cn'});widget.show();};
</script>`;
/** 控制页面仅提供截图和受限输入，不提供命令执行或任意页面访问。 */
const viewer =
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>服务器隔离验证</title>
<style>body{font:16px sans-serif;background:#eee;margin:16px}canvas{max-width:100%;height:auto;border:1px solid #aaa;touch-action:none}#state{margin:10px 0}</style>
<h2>服务器隔离验证</h2><p>请在下方页面点击“打开验证”，亲自完成官方人机验证。操作只影响云端隔离浏览器。</p><div id="state">正在连接…</div><canvas id="screen" width="960" height="720" tabindex="0"></canvas>
<script>
const canvas=document.getElementById('screen'),ctx=canvas.getContext('2d'),state=document.getElementById('state');let queue=Promise.resolve(),down=false,lastMove=0;
/**
 * 顺序传递受限输入。
 * @param {object} input 当前鼠标或键盘动作。
 */
function send(input){queue=queue.then(()=>fetch('/input',{method:'POST',headers:{'content-type':'application/json','x-control':${
    JSON.stringify(csrf)
  }},body:JSON.stringify(input)})).catch(()=>{});}
/**
 * 将浏览器坐标映射到固定截图。
 * @param {PointerEvent} e 指针事件。
 * @return {{x: number, y: number}} 受限截图坐标。
 */
function position(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(959,(e.clientX-r.left)*960/r.width)),y:Math.max(0,Math.min(719,(e.clientY-r.top)*720/r.height))};}
canvas.onpointerdown=e=>{e.preventDefault();down=true;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);send({kind:'down',...position(e)});};
canvas.onpointermove=e=>{if(down&&performance.now()-lastMove>30){lastMove=performance.now();send({kind:'move',...position(e)});}};
canvas.onpointerup=e=>{down=false;send({kind:'up',...position(e)});};
canvas.onkeydown=e=>{if(e.key.length===1||['Backspace','Enter','Tab','ArrowLeft','ArrowRight','Escape'].includes(e.key)){e.preventDefault();send({kind:'key',key:e.key});}};
/**
 * 更新截图，不读取或推断验证码答案。
 * @return {Promise<void>} 本次画面已经更新。
 */
async function frame(){try{const s=await(await fetch('/status')).json();state.textContent=s.received?'验证回执已收到，正在等待服务端核验。':s.ready?'已连接，请完成验证。':'浏览器正在加载…';const response=await fetch('/frame');if(response.ok){const bitmap=await createImageBitmap(await response.blob());ctx.drawImage(bitmap,0,0);bitmap.close();}}catch{}setTimeout(frame,500);}frame();
</script>`;
/** 串行执行由用户产生的输入，拒绝未知命令。 */
let inputQueue: Promise<void> = Promise.resolve();
/** 截图共用一份在途结果，限制并发内存。 */
let screenshot: Promise<Uint8Array> | undefined;
/** 拒绝无限输入排队，控制服务仅用于短时人工验证。 */
let pendingInputs = 0;
/** 回环服务不允许跨源控制或被其它页面嵌入。 */
const server = Deno.serve(
  { hostname: "127.0.0.1", port, onListen: () => {} },
  /**
   * 只接受固定回环路由，同源校验通过后才转发有限的用户操作。
   * @param {Request} request 控制页面请求。
   * @return {Promise<Response>} 无回执内容的状态、截图或操作结果。
   */
  async (request) => {
    const url = new URL(request.url);
    const headers = {
      "cache-control": "no-store",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
    };
    if (url.host !== `127.0.0.1:${port}`) {
      return new Response("Forbidden", {
        status: 403,
      });
    }
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(viewer, {
        headers: { ...headers, "content-type": "text/html; charset=utf-8" },
      });
    }
    if (request.method === "GET" && url.pathname === "/captcha") {
      return new Response(target, {
        headers: { ...headers, "content-type": "text/html; charset=utf-8" },
      });
    }
    if (request.method === "GET" && url.pathname === "/status") {
      return Response
        .json({ ready, received }, { headers });
    }
    if (request.method === "GET" && url.pathname === "/frame") {
      screenshot ??= page.screenshot({ type: "png" }).finally(() =>
        screenshot = undefined
      );
      return new Response(new Uint8Array(await screenshot).buffer, {
        headers: { ...headers, "content-type": "image/png" },
      });
    }
    if (
      request.method !== "POST" || url.pathname !== "/input" ||
      request.headers.get("origin") !== url.origin ||
      request.headers.get("x-control") !== csrf
    ) return new Response("Forbidden", { status: 403 });
    if (pendingInputs >= 32 || received) {
      return new Response("Busy", { status: 429 });
    }
    const reader = request.body?.getReader();
    if (!reader) return new Response("Invalid", { status: 400 });
    let text = "";
    try {
      const decoder = new TextDecoder();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
        if (text.length > 1024) return new Response("Invalid", { status: 400 });
      }
    } finally {
      await reader.cancel();
    }
    let value;
    try {
      value = JSON.parse(text);
      if (!value || typeof value !== "object") throw new Error();
    } catch {
      return new Response("Invalid", { status: 400 });
    }
    pendingInputs++;
    inputQueue = inputQueue.catch(() => {}).then(async () => {
      if (value.kind === "key") {
        if (typeof value.key !== "string") return;
        if (value.key.length === 1) await page.keyboard.insertText(value.key);
        else if (
          ["Backspace", "Enter", "Tab", "ArrowLeft", "ArrowRight", "Escape"]
            .includes(value.key)
        ) await page.keyboard.press(value.key);
        return;
      }
      if (
        !["down", "move", "up"].includes(value.kind) ||
        !Number.isFinite(value.x) || !Number.isFinite(value.y) || value.x < 0 ||
        value.x > 959 || value.y < 0 || value.y > 719
      ) return;
      await page.mouse.move(value.x, value.y);
      if (value.kind === "down") await page.mouse.down();
      if (value.kind === "up") await page.mouse.up();
    });
    try {
      await inputQueue;
      return Response.json({ ok: true }, { headers });
    } finally {
      pendingInputs--;
    }
  },
);
await page.goto(`http://127.0.0.1:${port}/captcha`, {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
ready = true;
/**
 * 退出或达到运行期限时关闭浏览器和回环端口。
 * @return {Promise<void>} 资源已释放。
 */
async function shutdown(): Promise<void> {
  await server.shutdown();
  await context.close();
}
/** 系统停止信号共用有序关闭入口。 */
const onStop = () => {
  void shutdown();
};
Deno.addSignalListener("SIGTERM", onStop);
/** 验证窗口最多运行半小时，不作为常驻取数依赖。 */
const deadline = setTimeout(onStop, 1800000);
console.log(JSON.stringify({ event: "captcha_control_ready", port }));
try {
  await server.finished;
} finally {
  clearTimeout(deadline);
  Deno.removeSignalListener("SIGTERM", onStop);
  await context.close();
}
