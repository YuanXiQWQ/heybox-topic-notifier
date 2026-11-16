/** @file 以独立前台任务下载已确认的更新，并在系统通知中显示同一份下载进度。 */
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
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/** 页面切换、返回桌面和关闭窗口不终止用户已确认的下载。 */
public final class UpdateService extends Service {
    static final int NOTIFICATION_ID = 12102;
    private static final String CHANNEL = "application-updates";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean running = new AtomicBoolean();
    private final AtomicBoolean publicationPending = new AtomicBoolean();
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private Updates updates;
    private NotificationManager manager;
    private PowerManager.WakeLock wakeLock;
    private boolean destroyed;

    /** @param {Context} context 发起下载或恢复已确认下载的前台应用。 */
    static void start(Context context) {
        androidx.core.content.ContextCompat.startForegroundService(context, new Intent(context, UpdateService.class));
    }

    /** 建立无声进度渠道，保留用户对渠道的配置。 */
    @Override public void onCreate() {
        super.onCreate();
        manager = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, getString(R.string.update_channel), NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false); channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    /** @param {Intent} intent 下载请求。 @param {int} flags 启动标志。 @param {int} startId 本次请求。 @return {int} 进程被回收后由下次应用启动续传。 */
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!running.compareAndSet(false, true)) return START_NOT_STICKY;
        updates = Updates.current();
        startForeground(NOTIFICATION_ID, notification(new JSONObject(), true, false));
        if (updates == null) { running.set(false); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); return START_NOT_STICKY; }
        wakeLock = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, getPackageName() + ":update-download");
        wakeLock.acquire(30L * 60 * 1000);
        updates.observeDownload(this::publish);
        worker.execute(() -> {
            boolean failed = false;
            try { updates.download(); }
            catch (Exception error) { failed = true; }
            finally {
                boolean error = failed;
                handler.post(() -> finishDownload(error));
            }
        });
        return START_NOT_STICKY;
    }

    /** 在主线程串行结束任务，避免重复请求与停止服务争抢 CPU 锁和状态订阅。 @param {boolean} failed 下载是否失败。 */
    private void finishDownload(boolean failed) {
        if (destroyed) return;
        handler.removeCallbacksAndMessages(null);
        updates.observeDownload(null);
        running.set(false);
        if (wakeLock.isHeld()) wakeLock.release();
        stopForeground(STOP_FOREGROUND_DETACH);
        try { manager.notify(NOTIFICATION_ID, notification(updates.state(), false, failed)); }
        catch (Exception ignored) { manager.cancel(NOTIFICATION_ID); }
        stopSelf();
    }

    /** 进度来自更新协调器，关于页与系统通知不会各自维护下载任务。 */
    private void publish() {
        // 合并密集进度，避免快速网络下触发系统的通知频率限制。
        if (!publicationPending.compareAndSet(false, true)) return;
        handler.postDelayed(() -> {
            publicationPending.set(false);
            if (destroyed || !running.get()) return;
            try { manager.notify(NOTIFICATION_ID, notification(updates.state(), true, false)); }
            catch (Exception ignored) { /* 通知不可用时仍保留关于页进度与断点续传。 */ }
        }, 500);
    }

    /** @param {JSONObject} state 共享更新状态。 @param {boolean} active 是否正在下载。 @param {boolean} failed 下载是否失败。 @return {Notification} 系统进度或完成通知。 */
    Notification notification(JSONObject state, boolean active, boolean failed) {
        boolean ready = "downloaded".equals(state.optString("status"));
        String text = getString(failed || "error".equals(state.optString("status")) ? R.string.update_failed : ready ? R.string.update_ready : R.string.update_downloading);
        Intent open = new Intent(this, MainActivity.class).putExtra("updatePage", true)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(this, NOTIFICATION_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = new Notification.Builder(this, CHANNEL).setSmallIcon(R.drawable.app_icon)
            .setContentTitle(getString(R.string.app_name)).setContentText(text).setContentIntent(content)
            .setOnlyAlertOnce(true).setShowWhen(false).setOngoing(active && !ready).setAutoCancel(!active)
            .setCategory(Notification.CATEGORY_PROGRESS);
        if (active && !ready) builder.setProgress(100, state.optInt("progress"), !state.has("progress"));
        return builder.build();
    }

    /** @param {int} startId 超时请求。 @param {int} type 超时的前台服务类型。 */
    @Override public void onTimeout(int startId, int type) { if (updates != null) updates.cancelDownload(); stopSelf(); }
    /** 系统停止任务时保存检查点并释放服务引用，完整校验包不受影响。 */
    @Override public void onDestroy() {
        destroyed = true;
        handler.removeCallbacksAndMessages(null);
        if (updates != null) { if (running.get()) updates.cancelDownload(); updates.observeDownload(null); }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        worker.shutdown(); super.onDestroy();
    }
    /** @param {Intent} intent 绑定请求。 @return {IBinder} 本服务不提供绑定接口。 */
    @Override public IBinder onBind(Intent intent) { return null; }
}
