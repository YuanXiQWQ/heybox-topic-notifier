/** @file 将当前账号工作区未确认数提供给系统角标，不生成帖子命中事件。 */
package io.github.yuanxiqwq.heyboxnotifier;
import org.json.JSONObject;

/** 网络读取不持有计数状态锁，界面可立即关闭角标或切换账号。 */
final class Badges {
    /** 当前进程的账号隔离计数。 */
    private static final BadgeCounter counter = new BadgeCounter();
    /** @param {DeviceState} device 当前设备偏好。 @return {int} 当前会话可展示的未确认数。 */
    static int count(DeviceState device) { return counter.read(Http.session(), device.read().optBoolean("badgeEnabled", true)); }
    /**
     * 获取权威计数，离线保留同账号最近结果；认证失效时清零。
     * @param {DeviceState} device 当前设备状态。
     * @throws Exception 网络或认证失败。
     */
    static void refresh(DeviceState device) throws Exception {
        String before = Http.session();
        boolean enabled = device.read().optBoolean("badgeEnabled", true);
        int request = counter.begin(before, enabled);
        if (before.isEmpty() || !enabled) return;
        try {
            JSONObject data = Http.api("/api/native/badge");
            counter.accept(request, before, Http.session(), device.read().optBoolean("badgeEnabled", true), data.getInt("count"));
        } catch (SecurityException error) {
            counter.accept(request, before, Http.session(), true, 0);
            throw error;
        }
    }
}
