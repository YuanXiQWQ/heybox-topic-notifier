/** @file 使用内存会话和通知端口验证 Android 补取分页、账号切换、权限及失败重试。 */
package io.github.yuanxiqwq.heyboxnotifier;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** 测试真实消费算法，不启动 WebView、厂商 SDK 或系统窗口。 */
public class NotificationInboxTest {
    /** 测试请求期间可修改会话或构造 JSON。 */
    private interface Action {
        /** 执行请求期间的状态变化。 @throws Exception JSON 处理失败。 */
        void run() throws Exception;
    }
    /** 可控制请求中途切换账号及系统通知失败的内存端口。 */
    private static final class Inbox extends NotificationInbox {
        JSONObject saved;
        String active = "session-a";
        int count, reads, failAt, badgeReads;
        boolean permission = true, stuck;
        Action duringRead = () -> {};
        Action duringSession = () -> {};
        final List<Integer> displayed = new ArrayList<>();
        /** @param {int} count 服务端积压数量。 @throws Exception 构造测试 JSON 失败。 */
        Inbox(int count) throws Exception { this.count = count; saved = new JSONObject().put("enabled", true).put("userId", "alice").put("session", active).put("generation", "one").put("cursor", "").put("seen", new JSONArray()); }
        /** @return {JSONObject} 持久数据副本。 */
        @Override protected JSONObject binding() { try { return new JSONObject(saved.toString()); } catch (Exception error) { throw new IllegalStateException(error); } }
        /** @return {String} 可被请求回调切换的会话摘要。 @throws Exception 模拟会话读取失败。 */
        @Override protected String session() throws Exception { duringSession.run(); return active; }
        /** @return {boolean} 模拟系统授权。 */
        @Override protected boolean allowed() { return permission; }
        /** 记录每轮角标更新次数。 */
        @Override protected void refreshBadge() { badgeReads++; }
        /** @param {String} after 游标。 @return {JSONObject} 最多一百条积压事件。 @throws Exception JSON 构造失败。 */
        @Override protected JSONObject read(String after) throws Exception {
            reads++; duringRead.run();
            int start = after.isEmpty() ? 0 : Integer.parseInt(after.substring(0, 16));
            JSONArray events = new JSONArray();
            for (int i = start + 1; i <= Math.min(count, start + 100); i++) events.put(new JSONObject().put("id", Integer.toString(i)).put("cursor", stuck ? after : cursor(i)));
            return new JSONObject().put("userId", "alice").put("events", events);
        }
        /** @param {JSONObject} event 通知。 @param {String} userId 所属账号。 @throws Exception 模拟通知系统失败。 */
        @Override protected void show(JSONObject event, String userId) throws Exception { int id = Integer.parseInt(event.getString("id")); if (id == failAt) throw new IllegalStateException("System unavailable"); displayed.add(id); }
        /** @param {JSONObject} expected 原绑定。 @param {String} cursor 游标。 @param {JSONArray} seen 去重信息。 @return {boolean} 是否提交成功。 @throws Exception JSON 保存失败。 */
        @Override protected boolean commit(JSONObject expected, String cursor, JSONArray seen) throws Exception { if (!sameBinding(expected, saved)) return false; saved.put("cursor", cursor).put("seen", new JSONArray(seen.toString())); return true; }
        /** @param {JSONObject} expected 仅清理原绑定。 @throws Exception JSON 构造失败。 */
        @Override protected void disable(JSONObject expected) throws Exception { if (sameBinding(expected, saved)) saved = new JSONObject().put("enabled", false); }
    }
    /** @param {int} number 顺序号。 @return {String} 与服务端相同结构的游标。 */
    private static String cursor(int number) { return String.format(Locale.ROOT, "%016d:%d", number, number); }

    /** 多页通知只在首批更新角标；关闭通知和关闭系统权限时角标仍独立刷新。 @throws Exception 测试失败。 */
    @Test public void badgeUpdatesOncePerRunIncludingDisabledNotifications() throws Exception {
        Inbox inbox = new Inbox(151);
        assertFalse(inbox.pollWithBadge());
        assertEquals(151,inbox.displayed.size()); assertEquals(2,inbox.reads); assertEquals(1,inbox.badgeReads);
        inbox.saved.put("enabled",false);
        assertFalse(inbox.pollWithBadge()); assertEquals(2,inbox.reads); assertEquals(2,inbox.badgeReads);
        inbox.saved.put("enabled",true); inbox.permission=false;
        assertFalse(inbox.pollWithBadge()); assertEquals(2,inbox.reads); assertEquals(3,inbox.badgeReads);
        assertFalse(inbox.poll()); assertEquals(3,inbox.badgeReads);
    }

    /** 超过一页的积压无需另一条厂商消息即可继续补取。 @throws Exception 测试失败。 */
    @Test public void drainsMultiplePages() throws Exception {
        Inbox inbox = new Inbox(151);
        assertFalse(inbox.poll()); assertEquals(151, inbox.displayed.size()); assertEquals(2, inbox.reads); assertEquals(cursor(151), inbox.saved.getString("cursor"));
    }
    /** 到达工作上限后请求系统续跑，并从已保存游标继续。 @throws Exception 测试失败。 */
    @Test public void requestsAnotherJobForLargeBacklogs() throws Exception {
        Inbox inbox = new Inbox(1001);
        assertTrue(inbox.poll()); assertEquals(1000, inbox.displayed.size());
        assertFalse(inbox.poll()); assertEquals(1001, inbox.displayed.size());
    }
    /** 请求途中切换 Cookie 时不展示旧账号的正文。 @throws Exception 测试失败。 */
    @Test public void discardsResponseAfterAccountChange() throws Exception {
        Inbox inbox = new Inbox(1); inbox.duringRead = () -> inbox.active = "session-b";
        assertFalse(inbox.poll()); assertTrue(inbox.displayed.isEmpty()); assertFalse(inbox.saved.getBoolean("enabled"));
    }
    /** 请求途中重新开启通知时不覆盖新绑定。 @throws Exception 测试失败。 */
    @Test public void preservesNewBinding() throws Exception {
        Inbox inbox = new Inbox(1); inbox.duringRead = () -> inbox.saved.put("generation", "two");
        assertFalse(inbox.poll()); assertTrue(inbox.displayed.isEmpty()); assertEquals("two", inbox.saved.getString("generation")); assertTrue(inbox.saved.getBoolean("enabled"));
    }
    /** 会话校验期间换绑也不会把新账号通知关闭。 @throws Exception 测试失败。 */
    @Test public void preservesBindingReplacedDuringSessionValidation() throws Exception {
        Inbox inbox = new Inbox(1); inbox.duringSession = () -> { inbox.saved.put("generation", "two").put("session", "session-b"); inbox.active = "session-b"; };
        assertFalse(inbox.poll()); assertTrue(inbox.saved.getBoolean("enabled")); assertEquals("two", inbox.saved.getString("generation")); assertTrue(inbox.displayed.isEmpty());
    }
    /** 系统权限被关闭时不消耗收件箱，恢复后继续处理。 @throws Exception 测试失败。 */
    @Test public void retainsCursorWhenPermissionIsDisabled() throws Exception {
        Inbox inbox = new Inbox(2); inbox.permission = false;
        assertFalse(inbox.poll()); assertEquals(0, inbox.reads); assertEquals("", inbox.saved.getString("cursor"));
        inbox.permission = true; assertFalse(inbox.poll()); assertEquals(2, inbox.displayed.size());
    }
    /** 部分事件展示失败时只确认此前成功处理的事件。 @throws Exception 测试失败。 */
    @Test public void retriesOnlyUnconfirmedEvents() throws Exception {
        Inbox inbox = new Inbox(3); inbox.failAt = 2;
        assertThrows(IllegalStateException.class, inbox::poll); assertEquals(cursor(1), inbox.saved.getString("cursor"));
        inbox.failAt = 0; assertFalse(inbox.poll()); assertEquals(List.of(1, 2, 3), inbox.displayed);
    }
    /** 异常游标不会造成重复通知或无限翻页。 @throws Exception 测试失败。 */
    @Test public void rejectsNonAdvancingCursor() throws Exception {
        Inbox inbox = new Inbox(1); inbox.stuck = true;
        assertThrows(IllegalStateException.class, inbox::poll); assertTrue(inbox.displayed.isEmpty()); assertEquals("", inbox.saved.getString("cursor"));
    }
    /** 系统取消任务后不开始额外请求。 @throws Exception 测试失败。 */
    @Test public void respectsTaskInterruption() throws Exception {
        Inbox inbox = new Inbox(1); Thread.currentThread().interrupt();
        try { assertFalse(inbox.poll()); assertEquals(0, inbox.reads); } finally { Thread.interrupted(); }
    }
}
