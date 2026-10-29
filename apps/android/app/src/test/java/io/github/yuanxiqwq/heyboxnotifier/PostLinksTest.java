/** @file 校验帖子路由及不可信网址的回退边界。 */
package io.github.yuanxiqwq.heyboxnotifier;

import org.junit.Test;
import static org.junit.Assert.*;

public final class PostLinksTest {
    /** 正文与分享链接保留同一个帖子编号，不携带原网址的其它参数。 */
    @Test public void routesPostAndShare() {
        String expected = "https://c.xiaoheihe.cn/v3/bbs/app/api/web/share?link_id=123456";
        assertEquals(expected, PostLinks.appUrl("https://www.xiaoheihe.cn/app/bbs/link/123456"));
        assertEquals(expected, PostLinks.appUrl("http://www.xiaoheihe.cn/app/bbs/link/123456/?foo=bar#comments"));
        assertEquals(expected, PostLinks.appUrl("https://api.xiaoheihe.cn/v3/bbs/app/api/web/share?h_src=app&link_id=123456"));
        assertEquals(expected, PostLinks.appUrl(expected));
        assertEquals("https://c.xiaoheihe.cn/v3/bbs/app/api/web/share?link_id=e3c072bb0113", PostLinks.appUrl("https://www.xiaoheihe.cn/app/bbs/link/e3c072bb0113"));
    }
    /** 外站、仿冒域名、其它页面和非法编号不触发客户端路由。 */
    @Test public void rejectsOtherLinks() {
        for (String url : new String[] {
            "https://example.com/app/bbs/link/123456", "https://www.xiaoheihe.cn.evil.test/app/bbs/link/123456",
            "https://evil@www.xiaoheihe.cn/app/bbs/link/123456", "https://www.xiaoheihe.cn:8443/app/bbs/link/123456",
            "https://www.xiaoheihe.cn/app/topic/link/123456", "https://www.xiaoheihe.cn/?link_id=123456",
            "https://www.xiaoheihe.cn/app/bbs/link/123456/other", "https://www.xiaoheihe.cn/app/bbs/link/abc%2Fdef",
            "https://c.xiaoheihe.cn/v3/bbs/app/api/web/share?link_id=1&link_id=2",
            "https://c.xiaoheihe.cn/v3/bbs/app/api/web/share?link_id=1%26evil",
            "intent://www.xiaoheihe.cn/app/bbs/link/123456", "invalid", ""
        }) assertNull(url, PostLinks.appUrl(url));
    }
}
