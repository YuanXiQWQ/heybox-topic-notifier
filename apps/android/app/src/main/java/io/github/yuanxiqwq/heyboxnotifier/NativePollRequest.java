/** @file 独立处理合并响应中的角标和通知，并兼容只返回通知的服务端。 */
package io.github.yuanxiqwq.heyboxnotifier;
import org.json.JSONObject;

/** 请求、角标存储与回退端口可独立失败，通知游标交由既有收件箱管理。 */
final class NativePollRequest {
    /** 合并请求端口。 */
    interface Request {
        /** @return {JSONObject} 服务端响应。 @throws Exception 网络或认证失败。 */
        JSONObject read() throws Exception;
    }
    /** 角标基线接纳端口。 */
    interface Badge {
        /** @param {JSONObject} data 同账号角标响应。 @throws Exception 校验或落盘失败。 */
        void accept(JSONObject data) throws Exception;
    }
    /** 旧响应与请求失败时的角标回退端口。 */
    interface Fallback {
        /** 独立尝试角标更新。 @throws Exception 网络或落盘失败。 */
        void refresh() throws Exception;
    }
    /**
     * 接纳可用角标后返回通知，任一通道失败不丢弃另一通道的成功结果。
     * @param {Request} request 合并请求。
     * @param {Badge} badge 角标接纳器。
     * @param {Fallback} fallback 独立角标回退。
     * @return {JSONObject} 通知消费器所需响应。
     * @throws Exception 通知不可用或网络请求失败。
     */
    static JSONObject read(Request request, Badge badge, Fallback fallback) throws Exception {
        boolean badgeReceived = false;
        try {
            JSONObject data = request.read();
            JSONObject snapshot = data.optJSONObject("badge");
            if (snapshot != null) {
                badgeReceived = true;
                if (!snapshot.has("error")) {
                    try { badge.accept(snapshot); }
                    catch (Exception ignored) { /* 角标故障不阻断通知消费。 */ }
                }
            }
            if (data.has("error")) throw new IllegalStateException("Notifications unavailable");
            return data;
        } finally {
            if (!badgeReceived && !Thread.currentThread().isInterrupted()) {
                try { fallback.refresh(); }
                catch (Exception ignored) { /* 角标保留最近基线，后续调度重试。 */ }
            }
        }
    }
}
