/** @file 用 PKCE 和系统浏览器登录同一账号，设备无需 Google 框架。 */
package io.github.yuanxiqwq.heyboxnotifier;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.CookieManager;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** 登录 verifier 只保存在应用私有加密存储，浏览器仅得到随机请求 ID。 */
final class BrowserLogin {
    private final Activity activity;
    private final DeviceState device;
    private final Runnable complete;
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    /**
     * 恢复尚未超时的登录交接。
     * @param {Activity} activity 发起界面。
     * @param {DeviceState} device 加密设备存储。
     * @param {Runnable} complete 成功回调。
     */
    BrowserLogin(Activity activity, DeviceState device, Runnable complete) { this.activity = activity; this.device = device; this.complete = complete; timer.scheduleWithFixedDelay(this::poll, 2, 2, TimeUnit.SECONDS); }
    /**
     * 创建登录请求并打开系统浏览器，让用户使用既有 Google、邮箱或 MFA 登录。
     * @return {JSONObject} 与浏览器确认页匹配的配对码。
     * @throws Exception 网络或状态保存失败。
     */
    synchronized JSONObject start() throws Exception {
        JSONObject flow = device.read().optJSONObject("login");
        if (flow == null || flow.optLong("expiresAt") <= System.currentTimeMillis()) {
            byte[] random = new byte[32]; new SecureRandom().nextBytes(random);
            String verifier = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
            String challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.UTF_8)));
            JSONObject response = post("/auth/native/start", new JSONObject().put("challenge", challenge));
            String id = response.getString("id");
            if (!id.matches("[a-f0-9-]{36}") || !response.getString("path").equals("/auth/native/approve?id=" + id)) throw new SecurityException("Invalid login handoff");
            flow = new JSONObject().put("id", id).put("verifier", verifier).put("expiresAt", System.currentTimeMillis() + 5 * 60000);
            device.put("login", flow);
        }
        String id = flow.getString("id");
        activity.runOnUiThread(() -> activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.APP_ORIGIN + "/auth/native/approve?id=" + id))));
        return new JSONObject().put("code", id.substring(0, 8).toUpperCase(java.util.Locale.ROOT));
    }
    /** 从加密状态恢复未完成授权；已消费请求不能再次登录。 */
    private synchronized void poll() {
        try {
            JSONObject flow = device.read().optJSONObject("login");
            if (flow == null) return;
            if (flow.optLong("expiresAt") <= System.currentTimeMillis()) { device.put("login", JSONObject.NULL); return; }
            JSONObject result = post("/auth/native/exchange", new JSONObject().put("id", flow.getString("id")).put("verifier", flow.getString("verifier")));
            if (result.optBoolean("ok")) { device.put("login", JSONObject.NULL); activity.runOnUiThread(complete); }
        } catch (Exception ignored) { /* 授权有效期内的网络错误可重试，不重新生成 verifier。 */ }
    }
    /**
     * 向固定认证接口提交 JSON，成功交接的 Cookie 写入 WebView 会话。
     * @param {String} path 认证路径。
     * @param {JSONObject} body 请求体。
     * @return {JSONObject} 响应。
     * @throws Exception 请求失败。
     */
    private JSONObject post(String path, JSONObject body) throws Exception {
        HttpURLConnection connection = Http.connect(BuildConfig.APP_ORIGIN + path);
        connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
        try {
            try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            int status = connection.getResponseCode();
            if (status != 200 && status != 202) throw new IllegalStateException("Login unavailable");
            JSONObject result = Http.json(connection.getInputStream());
            String cookie = connection.getHeaderField("Set-Cookie");
            if (result.optBoolean("ok") && path.endsWith("/exchange")) {
                if (cookie == null || !cookie.startsWith("heybox_session=")) throw new SecurityException("Missing login cookie");
                CookieManager.getInstance().setCookie(BuildConfig.APP_ORIGIN, cookie); CookieManager.getInstance().flush();
            }
            return result;
        } finally { connection.disconnect(); }
    }
    /** 停止当前界面任务，待授权状态仍保存在设备上。 */
    void close() { timer.shutdownNow(); }
}
