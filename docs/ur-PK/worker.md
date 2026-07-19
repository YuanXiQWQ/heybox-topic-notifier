<div dir="rtl" lang="ur-PK" align="right">

# Notification relay Worker

`notification-relay.js` Cloudflare Workers کے لیے ایک lightweight relay ہے، جو صرف یہ فراہم کرتا ہے:

- &rlm;`POST /pushplus` -> `https://www.pushplus.plus/send`
- &rlm;`POST /wxpusher` -> `https://wxpusher.zjiecode.com/api/send/message/simple-push`
- &rlm;`POST /serverchan` -> Server酱 official API
- &rlm;`GET /healthz` health check

یہ arbitrary target URL قبول نہیں کرتا، اس لیے اسے open proxy کے طور پر استعمال نہیں کیا جا سکتا۔ Server酱 entry صرف secure
SendKey قبول کرتی ہے، اور project کے existing rules کے مطابق official address بناتی ہے۔

## Deployment steps

1. Cloudflare Workers میں ایک free Worker بنائیں۔
2. `workers/notification-relay.js` کا content Worker editor میں paste کریں، یا Wrangler سے اس script کو deploy کریں۔
3. Worker variables/secrets میں `RELAY_TOKEN` شامل کریں، value کے طور پر ایک long random secret استعمال کریں۔
4. Deployment کے بعد `https://<your-worker>.workers.dev/healthz` visit کریں، اور confirm کریں کہ `{"status":"ok"}` return ہو رہا ہے۔
5. Deno Deploy configure کریں:

<pre dir='ltr' align='left'><code class='language-env'>NOTIFIER_PUSHPLUS_SEND_URL=https://&lt;your-worker&gt;.workers.dev/pushplus
NOTIFIER_WXPUSHER_SEND_URL=https://&lt;your-worker&gt;.workers.dev/wxpusher
NOTIFIER_SERVER_CHAN_SEND_URL=https://&lt;your-worker&gt;.workers.dev/serverchan
NOTIFIER_RELAY_TOKEN=&lt;same-random-secret&gt;
</code></pre>

Project side صرف تب درج ذیل بھیجے گا جب PushPlus، WxPusher یا Server酱 send address relay address میں بدل دیا گیا ہو:

<pre dir='ltr' align='left'><code class='language-http'>Authorization: Bearer &lt;NOTIFIER_RELAY_TOKEN&gt;
</code></pre>

Server酱 relay dedicated request header سے SendKey بھی pass کرے گا:

<pre dir='ltr' align='left'><code class='language-http'>X-ServerChan-Send-Key: &lt;serverchan-send-key&gt;
</code></pre>

## Console test

پہلے Worker console یا local curl میں authentication effective ہے یا نہیں test کر سکتے ہیں:

<pre dir='ltr' align='left'><code class='language-bash'>curl -i "https://&lt;your-worker&gt;.workers.dev/pushplus" \
  -H "Authorization: Bearer &lt;same-random-secret&gt;" \
  -H "Content-Type: application/json" \
  --data '{"token":"&lt;pushplus-token&gt;","title":"relay test","content":"hello","template":"markdown"}'
</code></pre>

WxPusher test:

<pre dir='ltr' align='left'><code class='language-bash'>curl -i "https://&lt;your-worker&gt;.workers.dev/wxpusher" \
  -H "Authorization: Bearer &lt;same-random-secret&gt;" \
  -H "Content-Type: application/json" \
  --data '{"spt":"&lt;wxpusher-spt&gt;","summary":"relay test","content":"hello","contentType":1}'
</code></pre>

Server酱 test:

<pre dir='ltr' align='left'><code class='language-bash'>curl -i "https://&lt;your-worker&gt;.workers.dev/serverchan" \
  -H "Authorization: Bearer &lt;same-random-secret&gt;" \
  -H "X-ServerChan-Send-Key: &lt;serverchan-send-key&gt;" \
  -H "Content-Type: application/json" \
  --data '{"title":"relay test","desp":"hello"}'
</code></pre>

</div>
