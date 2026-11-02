/** @file 停用旧版常驻通知服务，后台补取统一交给系统任务与厂商推送。 */
package io.github.yuanxiqwq.heyboxnotifier;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;

/** 保留旧服务入口用于升级清理，不再启动前台服务或发布后台运行通知。 */
public final class NotificationService extends Service {
    private static final int STATUS_ID = 12101;
    /** @return {boolean} 常驻服务已停用。 */
    static boolean isRunning() { return false; }
    /** @return {boolean} 交由调用方使用系统任务或界面轮询。 */
    static boolean requestPoll() { return false; }
    /** 工作区数据仍保留，但不再使用常驻通知承载系统角标。 */
    static void publishBadge() { }
    /**
     * 撤回旧版通知并维护系统周期任务，重复进入页面也不发布状态通知。
     * @param {Context} context 应用或系统广播上下文。
     * @param {DeviceState} device 设备偏好。
     */
    static void maintainFromVisible(Context context, DeviceState device) {
        context.stopService(new Intent(context, NotificationService.class));
        context.getSystemService(NotificationManager.class).cancel(STATUS_ID);
        org.json.JSONObject binding = device.read().optJSONObject("notifications");
        boolean enabled = !Http.session().isEmpty() && ((binding != null && binding.optBoolean("enabled")) || device.read().optBoolean("badgeEnabled", true));
        NotificationJob.maintain(context, enabled);
    }
    /** 系统尝试恢复旧服务时立即停止，不再补回被划走的通知。 */
    @Override public void onCreate() {
        super.onCreate();
        stopForeground(STOP_FOREGROUND_REMOVE);
        getSystemService(NotificationManager.class).cancel(STATUS_ID);
        stopSelf();
    }
    /** @param {Intent} intent 启动意图。 @param {int} flags 系统标志。 @param {int} id 启动序号。 @return {int} 禁止系统重新创建旧常驻服务。 */
    @Override public int onStartCommand(Intent intent, int flags, int id) { stopSelf(); return START_NOT_STICKY; }
    /** @param {Intent} intent 绑定意图。 @return {IBinder} 不开放绑定。 */
    @Override public IBinder onBind(Intent intent) { return null; }
}
