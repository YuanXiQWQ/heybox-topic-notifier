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
import android.os.PowerManager;
import android.net.ConnectivityManager;
import android.net.Network;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicBoolean;

/** 常驻状态提示不响铃，新命中使用独立渠道；角标仅来自工作区计数。 */
public final class NotificationService extends Service {
    /** 前台服务通知与普通新命中通知使用不同标识。 */
    private static final int STATUS_ID = 12101;
    private static final String BACKGROUND = "background-silent-v2", BADGE = "workspace-badge-silent-v2";
    /** 只有实际数量变化才刷新状态，避免每轮补取重新弹出同一条提示。 */
    private int publishedCount = -1;
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private DeviceState device;
    private NotificationManager manager;
    /** 定时任务异常不终止后续收取；唤醒请求在同一线程合并。 */
    private volatile ScheduledFuture<?> scheduled;
    private final AtomicBoolean requested = new AtomicBoolean();
    /** 有限期 CPU 锁只在用户开启后台监听时维持，服务退出立即释放。 */
    private PowerManager.WakeLock wakeLock;
    private ConnectivityManager network;
    private ConnectivityManager.NetworkCallback networkCallback;
    /** 当前前台服务实例提供角标更新和即时补取入口，停止时释放引用。 */
    private static volatile NotificationService active;
    /** @return {boolean} 当前进程是否已有常驻收取线程。 */
    static boolean isRunning() { NotificationService service = active; return service != null && service.scheduled != null && !service.scheduled.isDone(); }
    /** @return {boolean} 是否已交给运行中的后台线程立即补取。 */
    static boolean requestPoll() {
        NotificationService service = active;
        if (service == null || !isRunning()) return false;
        if (service.requested.compareAndSet(false, true)) {
            try { service.worker.execute(() -> { try { service.poll(); } finally { service.requested.set(false); } }); }
            catch (java.util.concurrent.RejectedExecutionException ignored) { service.requested.set(false); return false; }
        }
        return true;
    }
    /** 更新运行中服务的无声状态；与停止互斥，禁止退出后重新发布旧状态。 */
    static void publishBadge() {
        NotificationService service = active;
        if (service != null) {
            synchronized (service) {
                int count = Badges.count(service.device);
                if (active != service || count == service.publishedCount) return;
                // 用户划走状态后不因补取或角标变化再次发布，后台收取继续运行。
                boolean visible = false;
                for (android.service.notification.StatusBarNotification item : service.manager.getActiveNotifications()) {
                    if (item.getId() == STATUS_ID) { visible = true; break; }
                }
                if (!visible) return;
                service.startForeground(STATUS_ID, service.status());
                service.publishedCount = count;
            }
        }
    }
    /**
     * 从可见界面或系统允许的开机广播恢复，受限时保留系统任务补偿。
     * @param {Context} context 可见界面或系统允许启动服务的广播上下文。
     * @param {DeviceState} device 设备偏好。
     */
    static void maintainFromVisible(Context context, DeviceState device) {
        Intent service = new Intent(context, NotificationService.class);
        if (needed(device)) {
            if (isRunning()) return;
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
        background.setShowBadge(false); background.setSound(null, null); background.enableVibration(false);
        NotificationChannel oldBackground = manager.getNotificationChannel("background");
        if (oldBackground != null && oldBackground.getImportance() == NotificationManager.IMPORTANCE_NONE) background.setImportance(NotificationManager.IMPORTANCE_NONE);
        manager.createNotificationChannel(background);
        NotificationChannel badge = new NotificationChannel(BADGE, getString(R.string.badge_channel), NotificationManager.IMPORTANCE_LOW);
        badge.setShowBadge(true); badge.setSound(null, null); badge.enableVibration(false);
        NotificationChannel oldBadge = manager.getNotificationChannel("workspace-badge");
        if (oldBadge != null && oldBadge.getImportance() == NotificationManager.IMPORTANCE_NONE) badge.setImportance(NotificationManager.IMPORTANCE_NONE);
        manager.createNotificationChannel(badge);
        startForeground(STATUS_ID, status());
        publishedCount = Badges.count(device);
        wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, getPackageName() + ":notifications");
        wakeLock.setReferenceCounted(false);
        network = getSystemService(ConnectivityManager.class);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            /** 网络重新可用时立即补取。 @param {Network} available 已连接网络。 */
            @Override public void onAvailable(Network available) { requestPoll(); }
        };
        try { network.registerDefaultNetworkCallback(networkCallback); }
        catch (RuntimeException ignored) { networkCallback = null; }
        active = this;
    }
    /** @param {Intent} intent 启动意图。 @param {int} flags 系统标志。 @param {int} id 启动序号。 @return {int} 有效会话下允许系统回收后恢复，清理最近任务不终止收取。 */
    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (device == null || !needed(device)) { stopSelf(); return START_NOT_STICKY; }
        try { publishBadge(); } catch (RuntimeException ignored) { /* 状态更新失败不取消后台监听。 */ }
        if (scheduled == null || scheduled.isDone()) scheduled = worker.scheduleWithFixedDelay(this::poll, 0, 5, TimeUnit.SECONDS);
        NotificationJob.maintain(this, true);
        return START_STICKY;
    }
    /** 同轮补取新事件与角标，离线失败保留游标，两路状态独立处理。 */
    private void poll() {
        try {
            if (!needed(device)) { stopSelf(); return; }
            synchronized (this) {
                if (active != this) return;
                org.json.JSONObject binding = device.read().optJSONObject("notifications");
                if (binding != null && binding.optBoolean("enabled")) wakeLock.acquire(120000);
                else if (wakeLock.isHeld()) wakeLock.release();
            }
            try { Notifications.get(this, device).pollWithBadge(); }
            catch (Exception ignored) { /* 下一轮从原游标重试。 */ }
            publishBadge();
        } catch (RuntimeException ignored) { /* 状态读取或系统通知失败也不能取消定时收取。 */ }
    }
    /** @return {Notification} 无声的后台状态及按工作区数量显示的系统角标。 */
    private Notification status() {
        int count = Badges.count(device);
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent open = PendingIntent.getActivity(this, STATUS_ID, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, count > 0 ? BADGE : BACKGROUND).setSmallIcon(R.drawable.app_icon)
            .setContentTitle(getString(R.string.background_running)).setContentText(getString(R.string.background_monitoring))
            .setDefaults(0).setSound(null).setVibrate(new long[0]).setPriority(Notification.PRIORITY_LOW)
            .setNumber(count).setOnlyAlertOnce(true).setOngoing(true).setShowWhen(false).setContentIntent(open).build();
    }
    /** @param {Intent} intent 绑定意图。 @return {IBinder} 不向其它组件开放绑定。 */
    @Override public IBinder onBind(Intent intent) { return null; }
    /** 清理最近任务只关闭界面；会话或后台功能关闭后才停止服务。 @param {Intent} rootIntent 原任务入口。 */
    @Override public void onTaskRemoved(Intent rootIntent) {
        if (device == null || !needed(device)) { stopSelf(); return; }
        NotificationJob.maintain(this, true);
        requestPoll();
    }
    /** 释放轮询线程及前台状态通知。 */
    @Override public void onDestroy() {
        synchronized (this) {
            if (active == this) active = null;
            worker.shutdownNow();
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            stopForeground(STOP_FOREGROUND_REMOVE);
            if (manager != null) manager.cancel(STATUS_ID);
        }
        if (networkCallback != null) {
            try { network.unregisterNetworkCallback(networkCallback); } catch (RuntimeException ignored) { /* 系统可能已注销网络回调。 */ }
        }
        super.onDestroy();
    }
}
