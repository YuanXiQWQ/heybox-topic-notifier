/** @file 以会话和请求序号隔离工作区角标，状态锁内不执行网络操作。 */
package io.github.yuanxiqwq.heyboxnotifier;

/** 角标计数只属于当前会话，较早的请求不能覆盖较新的结果。 */
final class BadgeCounter {
    private String session = "";
    private int count, revision;
    /** @param {String} token 当前会话。 @param {boolean} enabled 角标开关。 @return {int} 可显示数量。 */
    synchronized int read(String token, boolean enabled) {
        if (!token.equals(session)) { session = token; count = 0; revision++; }
        if (!enabled || token.isEmpty()) count = 0;
        return count;
    }
    /** @param {String} token 请求会话。 @param {boolean} enabled 角标开关。 @return {int} 请求序号。 */
    synchronized int begin(String token, boolean enabled) { read(token, enabled); return ++revision; }
    /**
     * 接纳仍属于当前账号和最近请求的响应。
     * @param {int} request 请求序号。
     * @param {String} token 请求开始时的会话。
     * @param {String} current 当前会话。
     * @param {boolean} enabled 当前开关。
     * @param {int} value 工作区未确认数。
     */
    synchronized void accept(int request, String token, String current, boolean enabled, int value) {
        read(current, enabled);
        if (request == revision && token.equals(current) && !current.isEmpty() && enabled) count = Math.max(0, value);
    }
}
