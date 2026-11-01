/** @file 在系统开机或本应用升级后恢复用户已开启的常驻通知监听。 */
package io.github.yuanxiqwq.heyboxnotifier;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 只处理系统生命周期广播，不接受外部组件自行唤醒。 */
public final class NotificationBootReceiver extends BroadcastReceiver {
    /** @param {Context} context 应用上下文。 @param {Intent} intent 系统广播。 */
    @Override public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) return;
        try { NotificationService.maintainFromVisible(context, DeviceState.get(context)); }
        catch (Exception ignored) { NotificationJob.schedule(context); }
    }
}
