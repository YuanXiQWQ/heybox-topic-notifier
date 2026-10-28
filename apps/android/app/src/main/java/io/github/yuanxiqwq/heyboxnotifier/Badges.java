/** @file 将当前账号工作区未确认数提供给系统角标，不生成帖子命中事件。 */
package io.github.yuanxiqwq.heyboxnotifier;
import org.json.JSONObject;

/** 网络读取不持有计数状态锁，界面可立即关闭角标或切换账号。 */
final class Badges {
    /** 当前进程的账号隔离计数。 */
    private static final BadgeCounter counter = new BadgeCounter();
    private static boolean loaded;
    /** @return {String} 会话的不可逆绑定摘要，持久化快照不保存登录令牌。 */
    private static String sessionKey() {
        String token=Http.session(); if (token.isEmpty()) return "";
        try { return java.util.Base64.getEncoder().encodeToString(java.security.MessageDigest.getInstance("SHA-256").digest(token.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
    /** @param {DeviceState} device 加密设备存储。 */
    private static synchronized void load(DeviceState device) {
        if (loaded) return;
        loaded=true;
        try { counter.restore(device.read().optJSONObject("badgeSnapshot")); } catch (Exception ignored) { counter.read("",true); }
    }
    /** @param {DeviceState} device 加密设备存储。 @throws Exception 本机状态无法保存。 */
    private static synchronized void persist(DeviceState device) throws Exception { device.put("badgeSnapshot",counter.snapshot()); }
    /** @param {DeviceState} device 当前设备偏好。 @return {int} 当前会话可展示的未确认数。 */
    static int count(DeviceState device) { load(device); return counter.read(sessionKey(), device.read().optBoolean("badgeEnabled", true)); }
    /** @param {DeviceState} device 设备状态。 @param {JSONObject} value 离线操作投影。 @throws Exception 状态无法保存。 */
    static void local(DeviceState device, JSONObject value) throws Exception { load(device); counter.setLocal(sessionKey(),value); persist(device); }
    /**
     * 获取权威计数，离线保留同账号最近结果；认证失效时清零。
     * @param {DeviceState} device 当前设备状态。
     * @throws Exception 网络或认证失败。
     */
    static void refresh(DeviceState device) throws Exception {
        load(device);
        String before = sessionKey();
        boolean enabled = device.read().optBoolean("badgeEnabled", true);
        int request = counter.begin(before, enabled);
        if (before.isEmpty() || !enabled) return;
        try {
            JSONObject data = Http.api("/api/native/badge?records=1");
            counter.acceptRecords(request,before,sessionKey(),data);
            persist(device);
        } catch (SecurityException error) {
            counter.read("",true); persist(device);
            throw error;
        }
    }
}
