/** @file 使用 Android 系统通知消费账号收件箱，不依赖 Google Play Services。 */
package io.github.yuanxiqwq.heyboxnotifier;
import android.content.Context;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;

/** 前台补取与厂商消息共用账号校验和串行去重入口。 */
final class Notifications extends NotificationInbox {
    private final android.app.Application application;
    /** 服务与界面串行消费同一收件箱，避免重复弹窗。 */
    private static Notifications instance;
    /** @param {Context} context 应用上下文。 @param {DeviceState} device 共享存储。 @return {Notifications} 共享通知入口。 */
    static synchronized Notifications get(Context context, DeviceState device) { if (instance == null) instance = new Notifications(context.getApplicationContext(), device); return instance; }
    private final DeviceState device;
    private final NotificationManager manager;
    /** 开关请求序号防止较早的网络响应重新开启已关闭的通知。 */
    private final java.util.concurrent.atomic.AtomicInteger preferenceRevision = new java.util.concurrent.atomic.AtomicInteger();
    /** 应用通知的系统渠道，关闭后不伪装为已授权。 */
    private final String channelId;
    /** @return {String} 当前会话摘要。 @throws Exception 摘要不可用。 */
    static String currentSessionHash() throws Exception { return digest(Http.session()); }

    /**
     * 创建系统通知渠道，用户的渠道设置由系统保留。
     * @param {Context} activity 应用上下文。
     * @param {DeviceState} device 设备存储。
     */
    private Notifications(Context activity, DeviceState device) {
        this.application = (android.app.Application) activity.getApplicationContext(); this.device = device; manager = application.getSystemService(NotificationManager.class);
        channelId = NotificationChannels.ensure(activity);
    }
    /**
     * 返回当前设备开关及系统权限状态，并按有效绑定维护系统周期任务。
     * @return {JSONObject} 设备状态。
     * @throws Exception JSON 构造失败。
     */
    JSONObject state() throws Exception {
        JSONObject binding = device.read().optJSONObject("notifications");
        boolean allowed = allowed();
        boolean current = binding != null && currentSessionHash().equals(binding.optString("session"));
        boolean enabled = allowed && current && binding.optBoolean("enabled");
        NotificationJob.maintain(application, enabled);
        return new JSONObject().put("supported", true).put("enabled", enabled).put("backgroundPushConfigured", current && (binding.optBoolean("honorRegistered") || NotificationService.isRunning()));
    }
    /**
     * 将设备开关绑定到当前账号会话，首次开启不补发历史通知。
     * @param {boolean} enabled 开关状态。
     * @throws Exception 身份或权限不可用。
     */
    void set(boolean enabled) throws Exception {
        int revision = preferenceRevision.incrementAndGet();
        if (!enabled) { device.put("notifications", new JSONObject().put("enabled", false)); manager.cancelAll(); NotificationJob.maintain(application, false); HonorPush.disable(application, device); return; }
        if (!allowed()) throw new IllegalStateException("Notification permission denied");
        String token = Http.session(); if (token.isEmpty()) throw new IllegalStateException("Authentication required");
        JSONObject batch = Http.api("/api/native/notifications");
        synchronized (device) {
            if (!token.equals(Http.session()) || revision != preferenceRevision.get()) throw new IllegalStateException("Account or notification preference changed");
            device.put("notifications", new JSONObject().put("enabled", true).put("userId", batch.getString("userId")).put("session", digest(token)).put("generation", java.util.UUID.randomUUID().toString()).put("cursor", batch.getString("cursor")).put("seen", new JSONArray()));
        }
        NotificationJob.maintain(application, true);
        HonorPush.register(application, device);
    }
    /** @return {JSONObject} 加密存储中的当前绑定副本。 */
    @Override protected JSONObject binding() { return device.read().optJSONObject("notifications"); }
    /** @return {String} 当前会话摘要。 @throws Exception 摘要计算失败。 */
    @Override protected String session() throws Exception { return currentSessionHash(); }
    /** @param {String} cursor 已处理游标。 @return {JSONObject} 本站通知批次。 @throws Exception 请求失败。 */
    @Override protected JSONObject read(String cursor) throws Exception { return Http.api("/api/native/notifications?after=" + URLEncoder.encode(cursor, StandardCharsets.UTF_8.name())); }
    /** @return {boolean} 应用及渠道均允许通知。 */
    @Override protected boolean allowed() { return manager.areNotificationsEnabled() && manager.getNotificationChannel(channelId).getImportance() != NotificationManager.IMPORTANCE_NONE; }
    /** @param {JSONObject} event 已校验账号的事件。 @param {String} userId 所属账号。 @throws Exception 通知构造失败。 */
    @Override protected void show(JSONObject event, String userId) throws Exception {
        String id = event.getString("id");
        Intent intent = new Intent(application, MainActivity.class).setData(android.net.Uri.parse("heybox-notification:" + id)).putExtra("notificationPath", event.getString("path")).putExtra("notificationUser", userId);
        PendingIntent click = PendingIntent.getActivity(application, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        manager.notify(id, 0, new Notification.Builder(application, channelId).setSmallIcon(R.drawable.app_icon).setContentTitle(event.getString("title")).setContentText(event.getString("body")).setOnlyAlertOnce(true).setAutoCancel(true).setContentIntent(click).build());
    }
    /** @param {JSONObject} expected 原绑定。 @param {String} cursor 已处理游标。 @param {JSONArray} seen 去重标记。 @return {boolean} 是否已保存。 @throws Exception 加密落盘失败。 */
    @Override protected boolean commit(JSONObject expected, String cursor, JSONArray seen) throws Exception {
        synchronized (device) {
            JSONObject current = binding();
            if (!sameBinding(expected, current)) return false;
            current.put("cursor", cursor).put("seen", seen); device.put("notifications", current); return true;
        }
    }
    /** @param {JSONObject} expected 失效请求的原绑定，不覆盖已经开启的新账号。 @throws Exception 本地状态保存失败。 */
    @Override protected void disable(JSONObject expected) throws Exception {
        synchronized (device) {
            if (!sameBinding(expected, binding())) return;
            preferenceRevision.incrementAndGet(); device.put("notifications", new JSONObject().put("enabled", false)); manager.cancelAll(); NotificationJob.maintain(application, false);
        }
    }
    /**
     * 验证通知点击仍属于当前账号，账号切换后忽略旧系统提示。
     * @param {String} userId 通知所属账号。
     * @return {boolean} 是否允许打开。
     * @throws Exception 摘要错误。
     */
    boolean owns(String userId) throws Exception {
        JSONObject binding = device.read().optJSONObject("notifications");
        return binding != null && binding.optBoolean("enabled") && userId.equals(binding.optString("userId")) && digest(Http.session()).equals(binding.optString("session"));
    }
    /**
     * 计算会话摘要，避免将 Cookie 明文复制到设备文件。
     * @param {String} value 令牌。
     * @return {String} SHA-256 摘要。
     * @throws Exception 摘要不可用。
     */
    private static String digest(String value) throws Exception { return Updates.hex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
}
