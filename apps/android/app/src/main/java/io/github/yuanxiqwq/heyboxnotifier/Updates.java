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
    /** 同一进程的下载由一个协调器持有，页面重建不会重复写同一个 APK。 */
    private static Updates instance;
    /** 唯一发行仓库。 */
    private static final String REPOSITORY = "YuanXiQWQ/heybox-topic-notifier";
    private volatile java.lang.ref.WeakReference<Activity> activity;
    private final android.app.Application context;
    private final DeviceState device;
    private volatile java.lang.ref.WeakReference<Runnable> changed;
    private final File apk;
    private volatile JSONObject release;
    private volatile String status = "idle";
    private volatile int progress = 0;
    private volatile boolean installAfterPermission;
    /** 取消只影响未完成下载，完整校验包可跨进程保留。 */
    private volatile boolean downloadCancelled;
    private volatile HttpURLConnection downloadConnection;
    /** 恢复窗口后只续传本机已经确认的未完成下载。 */
    private volatile boolean resumePending;
    /** @return {boolean} 是否有本次启动应继续的已确认下载。 */
    synchronized boolean hasPendingResume() { return resumePending; }
    /** 自动检查使用进程单调时钟，不因页面重建或系统校时重复发请求。 */
    private long lastAutomaticCheck = -1;
    /** 检查与下载互斥，界面状态读取不等待网络。 */
    private final java.util.concurrent.atomic.AtomicBoolean transferring = new java.util.concurrent.atomic.AtomicBoolean();

    /**
     * 恢复设备更新标记，只有实际升级后才清除目标版本。
     * @param {Activity} activity 当前界面。
     * @param {DeviceState} device 加密设备存储。
     * @param {Runnable} changed 界面状态通知。
     * @throws Exception 本地状态无法保存。
     */
    private Updates(Activity activity, DeviceState device, Runnable changed) throws Exception {
        this.activity = new java.lang.ref.WeakReference<>(activity); this.device = device; this.changed = new java.lang.ref.WeakReference<>(changed);
        this.context = activity.getApplication();
        apk = new File(context.getFilesDir(), "application-update.apk");
        String target = device.read().optString("updateVersion");
        if (!newer(target, BuildConfig.VERSION_NAME)) device.put("updateVersion", "");
    }
    /** @param {Activity} activity 当前窗口。 @param {DeviceState} device 设备存储。 @param {Runnable} changed 状态通知。 @return {Updates} 跨窗口重建共享的更新协调器。 @throws Exception 状态读取失败。 */
    static synchronized Updates get(Activity activity, DeviceState device, Runnable changed) throws Exception {
        if (instance == null) instance = new Updates(activity, device, changed);
        else { instance.activity = new java.lang.ref.WeakReference<>(activity); instance.changed = new java.lang.ref.WeakReference<>(changed); }
        return instance;
    }
    /** @param {Activity} owner 已销毁窗口，后台下载不再持有其回调或上下文。 */
    synchronized void detach(Activity owner) { if (activity.get() == owner) { activity.clear(); changed.clear(); } }
    /** 暂停网络读取，下载线程关闭输出流前持久化检查点，不阻塞界面等待网络。 */
    synchronized void cancelDownload() { downloadCancelled = true; HttpURLConnection connection = downloadConnection; if (connection != null) connection.disconnect(); }
    /** 仅通知仍然存活的窗口，进程协调器不强引用页面及其回调。 */
    private void notifyChanged() { Runnable listener = changed.get(); if (listener != null) listener.run(); }
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
        notifyChanged();
    }
    /**
     * 读取正式发行包，仅接受固定仓库、名称和 SHA-256 摘要。
     * @throws Exception 网络或发行信息无效。
     */
    void check() throws Exception {
        if (resumePending) return;
        if (!transferring.compareAndSet(false, true)) return;
        try { checkAvailable(); } finally { transferring.set(false); }
    }
    /** 前台启动或恢复时按六小时节流检查，手动检查不受此限制。 @throws Exception 检查失败。 */
    void checkAutomatically() throws Exception {
        long now = System.nanoTime() / 1000000;
        if (lastAutomaticCheck >= 0 && now - lastAutomaticCheck < 6L * 60 * 60 * 1000) return;
        lastAutomaticCheck = now;
        check();
    }
    /** 读取当前官方发行元数据，调用方负责与下载互斥。 @throws Exception 请求或校验失败。 */
    private void checkAvailable() throws Exception {
        if (status.equals("downloading") || status.equals("downloaded")) return;
        status = "checking"; notifyChanged();
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
        finally { connection.disconnect(); notifyChanged(); }
    }
    /**
     * 用户确认后下载并校验包签名，等待页面完成本地事务后申请安装。
     * @throws Exception 下载、校验或存储失败。
     */
    void download() throws Exception {
        synchronized (this) {
            Activity owner = activity.get();
            if (owner == null || owner.isFinishing() || owner.isDestroyed()) throw new IllegalStateException("Activity unavailable");
            if (!transferring.compareAndSet(false, true)) throw new IllegalStateException("Update operation in progress");
            resumePending = false;
            downloadCancelled = false;
        }
        try { downloadAvailable(); } finally { transferring.set(false); }
    }
    /** 下载当前已确认的发行包，并在成功后保存可恢复的校验元数据。 @throws Exception 下载或校验失败。 */
    private void downloadAvailable() throws Exception {
        if (release == null || !(status.equals("available") || status.equals("error"))) throw new IllegalStateException("Update unavailable");
        status="downloading"; progress=0; notifyChanged(); device.put("downloadedUpdate",JSONObject.NULL);
        ResumeFile partial=new ResumeFile(context.getFilesDir()); String version=device.read().getString("updateVersion");
        if (!partial.restore() || !partial.matches(release,version)) partial.reset(release,version);
        long expected=release.getLong("size"); HttpURLConnection connection=null; boolean invalid=false;
        try {
            if (partial.offset < expected) {
                String address=release.getString("browser_download_url");
                for (int redirects=0; redirects<6; redirects++) {
                    URI uri=URI.create(address);
                    if (!Arrays.asList("github.com","release-assets.githubusercontent.com","objects.githubusercontent.com").contains(uri.getHost())) throw new SecurityException("Invalid download host");
                    if (downloadCancelled) throw new java.io.InterruptedIOException("Download paused");
                    connection=Http.connect(address); downloadConnection=connection;
                    connection.setRequestProperty("Accept-Encoding","identity");
                    if (partial.offset>0) connection.setRequestProperty("Range","bytes="+partial.offset+"-");
                    int code=connection.getResponseCode();
                    if (code==200 || code==206) break;
                    if (code==416) throw new SecurityException("Invalid resume range");
                    if (code<300 || code>=400) throw new IllegalStateException("Download unavailable");
                    address=uri.resolve(connection.getHeaderField("Location")).toString(); connection.disconnect(); connection=null;
                }
                if (connection==null) throw new IllegalStateException("Download redirects exceeded");
                int code=connection.getResponseCode();
                if (code==200) partial.reset(release,version);
                else if (code!=206 || !ResumeFile.validRange(connection.getHeaderField("Content-Range"),partial.offset,expected)) throw new SecurityException("Invalid download range");
                String encoding=connection.getHeaderField("Content-Encoding");
                if (encoding!=null && !encoding.equalsIgnoreCase("identity")) throw new SecurityException("Invalid download encoding");
                long reportedAt=0,persisted=partial.offset;
                try (InputStream input=connection.getInputStream(); FileOutputStream output=new FileOutputStream(partial.file,true)) {
                    partial.checkpoint(output);
                    try {
                        byte[] buffer=new byte[65536]; int count;
                        while ((count=input.read(buffer))!=-1) {
                            if (downloadCancelled) throw new java.io.InterruptedIOException("Download paused");
                            if (partial.offset+count>expected) throw new SecurityException("Unexpected download size");
                            output.write(buffer,0,count); partial.appended(buffer,count);
                            if (partial.offset-persisted>=4L*1024*1024) { partial.checkpoint(output); persisted=partial.offset; }
                            int next=(int)(partial.offset*100/expected); long now=android.os.SystemClock.elapsedRealtime();
                            if (next!=progress || now-reportedAt>=5000) { progress=next; reportedAt=now; notifyChanged(); }
                        }
                    } finally { partial.checkpoint(output); }
                }
            }
            if (downloadCancelled) throw new java.io.InterruptedIOException("Download paused");
            if (partial.offset!=expected) throw new java.io.EOFException("Download interrupted");
            if (!partial.digest().equals(release.getString("digest").substring(7))) throw new SecurityException("Update digest mismatch");
            verifyPackage(partial.file,version); java.nio.file.Files.deleteIfExists(apk.toPath());
            if (!partial.file.renameTo(apk)) throw new IllegalStateException("Cannot prepare update");
            device.put("downloadedUpdate",new JSONObject().put("version",version).put("asset",release));
            partial.discard(); status="downloaded"; notifyChanged();
        } catch (Exception error) { invalid=error instanceof SecurityException; status="error"; notifyChanged(); throw error; }
        finally {
            if (connection!=null) connection.disconnect(); downloadConnection=null;
            if (invalid) partial.discard();
            if (!status.equals("downloaded")) { java.nio.file.Files.deleteIfExists(apk.toPath()); device.put("downloadedUpdate",JSONObject.NULL); }
        }
    }
    /**
     * 在后台核验完整包和下载检查点，重启后继续安装或恢复已确认的传输。
     * @throws Exception 设备状态无法保存。
     */
    void restore() throws Exception {
        if (status.equals("downloaded") || !transferring.compareAndSet(false, true)) return;
        try { restoreDownloaded(); } finally { transferring.set(false); }
    }
    /** 重新核验已下载包元数据，调用方负责与正在进行的下载互斥。 @throws Exception 状态写入失败。 */
    private void restoreDownloaded() throws Exception {
        File temporary = new File(context.getFilesDir(), "application-update.part");
        ResumeFile partial = new ResumeFile(context.getFilesDir());
        boolean resumable = partial.restore();
        JSONObject saved = device.read().optJSONObject("downloadedUpdate");
        if (saved == null) {
            java.nio.file.Files.deleteIfExists(apk.toPath());
            if (resumable && newer(partial.saved.optString("version"),BuildConfig.VERSION_NAME)) {
                release=partial.saved.getJSONObject("asset"); device.put("updateVersion",partial.saved.getString("version"));
                resumePending=true; status="available"; progress=(int)(partial.offset*100/release.getLong("size")); notifyChanged();
            } else partial.discard();
            return;
        }
        try {
            if (!newer(saved.optString("version"), BuildConfig.VERSION_NAME)) { discardDownload(apk, temporary); device.put("downloadedUpdate", JSONObject.NULL); return; }
            JSONObject asset = saved.getJSONObject("asset");
            verifyDownload(apk, asset); verifyPackage(apk, saved.getString("version"));
            partial.discard(); release = asset; device.put("updateVersion", saved.getString("version")); status = "downloaded"; progress = 100; notifyChanged();
        } catch (Exception invalid) { discardDownload(apk, temporary); device.put("downloadedUpdate", JSONObject.NULL); status = "idle"; progress = 0; notifyChanged(); }
    }
    /**
     * 删除失效完整包与中断临时包，不触碰其它应用文件。
     * @param {File} apk 本应用的缓存安装包。
     * @param {File} temporary 本应用的临时下载文件。
     * @throws Exception 清理失败，不能宣称缓存已处理。
     */
    static void discardDownload(File apk, File temporary) throws Exception {
        java.nio.file.Files.deleteIfExists(temporary.toPath());
        java.nio.file.Files.deleteIfExists(apk.toPath());
    }
    /**
     * 依据已保存的官方摘要与尺寸验证完整安装包，不信任文件存在这一事实。
     * @param {File} file 已下载文件。
     * @param {JSONObject} asset 官方附件元数据。
     * @throws Exception 尺寸或摘要不一致。
     */
    static void verifyDownload(File file, JSONObject asset) throws Exception {
        long size = asset.optLong("size"); String expected = asset.optString("digest");
        if (size <= 0 || size > 600L * 1024 * 1024 || !file.isFile() || file.length() != size || !expected.matches("sha256:[a-f0-9]{64}")) throw new SecurityException("Invalid downloaded update");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) { byte[] bytes = new byte[65536]; int count; while ((count = input.read(bytes)) != -1) digest.update(bytes, 0, count); }
        if (!hex(digest.digest()).equals(expected.substring(7))) throw new SecurityException("Update digest mismatch");
    }
    /**
     * 校验包名、单调版本号及发行签名与已安装应用相同。
     * @param {File} file 待安装 APK。
     * @param {String} expectedVersion 用户确认的发行版本。
     * @throws Exception APK 无效或不是当前发行者的更新。
     */
    private void verifyPackage(File file, String expectedVersion) throws Exception {
        PackageManager manager = context.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo target = manager.getPackageArchiveInfo(file.getAbsolutePath(), flags), current = manager.getPackageInfo(context.getPackageName(), flags);
        if (target == null || !context.getPackageName().equals(target.packageName)) throw new SecurityException("Wrong package");
        if (!expectedVersion.equals(target.versionName)) throw new SecurityException("Release version mismatch");
        long targetCode = Build.VERSION.SDK_INT >= 28 ? target.getLongVersionCode() : target.versionCode;
        if (targetCode <= BuildConfig.VERSION_CODE) throw new SecurityException("Update downgrade rejected");
        android.content.pm.Signature[] left = Build.VERSION.SDK_INT >= 28 ? target.signingInfo.getApkContentsSigners() : target.signatures;
        android.content.pm.Signature[] right = Build.VERSION.SDK_INT >= 28 ? current.signingInfo.getApkContentsSigners() : current.signatures;
        if (!Arrays.equals(left, right)) throw new SecurityException("Publisher signature mismatch");
    }
    /**
     * 申请系统安装授权，完成写入并关闭流后提交已校验安装包。
     * @throws Exception 安装器无法启动。
     */
    void install() throws Exception {
        if (!status.equals("downloaded")) throw new IllegalStateException("Update not ready");
        Activity owner = activity.get();
        if (owner == null || owner.isDestroyed() || owner.isFinishing()) throw new IllegalStateException("Application window required");
        if (!context.getPackageManager().canRequestPackageInstalls()) {
            installAfterPermission = true;
            owner.runOnUiThread(() -> owner.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName())))); return;
        }
        JSONObject cached = device.read().getJSONObject("downloadedUpdate");
        try { verifyDownload(apk, cached.getJSONObject("asset")); verifyPackage(apk, cached.getString("version")); }
        catch (Exception invalid) { discardDownload(apk, new File(context.getFilesDir(), "application-update.part")); device.put("downloadedUpdate", JSONObject.NULL); status = "error"; notifyChanged(); throw invalid; }
        PackageInstaller installer = context.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(context.getPackageName()); params.setSize(apk.length());
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (InputStream input = new FileInputStream(apk); OutputStream output = session.openWrite("base.apk", 0, apk.length())) {
                byte[] buffer = new byte[65536]; int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                session.fsync(output);
            }
            Intent result = new Intent(context, InstallReceiver.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            session.commit(PendingIntent.getBroadcast(context, id, result, flags).getIntentSender());
        } catch (Exception error) { installer.abandonSession(id); throw error; }
    }
    /** @param {java.util.concurrent.Executor} worker 后台安装任务执行器，大文件复制不阻塞界面。 */
    void resume(java.util.concurrent.Executor worker) { if (installAfterPermission) { installAfterPermission = false; if (context.getPackageManager().canRequestPackageInstalls()) worker.execute(() -> { try { install(); } catch (Exception error) { status = "error"; notifyChanged(); } }); } }
    /**
     * 比较正式三段版本。
     * @param {String} left 发行版本。
     * @param {String} right 已安装版本。
     * @return {boolean} 是否为更新。
     */
    static boolean newer(String left, String right) {
        if (left.length() > 80 || right.length() > 80 || !left.matches("[0-9]+\\.[0-9]+\\.[0-9]+") || !right.matches("[0-9]+\\.[0-9]+\\.[0-9]+")) return false;
        String[] a = left.split("\\."), b = right.split("\\.");
        for (int i = 0; i < 3; i++) { int order = new java.math.BigInteger(a[i]).compareTo(new java.math.BigInteger(b[i])); if (order != 0) return order > 0; }
        return false;
    }
    /**
     * 将摘要转换成小写十六进制。
     * @param {byte[]} bytes 摘要。
     * @return {String} 十六进制文本。
     */
    static String hex(byte[] bytes) { StringBuilder result = new StringBuilder(); for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 255)); return result.toString(); }
}
