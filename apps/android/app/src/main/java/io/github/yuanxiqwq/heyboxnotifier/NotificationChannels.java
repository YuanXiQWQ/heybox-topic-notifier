/** @file 配置新命中提醒渠道，保留系统中由用户选择的声音与重要性。 */
package io.github.yuanxiqwq.heyboxnotifier;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.provider.Settings;

/** 提醒渠道与无声后台状态渠道分离，禁止绕过用户的静音或禁用选择。 */
final class NotificationChannels {
    /** 高优先级提醒渠道；Android 不允许原地提高已创建渠道的重要性。 */
    static final String ALERTS = "match-alerts-v2";

    /**
     * 获取可用的提醒渠道，只迁移可确认未被用户改动的默认渠道。
     * @param {Context} context 应用上下文。
     * @return {String} 实际发送提醒的渠道标识。
     */
    static String ensure(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(ALERTS) != null) return ALERTS;
        NotificationChannel previous = manager.getNotificationChannel("match-alerts");
        if (previous == null) previous = manager.getNotificationChannel("matches");
        boolean upgrade = previous == null || canUpgrade(previous);
        if (previous != null && !upgrade && "match-alerts".equals(previous.getId())) return previous.getId();
        // matches 兼容渠道拆出不参与角标计数的提醒，并保留不能提升的重要性。
        NotificationChannel channel = new NotificationChannel(ALERTS,
            context.getString(R.string.notification_channel), upgrade ? NotificationManager.IMPORTANCE_HIGH : previous.getImportance());
        channel.setShowBadge(false);
        channel.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, Notification.AUDIO_ATTRIBUTES_DEFAULT);
        if (previous != null) {
            channel.setSound(previous.getSound(), previous.getAudioAttributes());
            channel.setVibrationPattern(previous.getVibrationPattern());
            channel.enableVibration(previous.shouldVibrate());
            channel.enableLights(previous.shouldShowLights());
            channel.setLightColor(previous.getLightColor());
            channel.setLockscreenVisibility(previous.getLockscreenVisibility());
        }
        manager.createNotificationChannel(channel);
        return ALERTS;
    }

    /**
     * 判断已有渠道是否仍为可确认的应用默认提醒，旧系统无法区分用户选择时保留原渠道。
     * @param {NotificationChannel} channel 已保存的渠道。
     * @return {boolean} 是否允许建立高优先级提醒渠道。
     */
    static boolean canUpgrade(NotificationChannel channel) {
        return Build.VERSION.SDK_INT >= 29 && !channel.hasUserSetImportance()
            && channel.getImportance() == NotificationManager.IMPORTANCE_DEFAULT
            && Settings.System.DEFAULT_NOTIFICATION_URI.equals(channel.getSound())
            && (Build.VERSION.SDK_INT < 30 || !channel.hasUserSetSound());
    }
}
