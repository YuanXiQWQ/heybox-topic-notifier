/** @file 验证合并请求次数、旧服务端回退和角标通知的独立故障处理。 */
package io.github.yuanxiqwq.heyboxnotifier;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONArray;
import org.json.JSONObject;

/** 运行正式响应处理器，不依赖 Android 框架或真实账号。 */
public class NativePollRequestTest {
    /** 正常合并仅请求一次，旧服务端仍能单独补取角标。 @throws Exception 测试失败。 */
    @Test public void combinesRequestsAndFallsBackForLegacyServers() throws Exception {
        int[] calls = new int[3];
        JSONObject legacy = new JSONObject().put("userId","alice").put("events",new JSONArray()).put("cursor","");
        JSONObject combined = new JSONObject(legacy.toString()).put("badge",new JSONObject().put("userId","alice").put("records",new JSONArray()));
        assertSame(combined, NativePollRequest.read(() -> { calls[0]++; return combined; }, badge -> calls[1]++, () -> calls[2]++));
        assertArrayEquals(new int[]{1,1,0},calls);
        assertSame(legacy, NativePollRequest.read(() -> { calls[0]++; return legacy; }, badge -> calls[1]++, () -> calls[2]++));
        assertArrayEquals(new int[]{2,1,1},calls);
    }
    /** 服务端角标错误和本机角标落盘错误均不丢弃有效通知。 @throws Exception 测试失败。 */
    @Test public void badgeFailuresDoNotDiscardNotifications() throws Exception {
        JSONObject data = new JSONObject().put("events",new JSONArray()).put("badge",new JSONObject().put("error","unavailable"));
        assertSame(data, NativePollRequest.read(() -> data, badge -> fail("error must not be accepted"), () -> fail("reported failure waits for next poll")));
        data.put("badge",new JSONObject().put("userId","alice"));
        assertSame(data, NativePollRequest.read(() -> data, badge -> { throw new Exception("disk unavailable"); }, () -> fail("received badge does not need another request")));
    }
    /** 通知失败仍保存角标，网络失败与旧响应按需独立重试角标。 @throws Exception 测试失败。 */
    @Test public void notificationFailurePreservesBadgeAndNetworkFailureFallsBack() throws Exception {
        int[] accepted = new int[1], fallback = new int[1];
        JSONObject data = new JSONObject().put("error","unavailable").put("badge",new JSONObject().put("count",4));
        assertThrows(IllegalStateException.class, () -> NativePollRequest.read(() -> data, badge -> accepted[0]=badge.getInt("count"), () -> fallback[0]++));
        assertEquals(4,accepted[0]); assertEquals(0,fallback[0]);
        assertThrows(java.io.IOException.class, () -> NativePollRequest.read(() -> {throw new java.io.IOException("offline");}, badge -> fail(), () -> fallback[0]++));
        assertEquals(1,fallback[0]);
        JSONObject legacy = new JSONObject().put("events",new JSONArray());
        assertSame(legacy, NativePollRequest.read(() -> legacy, badge -> fail(), () -> {throw new Exception("badge offline");}));
    }
}
