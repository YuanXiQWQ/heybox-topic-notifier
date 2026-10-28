/** @file 验证账号切换、离线保留及延迟响应不会制造错误角标。 */
package io.github.yuanxiqwq.heyboxnotifier;
import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class BadgeCounterTest {
    /** 账号变化会立即清空，先前账号的延迟响应不会显示在新账号上。 */
    @Test public void accountChangeInvalidatesPendingCount() {
        BadgeCounter counter = new BadgeCounter();
        int request = counter.begin("alice", true);
        counter.accept(request, "alice", "alice", true, 8);
        assertEquals(8, counter.read("alice", true));
        assertEquals(0, counter.read("bob", true));
        counter.accept(request, "alice", "bob", true, 12);
        assertEquals(0, counter.read("bob", true));
    }
    /** 离线不接纳响应，保留同账号计数；较早请求不能覆盖较新计数。 */
    @Test public void newestResponseWinsAndOfflineRetainsCount() {
        BadgeCounter counter = new BadgeCounter();
        int first = counter.begin("alice", true), second = counter.begin("alice", true);
        counter.accept(second, "alice", "alice", true, 3);
        counter.accept(first, "alice", "alice", true, 20);
        counter.begin("alice", true);
        assertEquals(3, counter.read("alice", true));
    }
    /** 关闭角标或退出账号后，尚在网络中的响应不能重新显示角标。 */
    @Test public void disabledAndLoggedOutBadgesStayClear() {
        BadgeCounter counter = new BadgeCounter();
        int request = counter.begin("alice", true);
        counter.accept(request, "alice", "alice", false, 10);
        assertEquals(0, counter.read("alice", false));
        counter.accept(request, "alice", "", true, 10);
        assertEquals(0, counter.read("", true));
    }
}
