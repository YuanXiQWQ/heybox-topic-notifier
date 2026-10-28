/** @file 为业务接口和官方 Release 下载提供受限网络读取。 */
package io.github.yuanxiqwq.heyboxnotifier;

import android.webkit.CookieManager;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** 业务 Cookie 仅发送到固定应用来源。 */
final class Http {
    /**
     * 读取业务 API，拒绝跨站跳转和登录页假成功。
     * @param {String} path 本站路径。
     * @return {JSONObject} JSON 响应。
     * @throws Exception 网络或身份检查失败。
     */
    static JSONObject api(String path) throws Exception {
        if (!path.startsWith("/") || path.startsWith("//")) throw new SecurityException("Invalid API path");
        HttpURLConnection connection = connect(BuildConfig.APP_ORIGIN + path);
        String cookie = CookieManager.getInstance().getCookie(BuildConfig.APP_ORIGIN);
        if (cookie != null) connection.setRequestProperty("Cookie", cookie);
        try { int status = connection.getResponseCode(); if (status == 401 || status == 403 || status == 303) throw new SecurityException("Authentication required"); if (status != 200) throw new IllegalStateException("API unavailable"); saveCookies(connection); return json(connection.getInputStream()); }
        finally { connection.disconnect(); }
    }
    /**
     * 向固定本站提交经 CSRF 保护的设备绑定，不向厂商发送账号 Cookie。
     * @param {String} path 本站路径。
     * @param {JSONObject} body 请求数据。
     * @return {JSONObject} 服务器确认。
     * @throws Exception 网络或身份验证失败。
     */
    static JSONObject post(String path, JSONObject body) throws Exception {
        JSONObject identity = api("/api/sync/session");
        if (!path.startsWith("/") || path.startsWith("//")) throw new SecurityException("Invalid API path");
        HttpURLConnection connection = connect(BuildConfig.APP_ORIGIN + path);
        connection.setRequestMethod("POST"); connection.setDoOutput(true);
        connection.setRequestProperty("content-type", "application/json");
        connection.setRequestProperty("x-csrf-token", identity.getString("csrfToken"));
        String cookie = CookieManager.getInstance().getCookie(BuildConfig.APP_ORIGIN);
        if (cookie != null) connection.setRequestProperty("Cookie", cookie);
        try {
            try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            if (connection.getResponseCode() != 200) throw new IllegalStateException("API unavailable");
            saveCookies(connection); return json(connection.getInputStream());
        } finally { connection.disconnect(); }
    }
    /** @param {HttpURLConnection} connection 固定本站响应，只接受其会话及 CSRF Cookie。 */
    private static void saveCookies(HttpURLConnection connection) {
        for (java.util.Map.Entry<String,java.util.List<String>> header : connection.getHeaderFields().entrySet()) {
            if ("set-cookie".equalsIgnoreCase(header.getKey())) for (String value : header.getValue()) CookieManager.getInstance().setCookie(BuildConfig.APP_ORIGIN, value);
        }
        CookieManager.getInstance().flush();
    }
    /**
     * 创建 HTTPS 连接，不自动携带凭据或跟随重定向。
     * @param {String} address 请求地址。
     * @return {HttpURLConnection} 有界超时连接。
     * @throws Exception 地址无效。
     */
    static HttpURLConnection connect(String address) throws Exception {
        URI uri = URI.create(address);
        if (!"https".equals(uri.getScheme()) || uri.getUserInfo() != null) throw new SecurityException("Invalid HTTPS endpoint");
        HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
        connection.setRequestProperty("User-Agent", "HeyboxNotifier/" + BuildConfig.VERSION_NAME);
        return connection;
    }
    /**
     * 读取有大小上限的 JSON，避免异常服务器耗尽内存。
     * @param {InputStream} input 响应流。
     * @return {JSONObject} JSON 对象。
     * @throws Exception 数据过大或格式错误。
     */
    static JSONObject json(InputStream input) throws Exception {
        try (input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) { if (output.size() + count > 2 * 1024 * 1024) throw new IllegalStateException("Response too large"); output.write(buffer, 0, count); }
            return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
        }
    }
    /**
     * 读取会话摘要绑定所需的令牌，不将完整 Cookie 写入设备文件。
     * @return {String} 当前会话令牌或空字符串。
     */
    static String session() {
        String cookie = CookieManager.getInstance().getCookie(BuildConfig.APP_ORIGIN);
        if (cookie != null) for (String field : cookie.split(";")) if (field.trim().startsWith("heybox_session=")) return field.trim().substring(15);
        return "";
    }
}
