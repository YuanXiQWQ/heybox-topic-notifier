/** @file 以会话和请求序号隔离工作区角标，状态锁内不执行网络操作。 */
package io.github.yuanxiqwq.heyboxnotifier;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** 角标计数只属于当前会话，较早的请求不能覆盖较新的结果。 */
final class BadgeCounter {
    private String session = "";
    private int count, revision;
    private String userId = "";
    private boolean detailed;
    /** 仅复用当前进程已确认的基线；重启或本机基线变动后重新获取。 */
    private String version = "";
    /** 服务端工作区基线与本机尚未同步的记录投影。 */
    private final Map<String,String> workspace = new HashMap<>();
    private final Map<String,JSONObject> local = new HashMap<>();
    /** @param {String} token 当前会话。 @param {boolean} enabled 角标开关。 @return {int} 可显示数量。 */
    synchronized int read(String token, boolean enabled) {
        if (!token.equals(session)) { session = token; count = 0; userId=""; detailed=false; version=""; workspace.clear(); local.clear(); revision++; }
        if (!enabled || token.isEmpty()) return 0;
        if (!detailed) return count;
        Map<String,String> visible = new HashMap<>(workspace);
        for (JSONObject edit : local.values()) apply(visible,edit);
        return new HashSet<>(visible.values()).size();
    }
    /** @param {String} token 请求会话。 @param {boolean} enabled 角标开关。 @return {int} 请求序号。 */
    synchronized int begin(String token, boolean enabled) { read(token, enabled); return ++revision; }
    /** @param {String} token 当前会话。 @return {String} 可以复用的基线版本，缺少完整基线时为空。 */
    synchronized String version(String token) { read(token,true); return detailed ? version : ""; }
    /**
     * 接纳仍属于当前账号和最近请求的响应。
     * @param {int} request 请求序号。
     * @param {String} token 请求开始时的会话。
     * @param {String} current 当前会话。
     * @param {boolean} enabled 当前开关。
     * @param {int} value 工作区未确认数。
     */
    synchronized void accept(int request, String token, String current, boolean enabled, int value) {
        read(current, enabled);
        if (request == revision && token.equals(current) && !current.isEmpty() && enabled) count = Math.max(0, value);
    }
    /** @param {Map<String,String>} records 待投影工作区。 @param {JSONObject} edit 单条记录的最终本机操作。 */
    private static void apply(Map<String,String> records, JSONObject edit) {
        if (edit.optBoolean("workspace")) records.put(edit.optString("id"),edit.optString("postId"));
        else records.remove(edit.optString("id"));
    }
    /** @param {int} request 请求序号。 @param {String} token 请求会话。 @param {String} current 当前会话。 @param {JSONObject} data 权威工作区快照或同账号版本确认。 @throws Exception 数据无效或版本不匹配。 */
    synchronized void acceptRecords(int request, String token, String current, JSONObject data) throws Exception {
        read(current,true);
        if (request!=revision || !token.equals(current) || current.isEmpty()) return;
        String account=data.getString("userId");
        if (data.optBoolean("unchanged")) {
            if (!detailed || !account.equals(userId) || version.isEmpty() || !version.equals(data.optString("version"))) {
                version="";
                throw new IllegalArgumentException("Invalid badge baseline");
            }
            return;
        }
        if (!account.equals(userId)) local.clear();
        Map<String,String> next=new HashMap<>(); JSONArray records=data.getJSONArray("records");
        for (int i=0;i<records.length();i++) { JSONObject record=records.getJSONObject(i); next.put(record.getString("id"),record.getString("postId")); }
        workspace.clear(); workspace.putAll(next); userId=account; detailed=true; version=data.optString("version");
    }
    /** @param {String} token 当前会话。 @param {JSONObject} value 页面账号与完整离线队列投影。 @throws Exception 无效或跨账号请求。 */
    synchronized void setLocal(String token, JSONObject value) throws Exception {
        read(token,true);
        if (!detailed || token.isEmpty() || !userId.equals(value.getString("userId"))) return;
        Map<String,JSONObject> next=new HashMap<>(); JSONArray records=value.getJSONArray("records");
        for (int i=0;i<records.length();i++) {
            JSONObject record=records.getJSONObject(i);
            if (record.getString("id").isEmpty() || record.getString("postId").isEmpty() || !(record.get("workspace") instanceof Boolean)) throw new IllegalArgumentException("Invalid badge record");
            next.put(record.getString("id"),new JSONObject(record.toString()));
        }
        for (Map.Entry<String,JSONObject> entry : local.entrySet()) if (!next.containsKey(entry.getKey())) apply(workspace,entry.getValue());
        local.clear(); local.putAll(next); version=""; revision++;
    }
    /** @return {JSONObject} 可存入加密设备存储的账号隔离快照。 @throws Exception 快照构造失败。 */
    synchronized JSONObject snapshot() throws Exception {
        JSONArray records=new JSONArray();
        for (Map.Entry<String,String> entry : workspace.entrySet()) records.put(new JSONObject().put("id",entry.getKey()).put("postId",entry.getValue()));
        return new JSONObject().put("session",session).put("userId",userId).put("records",records).put("local",new JSONArray(local.values())).put("detailed",detailed);
    }
    /** @param {JSONObject} saved 加密设备快照。 @throws Exception 快照无效。 */
    synchronized void restore(JSONObject saved) throws Exception {
        if (saved==null || !saved.optBoolean("detailed")) return;
        session=saved.getString("session");
        acceptRecords(revision,session,session,saved);
        setLocal(session,new JSONObject().put("userId",userId).put("records",saved.getJSONArray("local")));
    }
}
