/** @file 通过用户可见的系统前台服务持续收取通知与同步角标，不依赖 GMS。 */
package io.github.yuanxiqwq.heyboxnotifier;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** 常驻状态提示不响铃，新命中使用独立渠道；角标仅来自工作区计数。 */
public final class NotificationService extends Service {
    /** 前台服务通知与普通新命中通知使用不同标识。 */
    private static final int STATUS_ID = 12101;
    private static final String BACKGROUND = "background", BADGE = "workspace-badge";
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private DeviceState device;
    private NotificationManager manager;
    private boolean scheduled;
    /** 当前前台服务实例只用于立即刷新角标，停止时释放引用。 */
    private static volatile NotificationService active;
    /** @return {boolean} 当前进程是否已有常驻收取线程。 */
    static boolean isRunning() { return active != null; }
    /** 更新已运行服务的无声状态通知，关闭角标时无需等待网络。 */
    static void publishBadge() {
        NotificationService service = active;
        if (service != null) service.manager.notify(STATUS_ID, service.status());
    }
    /**
     * 仅从可见界面或用户开启动作启动，后台任务不绕过系统的启动限制。
     * @param {Context} context 当前可见界面。
     * @param {DeviceState} device 设备偏好。
     */
    static void maintainFromVisible(Context context, DeviceState device) {
        Intent service = new Intent(context, NotificationService.class);
        if (needed(device)) {
            try { context.startForegroundService(service); }
            catch (RuntimeException ignored) { NotificationJob.maintain(context, true); }
        } else context.stopService(service);
    }
    /** @param {DeviceState} device 设备状态。 @return {boolean} 当前会话是否仍需要后台工作。 */
    private static boolean needed(DeviceState device) {
        org.json.JSONObject binding = device.read().optJSONObject("notifications");
        return !Http.session().isEmpty() && ((binding != null && binding.optBoolean("enabled")) || device.read().optBoolean("badgeEnabled", true));
    }
    /** 初始化系统渠道，常驻服务在系统要求的时限内进入前台。 */
    @Override public void onCreate() {
        super.onCreate();
        try { device = DeviceState.get(this); } catch (Exception error) { stopSelf(); return; }
        manager = getSystemService(NotificationManager.class);
        NotificationChannel background = new NotificationChannel(BACKGROUND, getString(R.string.background_channel), NotificationManager.IMPORTANCE_LOW);
        background.setShowBadge(false); background.setSound(null, null); manager.createNotificationChannel(background);
        NotificationChannel badge = new NotificationChannel(BADGE, getString(R.string.badge_channel), NotificationManager.IMPORTANCE_LOW);
        badge.setShowBadge(true); badge.setSound(null, null); manager.createNotificationChannel(badge);
        startForeground(STATUS_ID, status());
        active = this;
    }
    /** @param {Intent} intent 启动意图。 @param {int} flags 系统标志。 @param {int} id 启动序号。 @return {int} 系统回收后允许恢复，用户清理任务时停止。 */
    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (device == null || !needed(device)) { stopSelf(); return START_NOT_STICKY; }
        publishBadge();
        if (!scheduled) { scheduled = true; worker.scheduleWithFixedDelay(this::poll, 0, 15, TimeUnit.SECONDS); }
        return START_STICKY;
    }
    /** 收取新事件和角标，离线失败保留游标，避免网络错误丢失通知。 */
    private void poll() {
        if (!needed(device)) { stopSelf(); return; }
        try { Badges.refresh(device); } catch (Exception ignored) { /* 同账号断网保留最近计数。 */ }
        try { Notifications.get(this, device).poll(); } catch (Exception ignored) { /* 下一轮从原游标重试。 */ }
        manager.notify(STATUS_ID, status());
    }
    /** @return {Notification} 无声的后台状态及按工作区数量显示的系统角标。 */
    private Notification status() {
        int count = Badges.count(device);
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent open = PendingIntent.getActivity(this, STATUS_ID, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, count > 0 ? BADGE : BACKGROUND).setSmallIcon(R.drawable.app_icon)
            .setContentTitle(getString(R.string.background_running)).setContentText(getString(R.string.background_monitoring))
            .setNumber(count).setOnlyAlertOnce(true).setOngoing(true).setShowWhen(false).setContentIntent(open).build();
    }
    /** @param {Intent} intent 绑定意图。 @return {IBinder} 不向其它组件开放绑定。 */
    @Override public IBinder onBind(Intent intent) { return null; }
    /** 用户清理任务时终止常驻线程。 @param {Intent} rootIntent 原任务入口。 */
    @Override public void onTaskRemoved(Intent rootIntent) { stopSelf(); }
    /** 释放轮询线程及前台状态通知。 */
    @Override public void onDestroy() { active = null; worker.shutdownNow(); stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy(); }
}
