/** @file 在独立无 GMS 模拟器上验证真实系统通知、后台服务和加密设备状态。 */
package io.github.yuanxiqwq.heyboxnotifier;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import android.webkit.CookieManager;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import org.json.JSONObject;

/** 仅在明确指定的离线测试模拟器运行，合成会话不访问生产账号。 */
public final class NativeSmokeRunner extends Instrumentation {
    private Activity activity;
    private DeviceState device;
    private NotificationManager manager;
    private final StringBuilder passed = new StringBuilder();

    /** @param {Bundle} arguments 必须显式确认独立离线模拟器。 */
    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        if (arguments == null || !"true".equals(arguments.getString("isolatedOfflineEmulator"))) {
            Bundle result = new Bundle(); result.putString("stream", "Requires isolatedOfflineEmulator=true and offline emulator");
            finish(Activity.RESULT_CANCELED, result); return;
        }
        start();
    }

    /** 执行系统级检查，结束时移除合成会话、通知和测试偏好。 */
    @Override public void onStart() {
        Bundle result = new Bundle(); int status = Activity.RESULT_CANCELED; boolean isolated = false;
        try {
            android.net.ConnectivityManager network = getTargetContext().getSystemService(android.net.ConnectivityManager.class);
            require(network.getActiveNetwork() == null, "emulator must be offline");
            require(BuildConfig.DEBUG, "requires debug target");
            require("ranchu".equals(android.os.Build.HARDWARE) || "goldfish".equals(android.os.Build.HARDWARE), "requires disposable Android emulator");
            try {
                getTargetContext().getPackageManager().getPackageInfo("com.google.android.gms", 0);
                throw new AssertionError("requires emulator without Google Play Services");
            } catch (android.content.pm.PackageManager.NameNotFoundException expected) { /* AOSP 镜像不包含 GMS。 */ }
            isolated = true;
            device = DeviceState.get(getTargetContext());
            manager = getTargetContext().getSystemService(NotificationManager.class);
            require(manager.areNotificationsEnabled(), "test notification permission");
            String token = "isolated-native-smoke-session";
            String session = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
            device.put("badgeEnabled", true);
            device.put("notifications", new JSONObject().put("enabled", false));
            device.put("badgeSnapshot", new JSONObject("{\"userId\":\"smoke-user\",\"detailed\":true,\"records\":[{\"id\":\"a\",\"postId\":\"p1\"},{\"id\":\"b\",\"postId\":\"p1\"},{\"id\":\"c\",\"postId\":\"p2\"}],\"local\":[]}").put("session", session));
            runOnMainSync(() -> {
                CookieManager.getInstance().setCookie(BuildConfig.APP_ORIGIN, "heybox_session=" + token + "; Path=/; Secure");
                CookieManager.getInstance().flush();
            });
            device.put("notifications", new JSONObject().put("enabled", true).put("userId", "smoke-user")
                .put("session", Notifications.currentSessionHash()).put("generation", "smoke")
                .put("cursor", "").put("seen", new org.json.JSONArray()));
            activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            require(!NotificationService.isRunning(), "no ongoing foreground service");
            require(statusNotification() == null, "no background status notification");
            require(Badges.count(device) == 2, "workspace count deduplicates posts");
            android.app.NotificationChannel alerts = manager.getNotificationChannel(NotificationChannels.ensure(getTargetContext()));
            require(!alerts.canShowBadge(), "new matches do not count as workspace badge");
            getTargetContext().startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            SystemClock.sleep(17000);
            require(statusNotification() == null, "backgrounding does not recreate status notification");
            runOnMainSync(() -> activity.finishAndRemoveTask());
            SystemClock.sleep(17000);
            require(statusNotification() == null, "removing recent task does not recreate status notification");
            require(getTargetContext().getSystemService(android.app.job.JobScheduler.class).getPendingJob(12100) != null, "system polling remains scheduled");
            pass("background and task removal retain scheduled work without ongoing notification");
            Badges.local(device, new JSONObject("{\"userId\":\"smoke-user\",\"records\":[{\"id\":\"c\",\"postId\":\"p2\",\"workspace\":false}]}"));
            runOnMainSync(NotificationService::publishBadge);
            require(Badges.count(device) == 1 && statusNotification() == null, "offline confirmation updates local count without status notification");
            pass("offline confirmation preserves local count without status notification");
            Notifications.get(getTargetContext(), device).show(new JSONObject("{\"id\":\"isolated-smoke-notification\",\"path\":\"/\",\"title\":\"Native smoke test\",\"body\":\"Isolated emulator only\"}"), "smoke-user");
            SystemClock.sleep(500);
            require(manager.getActiveNotifications().length == 1 && Badges.count(device) == 1, "test notification does not change workspace count");
            for (StatusBarNotification posted : manager.getActiveNotifications()) if (posted.getId() != 12101) {
                require(posted.getNotification().getSmallIcon().getResId() == R.drawable.app_icon, "status bar uses application logo");
                require(posted.getNotification().getLargeIcon() != null, "notification includes application artwork");
                require(alerts.getImportance() == NotificationManager.IMPORTANCE_HIGH && alerts.getSound() != null, "alerts retain banner and sound configuration");
            }
            pass("Android accepts native notification after task removal independently of badge count");
            device.put("badgeEnabled", false);
            runOnMainSync(NotificationService::publishBadge);
            require(statusNotification() == null, "badge changes do not publish background status");
            byte[] encrypted = java.nio.file.Files.readAllBytes(new java.io.File(getTargetContext().getFilesDir(), "device.bin").toPath());
            require(!new String(encrypted, StandardCharsets.UTF_8).contains("smoke-user"), "state is encrypted");
            pass("badge disable and Keystore encrypted persistence");
            status = Activity.RESULT_OK;
        } catch (Throwable error) {
            result.putString("error", android.util.Log.getStackTraceString(error));
        } finally {
          if (isolated) {
            try { if (device != null) { device.put("badgeEnabled", false); device.put("badgeSnapshot", new JSONObject()); device.put("notifications", new JSONObject().put("enabled", false)); } }
            catch (Exception error) { result.putString("cleanupError", error.toString()); status = Activity.RESULT_CANCELED; }
            NotificationJob.maintain(getTargetContext(), false);
            boolean stopped = getTargetContext().stopService(new Intent(getTargetContext(), NotificationService.class));
            runOnMainSync(() -> { CookieManager.getInstance().removeAllCookies(null); CookieManager.getInstance().flush(); if (activity != null) activity.finish(); });
            long cleanupEnd = SystemClock.uptimeMillis() + 10000;
            while (SystemClock.uptimeMillis() < cleanupEnd && NotificationService.isRunning()) SystemClock.sleep(100);
            if (manager != null) manager.cancelAll();
            while (SystemClock.uptimeMillis() < cleanupEnd && (NotificationService.isRunning() || (manager != null && manager.getActiveNotifications().length != 0))) SystemClock.sleep(100);
            if (NotificationService.isRunning() || (manager != null && manager.getActiveNotifications().length != 0)) {
                result.putString("cleanupError", "stopped=" + stopped + " running=" + NotificationService.isRunning() + " notifications=" + (manager == null ? -1 : manager.getActiveNotifications().length)); status = Activity.RESULT_CANCELED;
            }
          }
        }
        result.putString("stream", passed.toString()); finish(status, result);
    }

    /** @param {boolean} value 检查结果。 @param {String} message 失败说明。 */
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    /** @param {String} name 已完成的检查。 */
    private void pass(String name) { passed.append("PASS ").append(name).append('\n'); }
    /** @return {Notification} 当前常驻通知；缺失时为空。 */
    private Notification statusNotification() {
        for (StatusBarNotification item : manager.getActiveNotifications()) if (item.getId() == 12101) return item.getNotification();
        return null;
    }
}
