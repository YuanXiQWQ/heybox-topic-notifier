/** @file 从官方 Release 下载、校验签名并调用 Android 系统安装器更新自身。 */
package io.github.yuanxiqwq.heyboxnotifier;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** 更新状态由本机版本和包签名决定，服务端版本不会清除提示。 */
final class Updates {
    /** 唯一发行仓库。 */
    private static final String REPOSITORY = "YuanXiQWQ/heybox-topic-notifier";
    private final Activity activity;
    private final DeviceState device;
    private final Runnable changed;
    private final File apk;
    private volatile JSONObject release;
    private volatile String status = "idle";
    private volatile int progress = 0;
    private volatile boolean installAfterPermission;

    /**
     * 恢复设备更新标记，只有实际升级后才清除目标版本。
     * @param {Activity} activity 当前界面。
     * @param {DeviceState} device 加密设备存储。
     * @param {Runnable} changed 界面状态通知。
     * @throws Exception 本地状态无法保存。
     */
    Updates(Activity activity, DeviceState device, Runnable changed) throws Exception {
        this.activity = activity; this.device = device; this.changed = changed;
        apk = new File(activity.getFilesDir(), "application-update.apk");
        String target = device.read().optString("updateVersion");
        if (!newer(target, BuildConfig.VERSION_NAME)) device.put("updateVersion", "");
    }
    /**
     * 返回当前更新进度和三个层级的查看状态。
     * @return {JSONObject} 页面状态。
     * @throws Exception JSON 构造失败。
     */
    synchronized JSONObject state() throws Exception {
        JSONObject saved = device.read(); String version = saved.optString("updateVersion");
        return new JSONObject().put("status", status).put("version", version.isEmpty() ? JSONObject.NULL : version).put("progress", progress)
            .put("settingsUnread", !version.isEmpty() && !version.equals(saved.optString("updateSeen_settings")))
            .put("aboutUnread", !version.isEmpty() && !version.equals(saved.optString("updateSeen_about")))
            .put("prompt", !version.isEmpty() && !version.equals(saved.optString("updateSeen_dismissed")));
    }
    /**
     * 独立记录某一入口已经查看；不清除项目版本提示。
     * @param {String} section 查看层级。
     * @throws Exception 参数或持久化失败。
     */
    void seen(String section) throws Exception {
        if (!Arrays.asList("settings", "about", "dismissed").contains(section)) throw new IllegalArgumentException("Invalid section");
        String target = device.read().optString("updateVersion");
        device.put("updateSeen_" + section, target);
        if (section.equals("about")) device.put("updateSeen_settings", target);
        changed.run();
    }
    /**
     * 读取正式发行包，仅接受固定仓库、名称和 SHA-256 摘要。
     * @throws Exception 网络或发行信息无效。
     */
    void check() throws Exception {
        if (status.equals("downloading") || status.equals("downloaded")) return;
        status = "checking"; changed.run();
        HttpURLConnection connection = Http.connect("https://api.github.com/repos/" + REPOSITORY + "/releases/latest");
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        try {
            if (connection.getResponseCode() != 200) throw new IllegalStateException("Release unavailable");
            JSONObject data = Http.json(connection.getInputStream());
            if (data.optBoolean("draft", true) || data.optBoolean("prerelease", true)) throw new IllegalStateException("Not a stable release");
            String tag = data.getString("tag_name"), version = tag.replaceFirst("^v", "");
            if (!newer(version, BuildConfig.VERSION_NAME)) { status = device.read().optString("updateVersion").isEmpty() ? "current" : "error"; return; }
            JSONArray assets = data.getJSONArray("assets"); release = null;
            for (int index = 0; index < assets.length(); index++) {
                JSONObject asset = assets.getJSONObject(index);
                if (!asset.optString("name").equals("heybox-topic-notifier-android-universal.apk") || !asset.optString("state").equals("uploaded")) continue;
                String expected = "https://github.com/" + REPOSITORY + "/releases/download/" + tag + "/heybox-topic-notifier-android-universal.apk";
                if (!asset.optString("browser_download_url").equals(expected) || !asset.optString("digest").matches("sha256:[a-f0-9]{64}") || asset.optLong("size") <= 0 || asset.optLong("size") > 600L * 1024 * 1024) throw new SecurityException("Invalid release asset");
                release = asset;
            }
            if (release == null) throw new IllegalStateException("Android release missing");
            device.put("updateVersion", version); status = "available";
        } catch (Exception error) { status = "error"; throw error; }
        finally { connection.disconnect(); changed.run(); }
    }
    /**
     * 用户确认后下载并校验包签名，等待页面完成本地事务后申请安装。
     * @throws Exception 下载、校验或存储失败。
     */
    void download() throws Exception {
        if (release == null || !(status.equals("available") || status.equals("error"))) throw new IllegalStateException("Update unavailable");
        status = "downloading"; progress = 0; changed.run();
        File temporary = new File(activity.getFilesDir(), "application-update.part");
        HttpURLConnection connection = null;
        try {
            String address = release.getString("browser_download_url");
            for (int redirects = 0; redirects < 6; redirects++) {
                URI uri = URI.create(address);
                if (!Arrays.asList("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com").contains(uri.getHost())) throw new SecurityException("Invalid download host");
                connection = Http.connect(address);
                int code = connection.getResponseCode();
                if (code == 200) break;
                if (code < 300 || code >= 400) throw new IllegalStateException("Download unavailable");
                address = uri.resolve(connection.getHeaderField("Location")).toString(); connection.disconnect(); connection = null;
            }
            if (connection == null || connection.getResponseCode() != 200) throw new IllegalStateException("Download redirects exceeded");
            MessageDigest digest = MessageDigest.getInstance("SHA-256"); long total = 0, expected = release.getLong("size");
            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporary)) {
                byte[] buffer = new byte[65536]; int count;
                while ((count = input.read(buffer)) != -1) {
                    total += count; if (total > expected) throw new SecurityException("Unexpected download size");
                    output.write(buffer, 0, count); digest.update(buffer, 0, count);
                    int next = (int) (total * 100 / expected); if (next != progress) { progress = next; changed.run(); }
                }
                output.getFD().sync();
            }
            if (total != expected || !hex(digest.digest()).equals(release.getString("digest").substring(7))) throw new SecurityException("Update digest mismatch");
            verifyPackage(temporary);
            if (!temporary.renameTo(apk)) throw new IllegalStateException("Cannot prepare update");
            status = "downloaded"; changed.run();
        } catch (Exception error) { status = "error"; changed.run(); throw error; }
        finally { if (connection != null) connection.disconnect(); }
    }
    /**
     * 校验包名、单调版本号及发行签名与已安装应用相同。
     * @param {File} file 待安装 APK。
     * @throws Exception APK 无效或不是当前发行者的更新。
     */
    private void verifyPackage(File file) throws Exception {
        PackageManager manager = activity.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo target = manager.getPackageArchiveInfo(file.getAbsolutePath(), flags), current = manager.getPackageInfo(activity.getPackageName(), flags);
        if (target == null || !activity.getPackageName().equals(target.packageName)) throw new SecurityException("Wrong package");
        long targetCode = Build.VERSION.SDK_INT >= 28 ? target.getLongVersionCode() : target.versionCode;
        if (targetCode <= BuildConfig.VERSION_CODE) throw new SecurityException("Update downgrade rejected");
        android.content.pm.Signature[] left = Build.VERSION.SDK_INT >= 28 ? target.signingInfo.getApkContentsSigners() : target.signatures;
        android.content.pm.Signature[] right = Build.VERSION.SDK_INT >= 28 ? current.signingInfo.getApkContentsSigners() : current.signatures;
        if (!Arrays.equals(left, right)) throw new SecurityException("Publisher signature mismatch");
    }
    /**
     * 申请系统安装授权，并将已校验包交给系统签名验证和安装。
     * @throws Exception 安装器无法启动。
     */
    void install() throws Exception {
        if (!status.equals("downloaded")) throw new IllegalStateException("Update not ready");
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            installAfterPermission = true;
            activity.runOnUiThread(() -> activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())))); return;
        }
        verifyPackage(apk);
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(activity.getPackageName()); params.setSize(apk.length());
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id); InputStream input = new FileInputStream(apk); OutputStream output = session.openWrite("base.apk", 0, apk.length())) {
            byte[] buffer = new byte[65536]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            session.fsync(output); output.close();
            Intent result = new Intent(activity, InstallReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            session.commit(PendingIntent.getBroadcast(activity, id, result, flags).getIntentSender());
        } catch (Exception error) { installer.abandonSession(id); throw error; }
    }
    /** @param {java.util.concurrent.Executor} worker 后台安装任务执行器，大文件复制不阻塞界面。 */
    void resume(java.util.concurrent.Executor worker) { if (installAfterPermission) { installAfterPermission = false; if (activity.getPackageManager().canRequestPackageInstalls()) worker.execute(() -> { try { install(); } catch (Exception error) { status = "error"; changed.run(); } }); } }
    /**
     * 比较正式三段版本。
     * @param {String} left 发行版本。
     * @param {String} right 已安装版本。
     * @return {boolean} 是否为更新。
     */
    static boolean newer(String left, String right) {
        if (!left.matches("[0-9]+\\.[0-9]+\\.[0-9]+")) return false;
        String[] a = left.split("\\."), b = right.split("\\.");
        for (int i = 0; i < 3; i++) { long x = Long.parseLong(a[i]), y = Long.parseLong(b[i]); if (x != y) return x > y; }
        return false;
    }
    /**
     * 将摘要转换成小写十六进制。
     * @param {byte[]} bytes 摘要。
     * @return {String} 十六进制文本。
     */
    static String hex(byte[] bytes) { StringBuilder result = new StringBuilder(); for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 255)); return result.toString(); }
}
