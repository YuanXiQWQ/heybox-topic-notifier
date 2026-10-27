/** @file 按本站路径读取安装包资源，并支持彩蛋音视频的字节范围请求。 */
package io.github.yuanxiqwq.heyboxnotifier;
import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.InputStream;
import java.net.URLConnection;
import java.net.HttpURLConnection;
import java.util.HashMap;
import java.util.Map;

/** 安装资源可离线读取，文件权限不会开放给网页。 */
final class Assets {
    /**
     * 响应固定来源静态请求，拒绝目录穿越并保留媒体拖动播放。
     * @param {Context} context 资源上下文。
     * @param {WebResourceRequest} request WebView 请求。
     * @return {WebResourceResponse} 安装资源或 null。
     */
    static WebResourceResponse read(Context context, WebResourceRequest request) {
        if (!request.getUrl().toString().startsWith(BuildConfig.APP_ORIGIN + "/static/") || !request.getMethod().equals("GET")) return null;
        String relative = request.getUrl().getPath().substring(1);
        if (relative.contains("..") || relative.contains("\\") || relative.contains(":")) return null;
        if (relative.endsWith(".js") || relative.endsWith(".css")) {
            WebResourceResponse fresh = currentCode(context, request.getUrl().toString(), relative.endsWith(".js") ? "text/javascript" : "text/css");
            if (fresh != null) return fresh;
        }
        try {
            String mime = URLConnection.guessContentTypeFromName(relative);
            if (relative.endsWith(".js")) mime = "text/javascript";
            if (relative.endsWith(".css")) mime = "text/css";
            if (relative.endsWith(".json")) mime = "application/json";
            if (relative.endsWith(".svg")) mime = "image/svg+xml";
            if (relative.endsWith(".woff2")) mime = "font/woff2";
            if (relative.endsWith(".woff")) mime = "font/woff";
            if (relative.endsWith(".ogg")) mime = "audio/ogg";
            if (relative.endsWith(".mp4")) mime = "video/mp4";
            if (relative.endsWith(".webm")) mime = "video/webm";
            if (mime == null) mime = "application/octet-stream";
            String range = request.getRequestHeaders().get("Range");
            if (range == null) range = request.getRequestHeaders().get("range");
            Map<String,String> headers = new HashMap<>(); headers.put("Cache-Control", "public, max-age=86400"); headers.put("X-Content-Type-Options", "nosniff");
            if (range == null) return new WebResourceResponse(mime, null, 200, "OK", headers, context.getAssets().open(relative));
            try (AssetFileDescriptor descriptor = context.getAssets().openFd(relative)) {
                long length = descriptor.getLength();
                if (!range.matches("bytes=[0-9]*-[0-9]*")) return null;
                String[] parts = range.substring(6).split("-", -1);
                long start = parts[0].isEmpty() ? Math.max(0, length - Long.parseLong(parts[1])) : Long.parseLong(parts[0]);
                long end = parts[0].isEmpty() || parts[1].isEmpty() ? length - 1 : Math.min(length - 1, Long.parseLong(parts[1]));
                headers.put("Accept-Ranges", "bytes");
                if (start > end || start >= length) { headers.put("Content-Range", "bytes */" + length); return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", headers, new ByteArrayInputStream(new byte[0])); }
                InputStream input = context.getAssets().open(relative); long skipped = 0;
                while (skipped < start) { long count = input.skip(start - skipped); if (count <= 0) { input.close(); return null; } skipped += count; }
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + length); headers.put("Content-Length", Long.toString(end - start + 1));
                return new WebResourceResponse(mime, null, 206, "Partial Content", headers, new LimitedStream(input, end - start + 1));
            }
        } catch (Exception error) { return null; }
    }
    /**
     * 联网时读取与服务器页面配套的脚本和样式，断网时使用安装资源。
     * @param {Context} context 网络能力查询上下文。
     * @param {String} address 已验证为固定本站的资源地址。
     * @param {String} mime 代码资源类型。
     * @return {WebResourceResponse} 最新资源或 null。
     */
    private static WebResourceResponse currentCode(Context context, String address, String mime) {
        ConnectivityManager manager = context.getSystemService(ConnectivityManager.class);
        NetworkCapabilities network = manager.getNetworkCapabilities(manager.getActiveNetwork());
        if (network == null || !network.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) return null;
        HttpURLConnection connection = null;
        try {
            connection = Http.connect(address); connection.setConnectTimeout(1500); connection.setReadTimeout(3000);
            if (connection.getResponseCode() != 200) { connection.disconnect(); return null; }
            HttpURLConnection active = connection;
            InputStream input = new FilterInputStream(active.getInputStream()) {
                /** 关闭资源流时释放对应 HTTP 连接。 */
                @Override public void close() throws java.io.IOException { try { super.close(); } finally { active.disconnect(); } }
            };
            return new WebResourceResponse(mime, "UTF-8", 200, "OK", java.util.Collections.singletonMap("Cache-Control", "no-cache"), input);
        } catch (Exception ignored) { if (connection != null) connection.disconnect(); return null; }
    }
    /** 单个媒体范围的有界输入流。 */
    private static final class LimitedStream extends FilterInputStream {
        private long remaining;
        /** @param {InputStream} input 资源流。 @param {long} length 字节数。 */
        LimitedStream(InputStream input, long length) { super(input); remaining = length; }
        /** @return {int} 下一字节或 EOF。 */
        @Override public int read() throws java.io.IOException { if (remaining <= 0) return -1; int result = super.read(); if (result >= 0) remaining--; return result; }
        /** @param {byte[]} bytes 接收数组。 @param {int} offset 起点。 @param {int} length 长度。 @return {int} 实际读取数。 */
        @Override public int read(byte[] bytes, int offset, int length) throws java.io.IOException { if (remaining <= 0) return -1; int result = in.read(bytes, offset, (int) Math.min(length, remaining)); if (result > 0) remaining -= result; return result; }
    }
}
