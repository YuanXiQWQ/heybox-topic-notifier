/** @file 将荣耀唤醒消息交给受账号隔离保护的通知收件箱。 */
package io.github.yuanxiqwq.heyboxnotifier;
import com.hihonor.push.sdk.HonorMessageService;
import com.hihonor.push.sdk.HonorPushDataMsg;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** 厂商回调不直接展示消息正文，也不接受外部 Intent 启动。 */
public final class HonorMessages extends HonorMessageService {
    /** 厂商回调使用串行任务，业务网络不阻塞系统回调线程。 */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    /** @param {String} token SDK 更新后的设备 token。 */
    @Override public void onNewToken(String token) { worker.execute(() -> { try { DeviceState device = DeviceState.get(this); synchronized (device) { device.put("honorToken", token); org.json.JSONObject binding = device.read().optJSONObject("notifications"); if (binding != null) { binding.put("honorRegistered", false); device.put("notifications", binding); } } NotificationJob.schedule(this); } catch (Exception ignored) { /* 下次启动应用时重新获取并登记。 */ } }); }
    /** @param {HonorPushDataMsg} message 无正文唤醒提示，实际数据只从本站账号接口读取。 */
    @Override public void onMessageReceived(HonorPushDataMsg message) { NotificationJob.schedule(this); }
    /** 服务结束时允许已排队的持久化任务完成。 */
    @Override public void onDestroy() { worker.shutdown(); super.onDestroy(); }
}
