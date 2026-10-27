/** @file 以账号会话和持久游标控制原生通知补取，独立于 Android 界面和厂商 SDK。 */
package io.github.yuanxiqwq.heyboxnotifier;
import org.json.JSONArray;
import org.json.JSONObject;

/** 系统外壳提供存储、网络和通知展示；消费规则可在 JVM 中验证。 */
abstract class NotificationInbox {
    /** 每次任务最多读取十批，更多积压交回系统重新调度。 */
    private static final int MAX_PAGES = 10;
    /** 与服务端分页上限保持一致，满批时继续读取。 */
    private static final int PAGE_SIZE = 100;
    /** @return {JSONObject} 当前设备通知绑定的副本。 */
    protected abstract JSONObject binding();
    /** @return {String} 当前会话摘要。 @throws Exception 会话读取失败。 */
    protected abstract String session() throws Exception;
    /** @param {String} cursor 已处理游标。 @return {JSONObject} 已认证通知批次。 @throws Exception 请求失败。 */
    protected abstract JSONObject read(String cursor) throws Exception;
    /** @return {boolean} 系统是否仍允许展示通知。 */
    protected abstract boolean allowed();
    /** @param {JSONObject} event 通知内容。 @param {String} userId 所属账号。 @throws Exception 系统展示失败。 */
    protected abstract void show(JSONObject event, String userId) throws Exception;
    /** @param {JSONObject} expected 被消费的绑定。 @param {String} cursor 成功处理游标。 @param {JSONArray} seen 去重标记。 @return {boolean} 绑定仍匹配且已保存。 @throws Exception 落盘失败。 */
    protected abstract boolean commit(JSONObject expected, String cursor, JSONArray seen) throws Exception;
    /** @param {JSONObject} expected 仅停用仍属于本次请求的绑定。 @throws Exception 持久化失败。 */
    protected abstract void disable(JSONObject expected) throws Exception;

    /**
     * 连续补取积压事件，每次展示前重新核验账号与系统权限。
     * @return {boolean} 达到工作上限时请求后续任务继续补取。
     * @throws Exception 网络或持久化失败，未确认游标保持可重试。
     */
    synchronized boolean poll() throws Exception {
        JSONObject expected = binding();
        if (expected == null || !expected.optBoolean("enabled")) return false;
        String cursor = expected.optString("cursor");
        JSONArray seen = expected.optJSONArray("seen");
        if (seen == null) seen = new JSONArray();
        for (int page = 0; page < MAX_PAGES; page++) {
            if (!current(expected) || !allowed() || Thread.currentThread().isInterrupted()) return false;
            JSONObject batch = read(cursor);
            if (!current(expected)) return false;
            if (!batch.getString("userId").equals(expected.optString("userId"))) { disable(expected); return false; }
            JSONArray events = batch.getJSONArray("events");
            for (int index = 0; index < events.length(); index++) {
                if (!current(expected) || !allowed() || Thread.currentThread().isInterrupted()) return false;
                JSONObject event = events.getJSONObject(index);
                String next = event.getString("cursor"), id = event.getString("id");
                if (next.compareTo(cursor) <= 0) throw new IllegalStateException("Notification cursor did not advance");
                boolean duplicate = false;
                for (int item = 0; item < seen.length(); item++) if (id.equals(seen.getString(item))) duplicate = true;
                if (!duplicate) {
                    show(event, expected.getString("userId"));
                    seen.put(id); if (seen.length() > 2048) seen.remove(0);
                }
                if (!commit(expected, next, seen)) return false;
                cursor = next;
            }
            if (events.length() < PAGE_SIZE) return false;
        }
        return true;
    }
    /**
     * 验证请求和展示之间没有切换会话，也不覆盖期间创建的新绑定。
     * @param {JSONObject} expected 请求开始时的绑定。
     * @return {boolean} 仍可处理该账号的事件。
     * @throws Exception 会话读取或停用失败。
     */
    private boolean current(JSONObject expected) throws Exception {
        if (!sameBinding(expected, binding())) return false;
        if (!session().equals(expected.optString("session"))) { disable(expected); return false; }
        return sameBinding(expected, binding());
    }
    /**
     * 比较账号、会话及开启批次；兼容尚未保存批次标识的设备绑定。
     * @param {JSONObject} expected 请求绑定。
     * @param {JSONObject} current 当前绑定。
     * @return {boolean} 是否仍是同一次开启。
     */
    static boolean sameBinding(JSONObject expected, JSONObject current) {
        return expected != null && current != null && current.optBoolean("enabled")
            && expected.optString("userId").equals(current.optString("userId"))
            && expected.optString("session").equals(current.optString("session"))
            && expected.optString("generation").equals(current.optString("generation"));
    }
}
