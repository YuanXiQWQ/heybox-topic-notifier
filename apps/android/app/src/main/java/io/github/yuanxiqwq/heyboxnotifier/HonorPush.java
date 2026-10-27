/** @file 在配置存在且设备支持时登记荣耀 token，所有业务通知仍经过账号校验。 */
package io.github.yuanxiqwq.heyboxnotifier;
import android.content.Context;
import com.hihonor.push.sdk.HonorPushClient;
import com.hihonor.push.sdk.HonorPushCallback;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** 荣耀 SDK 无需 Google 服务；未配置时不初始化或申请设备 token。 */
final class HonorPush {
    /**
     * 在用户开启通知后登记厂商 token，失败时保留可用的前台补取。
     * @param {Context} context 应用上下文。
     * @param {DeviceState} device 加密存储。
     */
    static void register(Context context, DeviceState device) {
        if (BuildConfig.HONOR_APP_ID.isEmpty() || !HonorPushClient.getInstance().checkSupportHonorPush(context)) return;
        try {
            JSONObject binding = device.read().optJSONObject("notifications");
            if (binding == null || !binding.optBoolean("enabled") || !Notifications.currentSessionHash().equals(binding.optString("session"))) return;
            JSONObject config = Http.api("/api/native/push/status");
            if (!config.optBoolean("configured") || !BuildConfig.HONOR_APP_ID.equals(config.optString("appId"))) return;
            HonorPushClient.getInstance().init(context.getApplicationContext(), false);
            CompletableFuture<String> result = new CompletableFuture<>();
            HonorPushClient.getInstance().getPushToken(new HonorPushCallback<String>() {
                /** @param {String} token 厂商设备令牌。 */
                @Override public void onSuccess(String token) { result.complete(token); }
                /** @param {int} code 错误码。 @param {String} message 厂商提示，不写入业务日志。 */
                @Override public void onFailure(int code, String message) { result.completeExceptionally(new IllegalStateException("Honor token unavailable")); }
            });
            saveToken(device, result.get(20, TimeUnit.SECONDS));
        } catch (Exception ignored) { /* 未成功登记时不宣称后台推送已经可用。 */ }
    }
    /**
     * 将更新 token 与仍然启用的当前账号绑定。
     * @param {DeviceState} device 共享设备状态。
     * @param {String} token 厂商令牌。
     * @throws Exception 服务端登记失败。
     */
    static void saveToken(DeviceState device, String token) throws Exception {
        if (BuildConfig.HONOR_APP_ID.isEmpty() || token == null || token.isEmpty()) return;
        JSONObject binding = device.read().optJSONObject("notifications");
        String previous = device.read().optString("honorToken");
        device.put("honorToken", token);
        if (binding == null || !binding.optBoolean("enabled")) return;
        if (!Notifications.currentSessionHash().equals(binding.optString("session"))) return;
        Http.post("/api/native/push/device", new JSONObject().put("token", token).put("enabled", true).put("appId", BuildConfig.HONOR_APP_ID));
        synchronized (device) {
            JSONObject current = device.read().optJSONObject("notifications");
            if (current != null && current.optBoolean("enabled") && current.optString("session").equals(binding.optString("session"))) { current.put("honorRegistered", true); device.put("notifications", current); }
        }
        if (!previous.isEmpty() && !previous.equals(token)) try { Http.post("/api/native/push/device", new JSONObject().put("token", previous).put("enabled", false)); } catch (Exception ignored) { /* 失效 token 也会在厂商响应后清理。 */ }
    }
    /**
     * 关闭厂商接收并清理当前会话的服务器登记，失败时本地状态仍保持关闭。
     * @param {Context} context 应用上下文。
     * @param {DeviceState} device 共享设备状态。
     */
    static void disable(Context context, DeviceState device) {
        if (BuildConfig.HONOR_APP_ID.isEmpty()) return;
        try {
            String token = device.read().optString("honorToken");
            if (!token.isEmpty()) Http.post("/api/native/push/device", new JSONObject().put("token", token).put("enabled", false));
        } catch (Exception ignored) { /* 断网时本地开关仍拦截排队消息。 */ }
        try {
            if (HonorPushClient.getInstance().checkSupportHonorPush(context)) {
                HonorPushClient.getInstance().init(context.getApplicationContext(), false);
                HonorPushClient.getInstance().deletePushToken(new HonorPushCallback<Void>() {
                    /** @param {Void} value 无返回值。 */
                    @Override public void onSuccess(Void value) { }
                    /** @param {int} code 厂商错误码。 @param {String} message 厂商提示。 */
                    @Override public void onFailure(int code, String message) { }
                });
            }
        } catch (Exception ignored) { /* 本地开关与会话校验仍会拦截排队消息。 */ }
    }
}
