/** @file 承载原有页面、受来源限制的原生桥以及无 GMS 的 Android 系统能力。 */
package io.github.yuanxiqwq.heyboxnotifier;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** 页面使用系统 WebView，账号、设置和所有彩蛋继续走同一套界面。 */
public final class MainActivity extends ComponentActivity {
    private WebView web;
    private FrameLayout root;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private ValueCallback<Uri[]> fileCallback;
    private DeviceState device;
    private Notifications notifications;
    private Updates updates;
    private BrowserLogin login;
    private JavaScriptReplyProxy reply;
    private JSONObject pendingPermission;
    private JavaScriptReplyProxy permissionReply;
    /** 冷启动通知等到页面桥接就绪再打开，账号仍须复核。 */
    private String pendingNotificationPath, pendingNotificationUser;
    /** 网络、下载和加密写入在后台顺序执行。 */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    /** 大安装包下载不占用通知补取、页面桥接和设置保存的执行队列。 */
    private final ExecutorService downloadWorker = Executors.newSingleThreadExecutor();
    /** 通知网络请求独立执行，用户关闭开关不必等待积压消息全部处理完。 */
    private final ExecutorService notificationWorker = Executors.newSingleThreadExecutor();
    /** 本地角标投影不等待任何网络请求，断网时仍可立即保存。 */
    private final ExecutorService localWorker = Executors.newSingleThreadExecutor();
    /** 页面事件和原生消息端口必须在主线程访问。 */
    private final Handler handler = new Handler(Looper.getMainLooper());
    /** 当前窗口持有更新回调，进程协调器只保留弱引用。 */
    private final Runnable updateListener = this::emit;
    private boolean resumed;
    /** 网络较慢时只保留一轮前台补取，避免每十五秒积压一个后台任务。 */
    private volatile boolean pollInFlight;
    /** 前台轮询使用单一回调，重复返回应用不会叠加定时器。 */
    private final Runnable pollTask = this::poll;
    /** 自动检查只在可显示确认窗口的前台运行，恢复时由更新协调器节流。 */
    private final Runnable updateTask = this::checkForUpdates;

    /**
     * 初始化保持完整网页能力的 WebView，并限制桥接来源和子框架。
     * @param {Bundle} saved 进程恢复状态。
     */
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        try { device = DeviceState.get(this); notifications = Notifications.get(this, device); updates = Updates.get(this, device, updateListener); }
        catch (Exception error) { finish(); return; }
        root = new FrameLayout(this); web = new WebView(this); root.addView(web); setContentView(root);
        login = new BrowserLogin(this, device, () -> web.loadUrl(BuildConfig.APP_ORIGIN + "/"));
        root.setOnApplyWindowInsetsListener((view, insets) -> { view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); return insets; });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); settings.setMediaPlaybackRequiresUserGesture(true); settings.setSupportMultipleWindows(true);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) { Toast.makeText(this, R.string.webview_required, Toast.LENGTH_LONG).show(); finish(); return; }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            /** 返回手势与返回键使用同一套全屏、页面和后台切换规则。 */
            @Override public void handleOnBackPressed() { navigateBack(); }
        });
        WebViewCompat.addWebMessageListener(web, "HeyboxNative", Collections.singleton(BuildConfig.APP_ORIGIN), (view, message, source, mainFrame, proxy) -> {
            if (!mainFrame || !BuildConfig.APP_ORIGIN.equals(source.toString())) return;
            reply = proxy;
            try {
                JSONObject request = new JSONObject(message.getData());
                boolean requestsNotifications = "notifications".equals(request.optString("method")) && request.optBoolean("value");
                boolean requestsBadge = "preferences".equals(request.optString("method")) && request.optJSONObject("value") != null && request.getJSONObject("value").optBoolean("badgeEnabled");
                if ((requestsNotifications || requestsBadge) && Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    if (pendingPermission != null) { respond(proxy, request.optString("id"), null, "Permission request pending"); return; }
                    pendingPermission = request; permissionReply = proxy; requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 20); return;
                }
                dispatch(proxy, request);
            } catch (Exception error) { /* 非法消息不触发任何原生操作。 */ }
        });
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
            /** @param {WebResourceRequest} request Worker 资源请求。 @return {WebResourceResponse} 安装资源或默认网络处理。 */
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) { return Assets.read(MainActivity.this, request); }
        });
        web.setWebViewClient(new WebViewClient() {
            /** @param {WebView} view 当前页面。 @param {WebResourceRequest} request 资源请求。 @return {WebResourceResponse} 安装资源或网络。 */
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { return Assets.read(MainActivity.this, request); }
            /** @param {WebView} view 当前页面。 @param {WebResourceRequest} request 导航请求。 @return {boolean} 是否由原生处理。 */
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url.toString().startsWith(BuildConfig.APP_ORIGIN + "/")) return false;
                if (request.isForMainFrame()) openExternal(url);
                return true;
            }
            /** @param {WebView} view 当前页面。 @param {String} url 页面地址。 @param {android.graphics.Bitmap} icon 图标。 */
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { reply = null; }
            /** @param {WebView} view 当前页面。 @param {String} url 页面地址。 */
            @Override public void onPageFinished(WebView view, String url) { CookieManager.getInstance().flush(); emit(); openPendingNotification(); if (resumed) NotificationService.maintainFromVisible(MainActivity.this, device); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            /** @param {WebView} view 页面。 @param {ValueCallback<Uri[]>} callback 文件结果。 @param {FileChooserParams} params 选择要求。 @return {boolean} 是否处理。 */
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent choose = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
                startActivityForResult(choose, 10); return true;
            }
            /** @param {View} view 视频全屏视图。 @param {CustomViewCallback} callback 退出回调。 */
            @Override public void onShowCustomView(View view, CustomViewCallback callback) { if (fullscreen != null) { callback.onCustomViewHidden(); return; } fullscreen = view; fullscreenCallback = callback; root.addView(view); web.setVisibility(View.GONE); }
            /** 退出视频全屏后恢复原页面和演出状态。 */
            @Override public void onHideCustomView() { leaveFullscreen(); }
            /** @param {WebView} view 页面。 @param {boolean} dialog 是否对话框。 @param {boolean} gesture 用户操作。 @param {android.os.Message} result 新窗口消息。 @return {boolean} 是否接管新窗口。 */
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, android.os.Message result) {
                WebView external = new WebView(MainActivity.this);
                external.setWebViewClient(new WebViewClient() {
                    /** @param {WebView} target 临时视图。 @param {WebResourceRequest} request 导航。 @return {boolean} 已交给外部应用。 */
                    @Override public boolean shouldOverrideUrlLoading(WebView target, WebResourceRequest request) { if (request.isForMainFrame()) openExternal(request.getUrl()); target.destroy(); return true; }
                });
                ((WebView.WebViewTransport) result.obj).setWebView(external); result.sendToTarget(); return true;
            }
        });
        if (saved == null || web.restoreState(saved) == null) web.loadUrl(BuildConfig.APP_ORIGIN + "/");
        consumeIntent(getIntent());
        worker.execute(() -> { HonorPush.register(getApplicationContext(), device); emit(); });
        worker.execute(() -> { try { updates.restore(); if (updates.hasPendingResume()) downloadWorker.execute(() -> { try { updates.download(); } catch (Exception error) { /* 检查点保留，用户可再次继续。 */ } }); } catch (Exception error) { /* 已下载包不可用时可重新检查。 */ } });
    }
    /**
     * 帖子优先交给已安装的小黑盒，未安装或无法处理时使用原网页。
     * @param {Uri} url 用户打开的外部网址。
     */
    private void openExternal(Uri url) {
        if (!"https".equals(url.getScheme()) && !"http".equals(url.getScheme())) return;
        String post = PostLinks.appUrl(url.toString());
        if (post != null) {
            Intent app = new Intent(Intent.ACTION_VIEW, Uri.parse(post)).setPackage(PostLinks.PACKAGE);
            try { startActivity(app); return; }
            catch (ActivityNotFoundException | SecurityException ignored) { /* 未安装或客户端不支持时仍可查看原网页。 */ }
        }
        try { startActivity(new Intent(Intent.ACTION_VIEW, url)); }
        catch (ActivityNotFoundException | SecurityException ignored) { /* 没有可处理网址的应用时保留当前页面。 */ }
    }
    /**
     * 分派有限能力请求，网络操作不阻塞网页或彩蛋。
     * @param {JavaScriptReplyProxy} proxy 当前页面专属回复端口。
     * @param {JSONObject} request 已验证来源的请求。
     */
    private void dispatch(JavaScriptReplyProxy proxy, JSONObject request) {
        String method = request.optString("method"), id = request.optString("id");
        ExecutorService executor = method.equals("downloadUpdate") ? downloadWorker : method.equals("localBadge") ? localWorker : method.equals("refreshBadge") ? notificationWorker : worker;
        executor.execute(() -> {
            try {
                if (method.equals("login")) { respond(proxy, id, login.start(), null); return; }
                switch (method) {
                    case "info": break;
                    case "background": handler.post(() -> moveTaskToBack(true)); break;
                    case "installUpdate": updates.install(); break;
                    case "notifications": if (!(request.get("value") instanceof Boolean)) throw new IllegalArgumentException(); notifications.set(request.getBoolean("value")); handler.post(() -> { if (resumed) NotificationService.maintainFromVisible(this, device); }); break;
                    case "preferences":
                        JSONObject values = request.getJSONObject("value");
                        if (values.length() != 1 || !(values.get("badgeEnabled") instanceof Boolean)) throw new IllegalArgumentException("Invalid preference");
                        device.put("badgeEnabled", values.getBoolean("badgeEnabled"));
                        handler.post(() -> { if (resumed) NotificationService.maintainFromVisible(this, device); });
                        NotificationService.publishBadge(); break;
                    case "refreshBadge": Badges.refresh(device); NotificationService.publishBadge(); break;
                    case "localBadge": Badges.local(device,request.getJSONObject("value")); NotificationService.publishBadge(); break;
                    case "checkUpdate": updates.check(); break;
                    case "downloadUpdate": updates.download(); break;
                    case "seenUpdate": updates.seen(request.getString("value")); break;
                    default: throw new IllegalArgumentException("Unknown native method");
                }
                respond(proxy, id, state(), null); emit();
            } catch (Exception error) { respond(proxy, id, null, "Native operation unavailable"); }
        });
    }
    /**
     * 返回不含令牌和文件路径的设备状态。
     * @return {JSONObject} 页面可见信息。
     * @throws Exception 状态不可用。
     */
    private JSONObject state() throws Exception { return new JSONObject().put("platform", "android").put("version", BuildConfig.VERSION_NAME).put("preferences", new JSONObject().put("badgeEnabled", device.read().optBoolean("badgeEnabled", true))).put("notifications", notifications.state()).put("update", updates.state()); }
    /**
     * 仅向提出请求的页面端口发送结果，跨页面后丢弃回复。
     * @param {JavaScriptReplyProxy} target 页面端口。
     * @param {String} id 请求 ID。
     * @param {Object} value 结果。
     * @param {String} error 简短错误码。
     */
    private void respond(JavaScriptReplyProxy target, String id, Object value, String error) { handler.post(() -> { if (reply != target) return; try { target.postMessage(new JSONObject().put("id", id).put("value", value).put("error", error).toString()); } catch (Exception ignored) { /* 导航后的端口不可复用。 */ } }); }
    /** 广播原生进度，已离开的页面不会收到更新。 */
    private void emit() { handler.post(() -> { if (reply != null) try { reply.postMessage(new JSONObject().put("type", "state").put("value", state()).toString()); } catch (Exception ignored) { /* 页面可在下次加载重新读取状态。 */ } }); }
    /** 恢复界面时补取通知；后台厂商推送与前台补取保持相同事件 ID。 */
    @Override public void onResume() { super.onResume(); resumed = true; if (device != null) NotificationService.maintainFromVisible(this, device); if (updates != null) updates.resume(worker); handler.removeCallbacks(pollTask); handler.post(pollTask); handler.removeCallbacks(updateTask); handler.post(updateTask); }
    /** 页面暂停后停止界面轮询，常驻服务和系统任务继续处理后台事件。 */
    @Override public void onPause() { resumed = false; handler.removeCallbacks(pollTask); handler.removeCallbacks(updateTask); CookieManager.getInstance().flush(); super.onPause(); }
    /** 前台按固定周期合并补取通知与角标，网络错误不重置游标。 */
    private void poll() { if (!resumed || notifications == null) return; if (NotificationService.isRunning()) emit(); if (!pollInFlight && !NotificationService.isRunning()) { pollInFlight = true; notificationWorker.execute(() -> { try { notifications.pollWithBadge(); emit(); } catch (Exception ignored) { /* 网络恢复后重试。 */ } finally { pollInFlight = false; } }); } handler.postDelayed(pollTask, 15000); }
    /** 定期检查更新，应用返回前台时也能发现后台期间发布的新版本。 */
    private void checkForUpdates() { if (!resumed || updates == null) return; worker.execute(() -> { try { updates.checkAutomatically(); } catch (Exception ignored) { /* 手动检查可立即重试。 */ } }); handler.postDelayed(updateTask, 6L * 60 * 60 * 1000); }
    /** @param {int} code 权限请求编号。 @param {String[]} permissions 权限名称。 @param {int[]} results 结果。 */
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) { super.onRequestPermissionsResult(code, permissions, results); if (code == 20 && pendingPermission != null) { JSONObject request = pendingPermission; JavaScriptReplyProxy target = permissionReply; pendingPermission = null; permissionReply = null; if (target != reply) return; if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) dispatch(target, request); else respond(target, request.optString("id"), null, "Permission denied"); } }
    /** @param {int} code 文件选择请求。 @param {int} result 系统结果。 @param {Intent} data 选中文件。 */
    @Override protected void onActivityResult(int code, int result, Intent data) { super.onActivityResult(code, result, data); if (code == 10 && fileCallback != null) { fileCallback.onReceiveValue(result == RESULT_OK && data != null ? new Uri[] { data.getData() } : null); fileCallback = null; } }
    /** 退出全屏视图并恢复彩蛋所在页面。 */
    private void leaveFullscreen() { if (fullscreen == null) return; root.removeView(fullscreen); fullscreen = null; web.setVisibility(View.VISIBLE); fullscreenCallback.onCustomViewHidden(); fullscreenCallback = null; }
    /** 系统返回键优先退出视频；页面返回和退到后台先等待离线编辑保存。 */
    private void navigateBack() { if (fullscreen != null) leaveFullscreen(); else if (web != null) navigateSaved(web.canGoBack() ? "back" : "background", null); }
    /**
     * 在当前可信页面执行保存屏障，保存失败时不离开编辑页。
     * @param {String} target 本站路径、返回或后台操作。
     * @param {String} user 通知所属账号，普通返回不指定。
     */
    private void navigateSaved(String target, String user) {
        if (web == null || web.getUrl() == null || !web.getUrl().startsWith(BuildConfig.APP_ORIGIN + "/")) return;
        String page = web.getUrl();
        web.evaluateJavascript("(() => { if (typeof globalThis.applicationNavigate === 'function') { globalThis.applicationNavigate(" + JSONObject.quote(target) + "," + (user == null ? "null" : JSONObject.quote(user)) + ").catch(() => {}); return false; } return !globalThis.applicationSync && !globalThis.flushSettingsEdits; })()", result -> {
            if (!"true".equals(result) || web == null || !page.equals(web.getUrl())) return;
            // 认证页和尚未加载业务脚本的错误页没有离线设置编辑器，可直接执行系统返回。
            if (target.equals("back")) { if (web.canGoBack()) web.goBack(); }
            else if (target.equals("background")) moveTaskToBack(true);
        });
    }
    /** @param {Bundle} state 系统保存容器。 */
    @Override protected void onSaveInstanceState(Bundle state) { if (web != null) web.saveState(state); super.onSaveInstanceState(state); }
    /** @param {Intent} intent 通知点击带来的新 Intent。 */
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); consumeIntent(intent); }
    /**
     * 验证通知所属账号后打开受限本站路径。
     * @param {Intent} intent 系统通知参数。
     */
    private void consumeIntent(Intent intent) { pendingNotificationPath = intent.getStringExtra("notificationPath"); pendingNotificationUser = intent.getStringExtra("notificationUser"); if (reply != null) openPendingNotification(); }
    /** 冷启动和已打开窗口使用同一账号检查，通知跳转不丢弃尚在保存的设置。 */
    private void openPendingNotification() {
        String path = pendingNotificationPath, user = pendingNotificationUser;
        pendingNotificationPath = null; pendingNotificationUser = null;
        try { if (Arrays.asList("/", "/history").contains(path) && user != null && notifications.owns(user)) navigateSaved(path, user); }
        catch (Exception ignored) { /* 不打开已失效账号的通知。 */ }
    }
    /** 释放界面任务，主动退出时暂停下载并保留检查点、持久化队列和通知游标。 */
    @Override protected void onDestroy() { resumed = false; if (updates != null) { if (isFinishing()) updates.cancelDownload(); updates.detach(this); } handler.removeCallbacksAndMessages(null); worker.shutdown(); downloadWorker.shutdown(); notificationWorker.shutdown(); localWorker.shutdown(); if (login != null) login.close(); if (web != null) { web.stopLoading(); web.destroy(); } super.onDestroy(); }
}
