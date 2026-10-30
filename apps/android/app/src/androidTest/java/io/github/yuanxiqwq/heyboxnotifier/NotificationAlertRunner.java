/** @file 在独立安装包中验证真实 Android 提醒渠道、升级兼容与系统通知载荷。 */
package io.github.yuanxiqwq.heyboxnotifier;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.service.notification.StatusBarNotification;
import org.json.JSONObject;

/** 每个场景使用全新独立安装，不能在用户正式包中执行。 */
public final class NotificationAlertRunner extends Instrumentation {
    /** 本次渠道场景。 */
    private String scenario;

    /** @param {Bundle} arguments 独立场景名称及安装确认。 */
    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        if (arguments == null || !"true".equals(arguments.getString("isolatedNotificationTest"))
            || !getTargetContext().getPackageName().endsWith(".alerts.audit")) {
            finish(Activity.RESULT_CANCELED, new Bundle()); return;
        }
        scenario = arguments.getString("scenario", "fresh");
        start();
    }

    /** 创建隔离渠道、发送通知并核查系统保留的实际重要性和声音。 */
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            NotificationManager manager = getTargetContext().getSystemService(NotificationManager.class);
            require(manager.getNotificationChannels().isEmpty(), "requires fresh isolated install");
            NotificationChannel previous = null;
            if (!"fresh".equals(scenario)) {
                int importance = "blocked".equals(scenario) ? NotificationManager.IMPORTANCE_NONE
                    : "low".equals(scenario) ? NotificationManager.IMPORTANCE_LOW : NotificationManager.IMPORTANCE_DEFAULT;
                previous = new NotificationChannel(scenario.startsWith("legacy") ? "matches" : "match-alerts", "Old alerts", importance);
                previous.setShowBadge(false);
                if (scenario.endsWith("muted")) previous.setSound(null, null);
                else if ("custom".equals(scenario)) previous.setSound(Settings.System.DEFAULT_ALARM_ALERT_URI, android.app.Notification.AUDIO_ATTRIBUTES_DEFAULT);
                manager.createNotificationChannel(previous);
            }
            String channelId = NotificationChannels.ensure(getTargetContext());
            NotificationChannel channel = manager.getNotificationChannel(channelId);
            boolean upgraded = "fresh".equals(scenario) || (("default".equals(scenario) || "legacy".equals(scenario)) && android.os.Build.VERSION.SDK_INT >= 29);
            require(channelId.equals(upgraded || scenario.startsWith("legacy") ? NotificationChannels.ALERTS : "match-alerts"), "channel migration decision");
            require(channel.getImportance() == (upgraded ? NotificationManager.IMPORTANCE_HIGH : previous.getImportance()), "importance preserved or raised from untouched default");
            require(java.util.Objects.equals(channel.getSound(), previous == null ? Settings.System.DEFAULT_NOTIFICATION_URI : previous.getSound()), "sound preference preserved");
            require(!channel.canShowBadge(), "alert channel cannot change workspace badge");
            require(NotificationChannels.ensure(getTargetContext()).equals(channelId), "channel setup is idempotent");
            if (!"blocked".equals(scenario)) {
                Notifications.get(getTargetContext(), DeviceState.get(getTargetContext())).show(new JSONObject()
                    .put("id", "isolated-alert-" + scenario).put("path", "/").put("title", "隔离通知验证")
                    .put("body", "横幅与系统声音：" + scenario), "isolated-user");
                SystemClock.sleep(800);
                StatusBarNotification[] posted = manager.getActiveNotifications();
                require(posted.length == 1 && channelId.equals(posted[0].getNotification().getChannelId()), "real notification uses selected channel");
            }
            result.putString("stream", "PASS " + scenario + " channel=" + channelId + " importance=" + channel.getImportance() + " sound=" + channel.getSound() + "\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "FAIL " + scenario + ": " + error + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    /** @param {boolean} value 检查结果。 @param {String} message 不满足的要求。 */
    private static void require(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
}
