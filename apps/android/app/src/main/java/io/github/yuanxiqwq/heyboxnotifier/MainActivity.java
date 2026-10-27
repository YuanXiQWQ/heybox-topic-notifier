/** @file 承载原有页面、受来源限制的原生桥以及无 GMS 的 Android 系统能力。 */
package io.github.yuanxiqwq.heyboxnotifier;

import android.Manifest;
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
    /** 网络、下载和加密写入在后台顺序执行。 */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    /** 页面事件和原生消息端口必须在主线程访问。 */
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean resumed;
    /** 前台轮询使用单一回调，重复返回应用不会叠加定时器。 */
    private final Runnable pollTask = this::poll;

    /**
     * 初始化保持完整网页能力的 WebView，并限制桥接来源和子框架。
     * @param {Bundle} saved 进程恢复状态。
     */
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        try { device = DeviceState.get(this); notifications = Notifications.get(this, device); updates = new Updates(this, device, this::emit); }
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
                if ("notifications".equals(request.optString("method")) && request.optBoolean("value") && Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
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
                if (request.isForMainFrame() && Arrays.asList("https", "http").contains(url.getScheme())) startActivity(new Intent(Intent.ACTION_VIEW, url));
                return true;
            }
            /** @param {WebView} view 当前页面。 @param {String} url 页面地址。 @param {android.graphics.Bitmap} icon 图标。 */
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { reply = null; }
            /** @param {WebView} view 当前页面。 @param {String} url 页面地址。 */
            @Override public void onPageFinished(WebView view, String url) { CookieManager.getInstance().flush(); emit(); }
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
                    /** @param {WebView} target 临时视图。 @param {WebResourceRequest} request 导航。 @return {boolean} 已交给浏览器。 */
                    @Override public boolean shouldOverrideUrlLoading(WebView target, WebResourceRequest request) { Uri url = request.getUrl(); if (Arrays.asList("http", "https").contains(url.getScheme())) startActivity(new Intent(Intent.ACTION_VIEW, url)); target.destroy(); return true; }
                });
                ((WebView.WebViewTransport) result.obj).setWebView(external); result.sendToTarget(); return true;
            }
        });
        if (saved == null || web.restoreState(saved) == null) web.loadUrl(BuildConfig.APP_ORIGIN + "/");
        consumeIntent(getIntent());
        worker.execute(() -> { HonorPush.register(getApplicationContext(), device); emit(); });
        worker.execute(() -> { try { updates.check(); } catch (Exception error) { /* 下次联网或手动检查可重试。 */ } });
    }
    /**
     * 分派有限能力请求，网络操作不阻塞网页或彩蛋。
     * @param {JavaScriptReplyProxy} proxy 当前页面专属回复端口。
     * @param {JSONObject} request 已验证来源的请求。
     */
    private void dispatch(JavaScriptReplyProxy proxy, JSONObject request) {
        String method = request.optString("method"), id = request.optString("id");
        worker.execute(() -> {
            try {
                if (method.equals("login")) { respond(proxy, id, login.start(), null); return; }
                switch (method) {
                    case "info": break;
                    case "installUpdate": updates.install(); break;
                    case "notifications": if (!(request.get("value") instanceof Boolean)) throw new IllegalArgumentException(); notifications.set(request.getBoolean("value")); break;
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
    private JSONObject state() throws Exception { return new JSONObject().put("platform", "android").put("version", BuildConfig.VERSION_NAME).put("notifications", notifications.state()).put("update", updates.state()); }
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
    @Override public void onResume() { super.onResume(); resumed = true; if (updates != null) updates.resume(worker); handler.removeCallbacks(pollTask); handler.post(pollTask); }
    /** 页面暂停后停止前台轮询，后台事件由厂商消息调度。 */
    @Override public void onPause() { resumed = false; handler.removeCallbacks(pollTask); CookieManager.getInstance().flush(); super.onPause(); }
    /** 前台按固定周期补取，网络错误不重置游标。 */
    private void poll() { if (!resumed || notifications == null) return; worker.execute(() -> { try { notifications.poll(); emit(); } catch (Exception ignored) { /* 网络恢复后重试。 */ } }); handler.postDelayed(pollTask, 15000); }
    /** @param {int} code 权限请求编号。 @param {String[]} permissions 权限名称。 @param {int[]} results 结果。 */
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) { super.onRequestPermissionsResult(code, permissions, results); if (code == 20 && pendingPermission != null) { JSONObject request = pendingPermission; JavaScriptReplyProxy target = permissionReply; pendingPermission = null; permissionReply = null; if (target != reply) return; if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) dispatch(target, request); else respond(target, request.optString("id"), null, "Permission denied"); } }
    /** @param {int} code 文件选择请求。 @param {int} result 系统结果。 @param {Intent} data 选中文件。 */
    @Override protected void onActivityResult(int code, int result, Intent data) { super.onActivityResult(code, result, data); if (code == 10 && fileCallback != null) { fileCallback.onReceiveValue(result == RESULT_OK && data != null ? new Uri[] { data.getData() } : null); fileCallback = null; } }
    /** 退出全屏视图并恢复彩蛋所在页面。 */
    private void leaveFullscreen() { if (fullscreen == null) return; root.removeView(fullscreen); fullscreen = null; web.setVisibility(View.VISIBLE); fullscreenCallback.onCustomViewHidden(); fullscreenCallback = null; }
    /** 系统返回键优先退出视频，再返回页面，根页面退到后台。 */
    private void navigateBack() { if (fullscreen != null) leaveFullscreen(); else if (web != null && web.canGoBack()) web.goBack(); else moveTaskToBack(true); }
    /** @param {Bundle} state 系统保存容器。 */
    @Override protected void onSaveInstanceState(Bundle state) { if (web != null) web.saveState(state); super.onSaveInstanceState(state); }
    /** @param {Intent} intent 通知点击带来的新 Intent。 */
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); consumeIntent(intent); }
    /**
     * 验证通知所属账号后打开受限本站路径。
     * @param {Intent} intent 系统通知参数。
     */
    private void consumeIntent(Intent intent) { String path = intent.getStringExtra("notificationPath"), user = intent.getStringExtra("notificationUser"); try { if (path != null && path.startsWith("/") && !path.startsWith("//") && user != null && notifications.owns(user)) web.loadUrl(BuildConfig.APP_ORIGIN + path); } catch (Exception ignored) { /* 不打开已失效账号的通知。 */ } }
    /** 释放界面任务；已持久化的队列和通知游标继续保留。 */
    @Override protected void onDestroy() { resumed = false; handler.removeCallbacksAndMessages(null); worker.shutdown(); if (login != null) login.close(); if (web != null) { web.stopLoading(); web.destroy(); } super.onDestroy(); }
}
