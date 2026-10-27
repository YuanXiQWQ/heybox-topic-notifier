/** @file 由 Android 系统调度厂商消息补取，网络暂不可用时保留重试任务。 */
package io.github.yuanxiqwq.heyboxnotifier;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** 不依赖 Google 服务，系统权限保证只有调度器可以调用任务。 */
public final class NotificationJob extends JobService {
    /** 同一收件箱只需一个待执行任务，事件内容保留在服务端。 */
    private static final int JOB_ID = 12099;
    /** 收件箱网络访问在工作线程运行。 */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    /** @param {Context} context 应用上下文。 */
    static void schedule(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        JobInfo.Builder job = new JobInfo.Builder(JOB_ID, new ComponentName(context, NotificationJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY);
        if (Build.VERSION.SDK_INT >= 31) job.setExpedited(true);
        if (scheduler.schedule(job.build()) != JobScheduler.RESULT_SUCCESS && Build.VERSION.SDK_INT >= 31) scheduler.schedule(job.setExpedited(false).build());
    }
    /** @param {JobParameters} params 系统任务。 @return {boolean} 是否存在异步工作。 */
    @Override public boolean onStartJob(JobParameters params) {
        worker.execute(() -> {
            boolean retry = false;
            try {
                DeviceState device = DeviceState.get(this);
                String token = device.read().optString("honorToken");
                org.json.JSONObject binding = device.read().optJSONObject("notifications");
                if (binding != null && binding.optBoolean("enabled") && !binding.optBoolean("honorRegistered") && !token.isEmpty()) {
                    try { HonorPush.saveToken(device, token); } catch (Exception ignored) { retry = true; }
                }
                Notifications.get(this, device).poll();
            } catch (Exception ignored) { retry = true; }
            jobFinished(params, retry);
        });
        return true;
    }
    /** @param {JobParameters} params 被系统中止的任务。 @return {boolean} 保留重试以补取尚未确认的事件。 */
    @Override public boolean onStopJob(JobParameters params) { return true; }
    /** 释放执行器，账号游标已由加密存储持久保存。 */
    @Override public void onDestroy() { worker.shutdown(); super.onDestroy(); }
}
