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
            activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            awaitStatus(2);
            pass("foreground service starts without GMS; badge deduplicates posts");
            NotificationManager nm = manager;
            require(!nm.getNotificationChannel("background").canShowBadge(), "background channel has no badge");
            require(!nm.getNotificationChannel("match-alerts").canShowBadge(), "new matches do not count as workspace badge");
            getTargetContext().startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            SystemClock.sleep(17000);
            require(NotificationService.isRunning(), "service survives leaving activity and a polling interval");
            awaitStatus(2);
            pass("background service survives offline polling");
            Badges.local(device, new JSONObject("{\"userId\":\"smoke-user\",\"records\":[{\"id\":\"c\",\"postId\":\"p2\",\"workspace\":false}]}"));
            runOnMainSync(NotificationService::publishBadge);
            awaitStatus(1);
            pass("offline confirmation immediately updates system notification number");
            Notifications.get(getTargetContext(), device).show(new JSONObject("{\"id\":\"isolated-smoke-notification\",\"path\":\"/\",\"title\":\"Native smoke test\",\"body\":\"Isolated emulator only\"}"), "smoke-user");
            SystemClock.sleep(500);
            require(manager.getActiveNotifications().length == 2 && Badges.count(device) == 1, "test notification does not change workspace count");
            pass("Android accepts native notification independently of badge count");
            device.put("badgeEnabled", false);
            runOnMainSync(NotificationService::publishBadge);
            awaitStatus(0);
            require("background".equals(statusNotification().getChannelId()), "disabled badge uses background channel");
            byte[] encrypted = java.nio.file.Files.readAllBytes(new java.io.File(getTargetContext().getFilesDir(), "device.bin").toPath());
            require(!new String(encrypted, StandardCharsets.UTF_8).contains("smoke-user"), "state is encrypted");
            pass("badge disable and Keystore encrypted persistence");
            status = Activity.RESULT_OK;
        } catch (Throwable error) {
            result.putString("error", android.util.Log.getStackTraceString(error));
        } finally {
          if (isolated) {
            getTargetContext().stopService(new Intent(getTargetContext(), NotificationService.class));
            if (manager != null) manager.cancelAll();
            try { if (device != null) { device.put("badgeEnabled", false); device.put("badgeSnapshot", new JSONObject()); device.put("notifications", new JSONObject().put("enabled", false)); } }
            catch (Exception error) { result.putString("cleanupError", error.toString()); status = Activity.RESULT_CANCELED; }
            runOnMainSync(() -> { CookieManager.getInstance().removeAllCookies(null); CookieManager.getInstance().flush(); if (activity != null) activity.finish(); });
            SystemClock.sleep(500);
            if (NotificationService.isRunning() || (manager != null && manager.getActiveNotifications().length != 0)) {
                result.putString("cleanupError", "Test service or notifications remained active"); status = Activity.RESULT_CANCELED;
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
    /** @param {int} count 预期工作区数量。 */
    private void awaitStatus(int count) {
        long end = SystemClock.uptimeMillis() + 10000;
        while (SystemClock.uptimeMillis() < end) {
            Notification status = statusNotification();
            if (status != null && status.number == count) return;
            SystemClock.sleep(100);
        }
        throw new AssertionError("Expected ongoing notification count " + count);
    }
}
