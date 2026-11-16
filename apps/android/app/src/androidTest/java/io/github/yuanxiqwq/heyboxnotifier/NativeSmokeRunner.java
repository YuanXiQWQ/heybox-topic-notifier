/** @file 在独立无 GMS 模拟器上验证真实系统通知、彩蛋音频、后台服务和加密设备状态。 */
package io.github.yuanxiqwq.heyboxnotifier;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.webkit.CookieManager;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import org.json.JSONObject;

/** 仅在明确指定的离线测试模拟器运行，合成会话不访问生产账号。 */
public final class NativeSmokeRunner extends Instrumentation {
    private Activity activity;
    private boolean mediaOnly;
    private DeviceState device;
    private NotificationManager manager;
    private final StringBuilder passed = new StringBuilder();

    /** @param {Bundle} arguments 必须显式确认独立离线模拟器。 */
    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        if (arguments == null || !"true".equals(arguments.getString("isolatedOfflineEmulator"))) {
            Bundle result = new Bundle(); result.putString("stream", "Requires isolatedOfflineEmulator=true and offline emulator");
            finish(Activity.RESULT_CANCELED, result); return;
        }
        mediaOnly = "true".equals(arguments.getString("mediaOnly"));
        start();
    }

    /** 执行系统级检查，结束时移除合成会话、通知和测试偏好。 */
    @Override public void onStart() {
        Bundle result = new Bundle(); int status = Activity.RESULT_CANCELED; boolean isolated = false;
        try {
            android.net.ConnectivityManager network = getTargetContext().getSystemService(android.net.ConnectivityManager.class);
            require(network.getActiveNetwork() == null, "emulator must be offline");
            require(BuildConfig.DEBUG, "requires debug target");
            require("ranchu".equals(android.os.Build.HARDWARE) || "goldfish".equals(android.os.Build.HARDWARE), "requires disposable Android emulator");
            try {
                getTargetContext().getPackageManager().getPackageInfo("com.google.android.gms", 0);
                throw new AssertionError("requires emulator without Google Play Services");
            } catch (android.content.pm.PackageManager.NameNotFoundException expected) { /* AOSP 镜像不包含 GMS。 */ }
            isolated = true;
            device = DeviceState.get(getTargetContext());
            manager = getTargetContext().getSystemService(NotificationManager.class);
            require(manager.areNotificationsEnabled(), "test notification permission");
            String token = "isolated-native-smoke-session";
            String session = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
            device.put("badgeEnabled", true);
            device.put("notifications", new JSONObject().put("enabled", false));
            device.put("badgeSnapshot", new JSONObject("{\"userId\":\"smoke-user\",\"detailed\":true,\"records\":[{\"id\":\"a\",\"postId\":\"p1\"},{\"id\":\"b\",\"postId\":\"p1\"},{\"id\":\"c\",\"postId\":\"p2\"}],\"local\":[]}").put("session", session));
            runOnMainSync(() -> {
                CookieManager.getInstance().setCookie(BuildConfig.APP_ORIGIN, "heybox_session=" + token + "; Path=/; Secure");
                CookieManager.getInstance().flush();
            });
            device.put("notifications", new JSONObject().put("enabled", true).put("userId", "smoke-user")
                .put("session", Notifications.currentSessionHash()).put("generation", "smoke")
                .put("cursor", "").put("seen", new org.json.JSONArray()));
            activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            awaitStatus(2);
            pass("foreground service starts without GMS; badge deduplicates posts");
            assertDeferredEasterEggAudio();
            pass("packaged Easter egg sounds play asynchronously without another user gesture");
            assertBrowserFixture("advent-font.html", "", 30000);
            pass("Advent CJK names and descriptions render visible glyphs with packaged fonts loaded");
            assertBrowserFixture("advent-settings.html", "", 30000);
            pass("Plague Doctor reuses and restores the real settings field with animated text and unchanged box model");
            assertWhiteNightEntry(false, false);
            assertWhiteNightEntry(true, false);
            pass("WhiteNight rings once across Prelude and active with and without prepared media");
            assertWhiteNightEntry(false, true);
            pass("Plague Doctor stops all cutscene sounds before WhiteNight church music starts");
            if (!mediaOnly) {
            NotificationManager nm = manager;
            require(!nm.getNotificationChannel("background-silent-v2").canShowBadge(), "background channel has no badge");
            android.app.NotificationChannel background = nm.getNotificationChannel("background-silent-v2");
            require(background.getImportance() <= NotificationManager.IMPORTANCE_LOW && background.getSound() == null && !background.shouldVibrate(), "background status cannot alert with sound or heads-up");
            long statusTime = statusNotification().when;
            runOnMainSync(NotificationService::publishBadge);
            require(statusNotification().when == statusTime, "unchanged polling does not repost the status");
            android.app.NotificationChannel alerts = nm.getNotificationChannel(NotificationChannels.ensure(getTargetContext()));
            require(!alerts.canShowBadge(), "new matches do not count as workspace badge");
            getTargetContext().startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            SystemClock.sleep(17000);
            require(NotificationService.isRunning(), "service survives leaving activity and a polling interval");
            awaitStatus(2);
            pass("background service survives offline polling");
            runOnMainSync(() -> activity.finishAndRemoveTask());
            SystemClock.sleep(17000);
            require(NotificationService.isRunning(), "service survives removing the recent task and a polling interval");
            awaitStatus(2);
            pass("removing recent task preserves foreground service and status notification");
            require(NotificationService.requestPoll(), "wake signal reaches running service after task removal");
            assertPollingSurvivesStateFailure();
            pass("immediate background wake and state failure preserve scheduled polling");
            Badges.local(device, new JSONObject("{\"userId\":\"smoke-user\",\"records\":[{\"id\":\"c\",\"postId\":\"p2\",\"workspace\":false}]}"));
            runOnMainSync(NotificationService::publishBadge);
            awaitStatus(1);
            pass("offline confirmation immediately updates system notification number");
            Notifications.get(getTargetContext(), device).show(new JSONObject("{\"id\":\"isolated-smoke-notification\",\"path\":\"/\",\"title\":\"Native smoke test\",\"body\":\"Isolated emulator only\"}"), "smoke-user");
            SystemClock.sleep(500);
            require(manager.getActiveNotifications().length == 2 && Badges.count(device) == 1, "test notification does not change workspace count");
            for (StatusBarNotification posted : manager.getActiveNotifications()) if (posted.getId() != 12101) {
                require(posted.getNotification().getSmallIcon().getResId() == R.drawable.app_icon, "status bar uses application logo");
                require(posted.getNotification().getLargeIcon() != null, "notification includes application artwork");
                require(alerts.getImportance() == NotificationManager.IMPORTANCE_HIGH && alerts.getSound() != null, "alerts retain banner and sound configuration");
            }
            pass("Android accepts native notification after task removal independently of badge count");
            device.put("badgeEnabled", false);
            runOnMainSync(NotificationService::publishBadge);
            awaitStatus(0);
            require("background-silent-v2".equals(statusNotification().getChannelId()), "disabled badge uses background channel");
            byte[] encrypted = java.nio.file.Files.readAllBytes(new java.io.File(getTargetContext().getFilesDir(), "device.bin").toPath());
            require(!new String(encrypted, StandardCharsets.UTF_8).contains("smoke-user"), "state is encrypted");
            pass("badge disable and Keystore encrypted persistence");
            }
            assertUpdateDownload();
            pass("update download survives Activity removal; notification and reopened About page share progress; invalid package is rejected");
            status = Activity.RESULT_OK;
        } catch (Throwable error) {
            result.putString("error", android.util.Log.getStackTraceString(error));
        } finally {
          if (isolated) {
            try { if (device != null) { device.put("badgeEnabled", false); device.put("badgeSnapshot", new JSONObject()); device.put("notifications", new JSONObject().put("enabled", false)); } }
            catch (Exception error) { result.putString("cleanupError", error.toString()); status = Activity.RESULT_CANCELED; }
            NotificationJob.maintain(getTargetContext(), false);
            getTargetContext().stopService(new Intent(getTargetContext(), UpdateService.class));
            boolean stopped = getTargetContext().stopService(new Intent(getTargetContext(), NotificationService.class));
            runOnMainSync(() -> { CookieManager.getInstance().removeAllCookies(null); CookieManager.getInstance().flush(); if (activity != null) activity.finish(); });
            long cleanupEnd = SystemClock.uptimeMillis() + 10000;
            while (SystemClock.uptimeMillis() < cleanupEnd && NotificationService.isRunning()) SystemClock.sleep(100);
            if (manager != null) manager.cancelAll();
            while (SystemClock.uptimeMillis() < cleanupEnd && (NotificationService.isRunning() || (manager != null && manager.getActiveNotifications().length != 0))) SystemClock.sleep(100);
            if (NotificationService.isRunning() || (manager != null && manager.getActiveNotifications().length != 0)) {
                result.putString("cleanupError", "stopped=" + stopped + " running=" + NotificationService.isRunning() + " notifications=" + (manager == null ? -1 : manager.getActiveNotifications().length)); status = Activity.RESULT_CANCELED;
            }
          }
        }
        result.putString("stream", passed.toString()); finish(status, result);
    }

    /** @param {boolean} value 检查结果。 @param {String} message 失败说明。 */
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    /** @param {String} name 已完成的检查。 */
    private void pass(String name) { passed.append("PASS ").append(name).append('\n'); }
    /** 在隔离模拟器中分段提供无效安装包，验证真实下载服务生命周期与校验失败，绝不申请安装。 @throws Exception 系统服务或断言失败。 */
    private void assertUpdateDownload() throws Exception {
        if (activity == null || activity.isDestroyed() || activity.isFinishing()) activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        Updates updates = Updates.current();
        java.lang.reflect.Field transferring = Updates.class.getDeclaredField("transferring"); transferring.setAccessible(true);
        long deadline = SystemClock.uptimeMillis() + 15000;
        while (((java.util.concurrent.atomic.AtomicBoolean) transferring.get(updates)).get() && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(100);
        require(!((java.util.concurrent.atomic.AtomicBoolean) transferring.get(updates)).get(), "update coordinator idle before isolated download");
        String address = "https://github.com/YuanXiQWQ/heybox-topic-notifier/releases/download/99.0.1/heybox-topic-notifier-android-universal.apk";
        java.util.concurrent.Semaphore chunks = new java.util.concurrent.Semaphore(0);
        java.util.concurrent.atomic.AtomicInteger connections = new java.util.concurrent.atomic.AtomicInteger();
        // 仅测试进程替换 HTTPS 传输；生产下载器仍执行来源、大小、摘要及签名检查。
        java.net.URL.setURLStreamHandlerFactory(protocol -> !protocol.equals("https") ? null : new java.net.URLStreamHandler() {
            @Override protected java.net.URLConnection openConnection(java.net.URL url) throws java.io.IOException {
                if (!address.equals(url.toString())) throw new java.io.IOException("Isolated offline test");
                connections.incrementAndGet();
                return new java.net.HttpURLConnection(url) {
                    private volatile boolean disconnected;
                    @Override public void connect() {}
                    @Override public void disconnect() { disconnected = true; chunks.release(); }
                    @Override public boolean usingProxy() { return false; }
                    @Override public int getResponseCode() { return 200; }
                    @Override public String getHeaderField(String name) { return null; }
                    @Override public java.io.InputStream getInputStream() {
                        return new java.io.InputStream() {
                            private int count;
                            @Override public int read() throws java.io.IOException { throw new java.io.IOException("Requires buffered read"); }
                            @Override public int read(byte[] bytes, int offset, int length) throws java.io.IOException {
                                if (count == 10) return -1;
                                try { if (!chunks.tryAcquire(60, java.util.concurrent.TimeUnit.SECONDS)) throw new java.io.IOException("Chunk timeout"); }
                                catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new java.io.IOException(error); }
                                if (disconnected) throw new java.io.IOException("Download cancelled");
                                require(length >= 8192, "download buffer");
                                java.util.Arrays.fill(bytes, offset, offset + 8192, (byte) 0); count++; return 8192;
                            }
                        };
                    }
                };
            }
        });
        device.put("updateVersion", "99.0.1"); device.put("updateSeen_dismissed", "99.0.1");
        java.lang.reflect.Field release = Updates.class.getDeclaredField("release"); release.setAccessible(true);
        release.set(updates, new JSONObject().put("browser_download_url", address).put("size", 81920).put("digest", "sha256:" + "0".repeat(64)));
        java.lang.reflect.Field status = Updates.class.getDeclaredField("status"); status.setAccessible(true); status.set(updates, "available");
        runOnMainSync(() -> { UpdateService.start(activity); UpdateService.start(activity); });
        chunks.release(3); awaitUpdateProgress(30);
        runOnMainSync(() -> activity.finishAndRemoveTask());
        deadline = SystemClock.uptimeMillis() + 10000;
        while (!activity.isDestroyed() && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(100);
        require(activity.isDestroyed(), "original Activity destroyed during download");
        chunks.release(3); awaitUpdateProgress(60);
        require(connections.get() == 1, "repeated requests do not start a second download");
        activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        require(Updates.current() == updates, "new Activity attaches to the same download");
        assertBrowserFixture("update-progress.html", "", 30000);
        chunks.release(4);
        deadline = SystemClock.uptimeMillis() + 10000;
        while (!"error".equals(updates.state().optString("status")) && SystemClock.uptimeMillis() < deadline) SystemClock.sleep(100);
        require("error".equals(updates.state().optString("status")), "invalid digest rejects synthetic package");
        require(!updates.state().optBoolean("installPending"), "invalid package never requests installation");
        device.put("updateVersion", ""); device.put("updateSeen_dismissed", "");
        getTargetContext().stopService(new Intent(getTargetContext(), UpdateService.class));
        manager.cancel(UpdateService.NOTIFICATION_ID);
    }
    /** @param {int} expected 预期共享进度与通知百分比。 @throws Exception 状态读取或等待失败。 */
    private void awaitUpdateProgress(int expected) throws Exception {
        long deadline = SystemClock.uptimeMillis() + 10000;
        while (SystemClock.uptimeMillis() < deadline) {
            for (StatusBarNotification posted : manager.getActiveNotifications()) {
                if (posted.getId() != UpdateService.NOTIFICATION_ID) continue;
                Notification notification = posted.getNotification();
                if (notification.extras.getInt(Notification.EXTRA_PROGRESS) != expected) continue;
                require("downloading".equals(Updates.current().state().optString("status")), "coordinator remains downloading");
                require(Updates.current().state().getInt("progress") == expected, "notification and page progress match");
                require(notification.extras.getInt(Notification.EXTRA_PROGRESS_MAX) == 100, "determinate progress maximum");
                require((notification.flags & Notification.FLAG_ONGOING_EVENT) != 0, "download notification is ongoing");
                require(notification.contentIntent != null, "download notification opens application");
                android.app.NotificationChannel channel = manager.getNotificationChannel(notification.getChannelId());
                require(channel.getImportance() <= NotificationManager.IMPORTANCE_LOW && channel.getSound() == null && !channel.canShowBadge(), "progress is silent and does not change workspace badge");
                return;
            }
            SystemClock.sleep(100);
        }
        throw new AssertionError("Update notification did not reach " + expected + ": " + Updates.current().state());
    }
    /** 在真实 Activity 的 WebView 内异步播放安装包音频，验证播放策略、解码和播放进度。 @throws Exception 反射、等待或播放失败。 */
    private void assertDeferredEasterEggAudio() throws Exception {
        java.lang.reflect.Field field = MainActivity.class.getDeclaredField("web");
        field.setAccessible(true);
        android.webkit.WebView view = (android.webkit.WebView) field.get(activity);
        // 逐项检查安装包中的全部音视频，失败后继续记录其它资源，避免只看到首个错误。
        org.json.JSONArray paths = new org.json.JSONArray();
        collectMedia("static/fun", paths);
        String html = "<!doctype html><meta charset='utf-8'><script>" +
            "window.audioSmoke='pending';window.audioSmokeFailures=[];setTimeout(async()=>{try{" +
            "const sounds=" + paths + ";" +
            "for(const name of sounds.filter(name=>/emergency01_mast|emergency04_mast|msc-objection/.test(name))){" +
            "const full=new Uint8Array(await (await fetch('/'+name)).arrayBuffer());" +
            "for(const [range,start,end] of [['bytes=0-31',0,32],['bytes=37-100',37,101],['bytes=-64',full.length-64,full.length]]){" +
            "const response=await fetch('/'+name,{headers:{Range:range},signal:AbortSignal.timeout(5000)});" +
            "const bytes=new Uint8Array(await response.arrayBuffer());" +
            "if(response.status!==206||bytes.length!==end-start||!bytes.every((value,index)=>value===full[start+index]))throw new Error('range mismatch '+name+' '+range);" +
            "console.log('MEDIA_PROBE range '+name+' '+range);}}" +
            "for(const name of sounds){window.audioSmokePath=name;console.log('MEDIA_PROBE start '+name);" +
            "const audio=document.createElement(/\\.(mp4|webm)$/.test(name)?'video':'audio');audio.src='/'+name;audio.loop=name.includes('sounds/bgm');" +
            "let timeout;try{await Promise.race([audio.play(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('play timeout')),5000)})]);" +
            "await new Promise(resolve=>setTimeout(resolve,250));" +
            "console.log('MEDIA_PROBE position '+name+' '+audio.currentTime);if(!(audio.currentTime>0))throw new Error('playback did not advance');" +
            "if(audio.loop&&audio.duration>2){audio.currentTime=audio.duration-0.1;await new Promise(resolve=>setTimeout(resolve,1000));" +
            "if(!(audio.currentTime>0&&audio.currentTime<2&&!audio.paused&&!audio.ended))throw new Error('seek and loop failed '+audio.currentTime);" +
            "console.log('MEDIA_PROBE loop '+name+' '+audio.currentTime);}}" +
            "catch(error){const message=name+': '+error.name+': '+error.message+' ready='+audio.readyState+' network='+audio.networkState+' media='+audio.error?.code;" +
            "window.audioSmokeFailures.push(message);console.error('MEDIA_PROBE failure '+message);}" +
            "finally{clearTimeout(timeout);audio.pause();audio.removeAttribute('src');audio.load();}}" +
            "console.log('MEDIA_PROBE complete '+sounds.length+' failures='+audioSmokeFailures.length);window.audioSmoke=audioSmokeFailures.length?JSON.stringify(audioSmokeFailures):'passed';" +
            "}catch(error){window.audioSmoke=error.name+': '+error.message;}},100);</script>";
        runOnMainSync(() -> {
            android.webkit.WebViewClient original = view.getWebViewClient();
            view.setWebViewClient(new android.webkit.WebViewClient() {
                /** 记录媒体的实际安装资源响应，保留原请求处理逻辑。 @param {android.webkit.WebView} web 页面。 @param {android.webkit.WebResourceRequest} request 资源请求。 @return {android.webkit.WebResourceResponse} 原资源响应。 */
                @Override public android.webkit.WebResourceResponse shouldInterceptRequest(android.webkit.WebView web, android.webkit.WebResourceRequest request) {
                    android.webkit.WebResourceResponse response = original.shouldInterceptRequest(web, request);
                    android.util.Log.i("MEDIA_PROBE", request.getUrl().getPath() + " request=" + request.getRequestHeaders() + " response=" +
                        (response == null ? "network" : response.getStatusCode() + " " + response.getMimeType() + " " + response.getResponseHeaders()));
                    return response;
                }
            });
            view.stopLoading();
            view.loadDataWithBaseURL(BuildConfig.APP_ORIGIN + "/", html, "text/html", "UTF-8", null);
        });
        long deadline = SystemClock.uptimeMillis() + 900000;
        String last = "null";
        try {
            while (SystemClock.uptimeMillis() < deadline) {
                java.util.concurrent.CountDownLatch ready = new java.util.concurrent.CountDownLatch(1);
                java.util.concurrent.atomic.AtomicReference<String> value = new java.util.concurrent.atomic.AtomicReference<>();
                runOnMainSync(() -> view.evaluateJavascript("window.audioSmoke", actual -> {
                    value.set(actual); ready.countDown();
                }));
                require(ready.await(2, java.util.concurrent.TimeUnit.SECONDS), "audio playback probe callback");
                last = value.get();
                if ("\"passed\"".equals(last)) return;
                require("null".equals(last) || "\"pending\"".equals(last), "deferred audio: " + last);
                SystemClock.sleep(100);
            }
            throw new AssertionError("Timed out waiting for deferred audio: " + last);
        } finally {
            runOnMainSync(() -> view.loadUrl("about:blank"));
        }
    }
    /** 验证白夜入场的钟声与疫医过场音频交接。 @param {boolean} prepared 是否预热媒体。 @param {boolean} transformation 是否经疫医完整转变入场。 @throws Exception 页面、播放或等待失败。 */
    private void assertWhiteNightEntry(boolean prepared, boolean transformation) throws Exception {
        assertBrowserFixture("white-night-entry.html", "window.entryPrepared=" + prepared + ";window.entryTransformation=" + transformation + ";", transformation ? 90000 : 30000);
    }
    /** 在真实 WebView 中运行安装于测试包的浏览器检查。 @param {String} name 检查页面。 @param {String} setup 测试选项。 @param {long} timeout 等待上限。 @throws Exception 页面、断言或等待失败。 */
    private void assertBrowserFixture(String name, String setup, long timeout) throws Exception {
        java.lang.reflect.Field field = MainActivity.class.getDeclaredField("web");
        field.setAccessible(true);
        android.webkit.WebView view = (android.webkit.WebView) field.get(activity);
        String fixture;
        try (java.io.InputStream input = getContext().getAssets().open(name)) {
            fixture = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
        String html = fixture.replace("<meta charset=\"utf-8\">", "<meta charset=\"utf-8\"><script>" + setup + "</script>");
        runOnMainSync(() -> view.loadDataWithBaseURL(BuildConfig.APP_ORIGIN + "/", html, "text/html", "UTF-8", null));
        long deadline = SystemClock.uptimeMillis() + timeout;
        String last = "null";
        try {
            while (SystemClock.uptimeMillis() < deadline) {
                java.util.concurrent.CountDownLatch ready = new java.util.concurrent.CountDownLatch(1);
                java.util.concurrent.atomic.AtomicReference<String> value = new java.util.concurrent.atomic.AtomicReference<>();
                runOnMainSync(() -> view.evaluateJavascript("window.entryProbe", actual -> {
                    value.set(actual); ready.countDown();
                }));
                // 软件渲染模拟器首次绘制完整设置页可能超过两秒，保留页面总超时约束。
                require(ready.await(10, java.util.concurrent.TimeUnit.SECONDS), name + " probe callback");
                last = value.get();
                if ("\"passed\"".equals(last)) return;
                require("null".equals(last) || "\"pending\"".equals(last), name + " " + setup + ": " + last);
                SystemClock.sleep(100);
            }
            throw new AssertionError("Timed out waiting for " + name + ": " + last);
        } finally {
            runOnMainSync(() -> view.loadUrl("about:blank"));
        }
    }
    /** 遍历安装包内的音视频，不依赖手工维护的抽样清单。 @param {String} directory 资源目录。 @param {org.json.JSONArray} paths 媒体路径。 @throws Exception 安装资源不可读。 */
    private void collectMedia(String directory, org.json.JSONArray paths) throws Exception {
        for (String name : getTargetContext().getAssets().list(directory)) {
            String path = directory + "/" + name;
            if (name.matches(".*\\.(ogg|wav|mp3|mp4|webm)")) paths.put(path);
            else collectMedia(path, paths);
        }
    }
    /** 模拟加密状态暂不可读，验证整个轮询回调的异常边界与 CPU 锁。 @throws Exception 反射或断言失败。 */
    private void assertPollingSurvivesStateFailure() throws Exception {
        java.lang.reflect.Field active = NotificationService.class.getDeclaredField("active"); active.setAccessible(true);
        Object service = active.get(null);
        java.lang.reflect.Field workerField = NotificationService.class.getDeclaredField("worker"); workerField.setAccessible(true);
        java.util.concurrent.ScheduledExecutorService worker = (java.util.concurrent.ScheduledExecutorService) workerField.get(service);
        worker.submit(() -> {}).get(30, java.util.concurrent.TimeUnit.SECONDS);
        java.lang.reflect.Field lock = NotificationService.class.getDeclaredField("wakeLock"); lock.setAccessible(true);
        require(((android.os.PowerManager.WakeLock) lock.get(service)).isHeld(), "enabled alerts keep background CPU available");
        java.lang.reflect.Method poll = NotificationService.class.getDeclaredMethod("poll"); poll.setAccessible(true);
        java.lang.reflect.Field value = DeviceState.class.getDeclaredField("value"); value.setAccessible(true);
        Object saved = value.get(device);
        try { value.set(device, null); poll.invoke(service); }
        finally { value.set(device, saved); }
        require(NotificationService.isRunning(), "state failure must not terminate recurring work");
    }
    /** @return {Notification} 当前常驻通知；缺失时为空。 */
    private Notification statusNotification() {
        for (StatusBarNotification item : manager.getActiveNotifications()) if (item.getId() == 12101) return item.getNotification();
        return null;
    }
    /** @param {int} count 预期工作区数量。 */
    private void awaitStatus(int count) {
        long end = SystemClock.uptimeMillis() + 10000;
        while (SystemClock.uptimeMillis() < end) {
            Notification status = statusNotification();
            if (status != null && status.number == count) return;
            SystemClock.sleep(100);
        }
        throw new AssertionError("Expected ongoing notification count " + count);
    }
}
