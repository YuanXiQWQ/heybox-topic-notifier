/** @file 持久化 APK 下载前缀的摘要与长度，支持中断恢复并拒绝损坏检查点。 */
package io.github.yuanxiqwq.heyboxnotifier;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import org.json.JSONObject;

/** 仅管理固定的 APK 临时文件及其恢复元数据。 */
final class ResumeFile {
    final File file, metadata;
    JSONObject saved;
    MessageDigest hash;
    long offset;
    /** @param {File} directory 应用私有目录。 */
    ResumeFile(File directory) { file = new File(directory,"application-update.part"); metadata = new File(directory,"application-update.resume"); }
    /** @return {boolean} 检查点完整且前缀可继续使用。 @throws Exception 文件操作失败。 */
    boolean restore() throws Exception {
        try {
            if (!metadata.isFile()) { discard(); return false; }
            saved = new JSONObject(new String(Files.readAllBytes(metadata.toPath()),java.nio.charset.StandardCharsets.UTF_8));
            long total = saved.getJSONObject("asset").getLong("size");
            String digest = saved.getJSONObject("asset").getString("digest");
            offset = saved.getLong("offset");
            if (total <= 0 || total > 600L*1024*1024 || offset < 0 || offset > total || !digest.matches("sha256:[a-f0-9]{64}") || !file.isFile() || file.length() < offset) throw new SecurityException("Invalid checkpoint");
            hash = MessageDigest.getInstance("SHA-256");
            try (FileInputStream input = new FileInputStream(file)) {
                byte[] bytes = new byte[65536]; long remaining = offset;
                while (remaining > 0) { int length = input.read(bytes,0,(int)Math.min(bytes.length,remaining)); if (length < 0) throw new SecurityException("Truncated checkpoint"); hash.update(bytes,0,length); remaining -= length; }
            }
            if (!digest().equals(saved.getString("prefix"))) throw new SecurityException("Invalid checkpoint digest");
            try (RandomAccessFile output = new RandomAccessFile(file,"rw")) { output.setLength(offset); }
            return true;
        } catch (SecurityException | org.json.JSONException error) { discard(); return false; }
    }
    /** @param {JSONObject} asset 发行附件。 @param {String} version 版本。 @return {boolean} 恢复点是否属于同一个包。 */
    boolean matches(JSONObject asset, String version) {
        if (saved == null) return false;
        JSONObject previous = saved.optJSONObject("asset");
        return previous != null && version.equals(saved.optString("version")) && previous.optString("digest").equals(asset.optString("digest")) && previous.optLong("size") == asset.optLong("size") && previous.optString("browser_download_url").equals(asset.optString("browser_download_url"));
    }
    /** @param {JSONObject} asset 发行附件。 @param {String} version 版本。 @throws Exception 文件操作失败。 */
    void reset(JSONObject asset, String version) throws Exception {
        discard(); hash = MessageDigest.getInstance("SHA-256"); offset = 0;
        saved = new JSONObject().put("asset",asset).put("version",version);
    }
    /** @param {byte[]} bytes 写入成功的数据。 @param {int} length 数据长度。 */
    void appended(byte[] bytes, int length) { hash.update(bytes,0,length); offset += length; }
    /** @return {String} 当前前缀摘要，不终结累积对象。 @throws Exception 摘要不可用。 */
    String digest() throws Exception {
        MessageDigest copy;
        try { copy = (MessageDigest) hash.clone(); }
        catch (CloneNotSupportedException unsupported) {
            copy = MessageDigest.getInstance("SHA-256");
            try (FileInputStream input = new FileInputStream(file)) {
                byte[] bytes = new byte[65536]; long remaining = offset;
                while (remaining > 0) { int length = input.read(bytes,0,(int)Math.min(bytes.length,remaining)); if (length < 0) throw new SecurityException("Truncated prefix"); copy.update(bytes,0,length); remaining -= length; }
            }
        }
        StringBuilder value = new StringBuilder();
        for (byte part : copy.digest()) value.append(String.format(java.util.Locale.ROOT,"%02x",part & 255));
        return value.toString();
    }
    /** @param {FileOutputStream} output 安装包输出流。 @throws Exception 数据或检查点无法持久化。 */
    void checkpoint(FileOutputStream output) throws Exception {
        output.getFD().sync(); saved.put("offset",offset).put("prefix",digest());
        File temporary = new File(metadata.getPath()+".tmp");
        try (FileOutputStream state = new FileOutputStream(temporary)) { state.write(saved.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); state.getFD().sync(); }
        Files.move(temporary.toPath(),metadata.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
    }
    /** @throws Exception 只删除专属下载文件时发生错误。 */
    void discard() throws Exception {
        Files.deleteIfExists(file.toPath()); Files.deleteIfExists(metadata.toPath()); Files.deleteIfExists(new File(metadata.getPath()+".tmp").toPath()); saved = null; offset = 0;
    }
    /** @param {String} value 响应范围。 @param {long} offset 期望起点。 @param {long} total 官方尺寸。 @return {boolean} 响应覆盖完整剩余部分。 */
    static boolean validRange(String value, long offset, long total) { return ("bytes "+offset+"-"+(total-1)+"/"+total).equals(value); }
}
