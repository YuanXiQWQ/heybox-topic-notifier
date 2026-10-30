/** @file 验证账号切换、离线保留及延迟响应不会制造错误角标。 */
package io.github.yuanxiqwq.heyboxnotifier;
import org.junit.Test;
import static org.junit.Assert.assertEquals;
import org.json.JSONObject;
import org.json.JSONArray;

public class BadgeCounterTest {
    /** 版本确认保留完整基线，本机编辑、重启、账号切换均不能复用失效版本。 @throws Exception 测试失败。 */
    @Test public void versionsRetainBaselinesAndInvalidateAfterLocalChanges() throws Exception {
        BadgeCounter counter = new BadgeCounter();
        JSONObject full = new JSONObject().put("userId","alice").put("version","alice:1").put("records",new JSONArray().put(record("a","post")));
        counter.acceptRecords(counter.begin("session",true),"session","session",full);
        assertEquals("alice:1",counter.version("session"));
        counter.acceptRecords(counter.begin("session",true),"session","session",new JSONObject().put("userId","alice").put("version","alice:1").put("unchanged",true));
        assertEquals(1,counter.read("session",true));
        BadgeCounter reopened = new BadgeCounter(); reopened.restore(counter.snapshot());
        assertEquals("",reopened.version("session")); assertEquals(1,reopened.read("session",true));
        counter.setLocal("session",new JSONObject().put("userId","alice").put("records",new JSONArray().put(record("a","post").put("workspace",false))));
        assertEquals("",counter.version("session")); assertEquals(0,counter.read("session",true));
        counter.acceptRecords(counter.begin("session",true),"session","session",full);
        assertEquals(0,counter.read("session",true));
        counter.acceptRecords(counter.begin("session",true),"session","session",new JSONObject().put("userId","alice").put("version","alice:1").put("unchanged",true));
        assertEquals(0,counter.read("session",true));
        assertEquals("",counter.version("other")); assertEquals(0,counter.read("other",true));
    }
    /** 版本确认不得跨账号复用，旧服务端没有版本的完整快照仍可正常接纳。 @throws Exception 测试失败。 */
    @Test public void rejectsForeignUnchangedAndAcceptsLegacySnapshots() throws Exception {
        BadgeCounter counter = new BadgeCounter();
        JSONObject full = new JSONObject().put("userId","alice").put("version","v1").put("records",new JSONArray().put(record("a","post")));
        counter.acceptRecords(counter.begin("session",true),"session","session",full);
        org.junit.Assert.assertThrows(IllegalArgumentException.class, () -> counter.acceptRecords(counter.begin("session",true),"session","session",new JSONObject().put("userId","bob").put("version","v1").put("unchanged",true)));
        assertEquals("",counter.version("session")); assertEquals(1,counter.read("session",true));
        full.remove("version");
        counter.acceptRecords(counter.begin("session",true),"session","session",full);
        assertEquals("",counter.version("session")); assertEquals(1,counter.read("session",true));
    }
    /** @param {String} id 记录。 @param {String} postId 帖子。 @return {JSONObject} 工作区记录。 @throws Exception JSON 构造失败。 */
    private JSONObject record(String id,String postId) throws Exception { return new JSONObject().put("id",id).put("postId",postId); }
    /** 离线操作按帖子去重、允许恢复，并在重启后保留；服务器同步后重新裁决。 @throws Exception 测试失败。 */
    @Test public void offlineEditsDeduplicateAndSurviveRestart() throws Exception {
        BadgeCounter counter=new BadgeCounter();
        int request=counter.begin("session",true);
        counter.acceptRecords(request,"session","session",new JSONObject().put("userId","alice").put("records",new JSONArray().put(record("a","post")).put(record("b","post"))));
        assertEquals(1,counter.read("session",true));
        JSONArray edits=new JSONArray().put(record("a","post").put("workspace",false));
        counter.setLocal("session",new JSONObject().put("userId","alice").put("records",edits));
        assertEquals(1,counter.read("session",true));
        edits.put(record("b","post").put("workspace",false)).put(record("c","restored").put("workspace",true));
        counter.setLocal("session",new JSONObject().put("userId","alice").put("records",edits));
        assertEquals(1,counter.read("session",true));
        BadgeCounter reopened=new BadgeCounter(); reopened.restore(counter.snapshot());
        assertEquals(1,reopened.read("session",true)); assertEquals(0,reopened.read("session",false)); assertEquals(1,reopened.read("session",true));
        reopened.setLocal("session",new JSONObject().put("userId","alice").put("records",new JSONArray()));
        assertEquals(1,reopened.read("session",true));
        request=reopened.begin("session",true);
        reopened.acceptRecords(request,"session","session",new JSONObject().put("userId","alice").put("records",new JSONArray()));
        assertEquals(0,reopened.read("session",true));
    }
    /** 旧网络响应和另一个账号的离线队列均不能覆盖当前本机操作。 @throws Exception 测试失败。 */
    @Test public void staleNetworkAndForeignEditsCannotOverrideLocalState() throws Exception {
        BadgeCounter counter=new BadgeCounter(); int first=counter.begin("session",true);
        JSONObject data=new JSONObject().put("userId","alice").put("records",new JSONArray().put(record("a","post")));
        counter.acceptRecords(first,"session","session",data);
        int stale=counter.begin("session",true);
        counter.setLocal("session",new JSONObject().put("userId","alice").put("records",new JSONArray().put(record("a","post").put("workspace",false))));
        counter.acceptRecords(stale,"session","session",data);
        assertEquals(0,counter.read("session",true));
        counter.setLocal("session",new JSONObject().put("userId","bob").put("records",new JSONArray().put(record("x","other").put("workspace",true))));
        assertEquals(0,counter.read("session",true)); assertEquals(0,counter.read("other-session",true));
    }
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
