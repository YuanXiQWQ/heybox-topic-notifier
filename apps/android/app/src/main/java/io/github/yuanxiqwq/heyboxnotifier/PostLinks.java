/** @file 将可信小黑盒帖子网址转换为客户端支持的分享入口。 */
package io.github.yuanxiqwq.heyboxnotifier;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** 只识别帖子链接，不把外部网址、话题或其它页面交给帖子路由。 */
final class PostLinks {
    /** 小黑盒官方 Android 应用包名。 */
    static final String PACKAGE = "com.max.xiaoheihe";

    /**
     * 提取可信网址中的帖子编号并生成小黑盒已注册的分享链接。
     * @param {String} address 用户点击的原网址。
     * @return {String} 客户端分享链接；无法确认是帖子时返回 null。
     */
    static String appUrl(String address) {
        try {
            URI uri = URI.create(address);
            if (!Arrays.asList("https", "http").contains(uri.getScheme()) || uri.getUserInfo() != null
                || (uri.getPort() != -1 && uri.getPort() != ("https".equals(uri.getScheme()) ? 443 : 80))
                || !Arrays.asList("www.xiaoheihe.cn", "xiaoheihe.cn", "api.xiaoheihe.cn", "c.xiaoheihe.cn").contains(uri.getHost())) return null;
            String id = null;
            String path = uri.getPath();
            if (path.matches("/app/bbs/link/[A-Za-z0-9_-]+/?")) id = path.replaceFirst("^/app/bbs/link/", "").replaceFirst("/$", "");
            else if (path.matches("/v[0-9]+/bbs/app/api/web/share/?") && uri.getRawQuery() != null) {
                for (String item : uri.getRawQuery().split("&")) {
                    String[] pair = item.split("=", 2);
                    if (pair.length == 2 && "link_id".equals(pair[0])) {
                        if (id != null) return null;
                        id = URLDecoder.decode(pair[1], StandardCharsets.UTF_8.name());
                    }
                }
            }
            return id != null && id.matches("[A-Za-z0-9_-]+") ? "https://c.xiaoheihe.cn/v3/bbs/app/api/web/share?link_id=" + id : null;
        } catch (Exception ignored) { return null; }
    }
}
