/** @file 接收 Android 安装结果并处理系统要求的用户确认。 */
package io.github.yuanxiqwq.heyboxnotifier;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.widget.Toast;

/** 系统安装结果接收器只处理本应用创建的显式 PendingIntent。 */
public final class InstallReceiver extends BroadcastReceiver {
    /**
     * 保留系统安装确认，不尝试绕过设备安全要求。
     * @param {Context} context 应用上下文。
     * @param {Intent} intent 系统安装结果。
     */
    @Override public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); context.startActivity(confirm); }
        } else if (status != PackageInstaller.STATUS_SUCCESS) Toast.makeText(context, R.string.update_failed, Toast.LENGTH_LONG).show();
    }
}
