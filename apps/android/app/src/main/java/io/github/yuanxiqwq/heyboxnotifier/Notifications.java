/** @file 使用 Android 系统通知消费账号收件箱，不依赖 Google Play Services。 */
package io.github.yuanxiqwq.heyboxnotifier;
import android.content.Context;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;

/** 前台补取与厂商消息共用账号校验和串行去重入口。 */
final class Notifications {
    private final Context activity;
    /** 服务与界面串行消费同一收件箱，避免重复弹窗。 */
    private static Notifications instance;
    /** @param {Context} context 应用上下文。 @param {DeviceState} device 共享存储。 @return {Notifications} 共享通知入口。 */
    static synchronized Notifications get(Context context, DeviceState device) { if (instance == null) instance = new Notifications(context.getApplicationContext(), device); return instance; }
    private final DeviceState device;
    private final NotificationManager manager;
    /** 应用通知的系统渠道，关闭后不伪装为已授权。 */
    private static final String CHANNEL = "matches";
    /** @return {String} 当前会话摘要。 @throws Exception 摘要不可用。 */
    static String currentSessionHash() throws Exception { return digest(Http.session()); }

    /**
     * 创建系统通知渠道，用户的渠道设置由系统保留。
     * @param {Context} activity 应用上下文。
     * @param {DeviceState} device 设备存储。
     */
    private Notifications(Context activity, DeviceState device) {
        this.activity = activity; this.device = device; manager = activity.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, activity.getString(R.string.notification_channel), NotificationManager.IMPORTANCE_DEFAULT));
    }
    /**
     * 返回当前设备开关及系统权限状态。
     * @return {JSONObject} 设备状态。
     * @throws Exception JSON 构造失败。
     */
    JSONObject state() throws Exception {
        JSONObject binding = device.read().optJSONObject("notifications");
        boolean allowed = manager.areNotificationsEnabled() && manager.getNotificationChannel(CHANNEL).getImportance() != NotificationManager.IMPORTANCE_NONE;
        boolean current = binding != null && currentSessionHash().equals(binding.optString("session"));
        return new JSONObject().put("supported", true).put("enabled", allowed && current && binding.optBoolean("enabled")).put("backgroundPushConfigured", current && binding.optBoolean("honorRegistered"));
    }
    /**
     * 将设备开关绑定到当前账号会话，首次开启不补发历史通知。
     * @param {boolean} enabled 开关状态。
     * @throws Exception 身份或权限不可用。
     */
    synchronized void set(boolean enabled) throws Exception {
        if (!enabled) { device.put("notifications", new JSONObject().put("enabled", false)); manager.cancelAll(); HonorPush.disable(activity, device); return; }
        if (!manager.areNotificationsEnabled() || manager.getNotificationChannel(CHANNEL).getImportance() == NotificationManager.IMPORTANCE_NONE) throw new IllegalStateException("Notification permission denied");
        JSONObject batch = Http.api("/api/native/notifications");
        String token = Http.session(); if (token.isEmpty()) throw new IllegalStateException("Authentication required");
        device.put("notifications", new JSONObject().put("enabled", true).put("userId", batch.getString("userId")).put("session", digest(token)).put("cursor", batch.getString("cursor")).put("seen", new JSONArray()));
        HonorPush.register(activity, device);
    }
    /**
     * 补取未消费事件并验证账号会话，系统通知 ID 保证重复事件更新同一提示。
     * @throws Exception 网络或设备状态失败。
     */
    synchronized void poll() throws Exception {
        JSONObject binding = device.read().optJSONObject("notifications");
        if (binding == null || !binding.optBoolean("enabled")) return;
        if (!digest(Http.session()).equals(binding.optString("session"))) { set(false); return; }
        JSONObject batch = Http.api("/api/native/notifications?after=" + URLEncoder.encode(binding.optString("cursor"), StandardCharsets.UTF_8.name()));
        if (!batch.getString("userId").equals(binding.optString("userId"))) { set(false); return; }
        JSONArray events = batch.getJSONArray("events"), seen = binding.getJSONArray("seen");
        for (int index = 0; index < events.length(); index++) {
            JSONObject event = events.getJSONObject(index); String id = event.getString("id"); boolean duplicate = false;
            for (int item = 0; item < seen.length(); item++) if (id.equals(seen.getString(item))) duplicate = true;
            if (!duplicate) {
                Intent intent = new Intent(activity, MainActivity.class).putExtra("notificationPath", event.getString("path")).putExtra("notificationUser", binding.getString("userId"));
                PendingIntent click = PendingIntent.getActivity(activity, id.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                manager.notify(id, 0, new Notification.Builder(activity, CHANNEL).setSmallIcon(R.drawable.app_icon).setContentTitle(event.getString("title")).setContentText(event.getString("body")).setAutoCancel(true).setContentIntent(click).build());
                seen.put(id); if (seen.length() > 2048) seen.remove(0);
            }
            synchronized (device) {
                JSONObject current = device.read().optJSONObject("notifications");
                if (current == null || !current.optBoolean("enabled") || !current.optString("session").equals(binding.optString("session"))) return;
                current.put("cursor", event.getString("cursor")).put("seen", seen); device.put("notifications", current);
            }
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
