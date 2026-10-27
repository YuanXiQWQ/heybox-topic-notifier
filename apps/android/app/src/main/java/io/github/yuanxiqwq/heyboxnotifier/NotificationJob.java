/** @file 用 Android 系统周期任务补取通知，厂商消息可额外唤醒，不依赖 Google 服务。 */
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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.FutureTask;

/** 不依赖 Google 服务，系统权限保证只有调度器可以调用任务。 */
public final class NotificationJob extends JobService {
    /** 同一收件箱只需一个待执行任务，事件内容保留在服务端。 */
    private static final int JOB_ID = 12099;
    /** 通用周期任务与厂商即时任务分开，避免互相替换调度。 */
    private static final int PERIODIC_JOB_ID = 12100;
    /** 收件箱网络访问在工作线程运行。 */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    /** 每次系统调度单独持有取消标记，旧任务结束不会确认新任务。 */
    private final ConcurrentHashMap<JobParameters, FutureTask<Void>> jobs = new ConcurrentHashMap<>();
    /** @param {Context} context 应用上下文。 */
    static void schedule(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        JobInfo.Builder job = new JobInfo.Builder(JOB_ID, new ComponentName(context, NotificationJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY);
        if (Build.VERSION.SDK_INT >= 31) job.setExpedited(true);
        if (scheduler.schedule(job.build()) != JobScheduler.RESULT_SUCCESS && Build.VERSION.SDK_INT >= 31) scheduler.schedule(job.setExpedited(false).build());
    }
    /**
     * 依据设备通知开关维护跨重启周期任务；已存在时不重置下一次运行时间。
     * @param {Context} context 应用上下文。
     * @param {boolean} enabled 当前设备是否开启通知。
     */
    static void maintain(Context context, boolean enabled) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (!enabled) { scheduler.cancel(PERIODIC_JOB_ID); scheduler.cancel(JOB_ID); return; }
        if (scheduler.getPendingJob(PERIODIC_JOB_ID) != null) return;
        scheduler.schedule(new JobInfo.Builder(PERIODIC_JOB_ID, new ComponentName(context, NotificationJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15L * 60 * 1000).setPersisted(true).build());
    }
    /** @param {JobParameters} params 系统任务。 @return {boolean} 是否存在异步工作。 */
    @Override public boolean onStartJob(JobParameters params) {
        FutureTask<Void> task = new FutureTask<>(() -> {
            boolean retry = false;
            try {
                DeviceState device = DeviceState.get(this);
                String token = device.read().optString("honorToken");
                org.json.JSONObject binding = device.read().optJSONObject("notifications");
                if (binding != null && binding.optBoolean("enabled") && !binding.optBoolean("honorRegistered") && !token.isEmpty()) {
                    try { HonorPush.saveToken(device, token); } catch (Exception ignored) { retry = true; }
                }
                retry |= Notifications.get(this, device).poll();
            } catch (Exception ignored) { retry = true; }
            if (jobs.remove(params) != null) jobFinished(params, retry);
            return null;
        });
        jobs.put(params, task); worker.execute(task);
        return true;
    }
    /** @param {JobParameters} params 被系统中止的任务。 @return {boolean} 保留重试以补取尚未确认的事件。 */
    @Override public boolean onStopJob(JobParameters params) { FutureTask<Void> task = jobs.remove(params); if (task != null) task.cancel(true); return true; }
    /** 释放执行器，账号游标已由加密存储持久保存。 */
    @Override public void onDestroy() { for (FutureTask<Void> task : jobs.values()) task.cancel(true); jobs.clear(); worker.shutdownNow(); super.onDestroy(); }
}
