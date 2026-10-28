/** @file 验证重启后复用的安装包必须满足完整摘要和尺寸，以及版本比较边界。 */
package io.github.yuanxiqwq.heyboxnotifier;
import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import org.json.JSONObject;
import java.io.File;
import java.nio.file.Files;
import java.security.MessageDigest;

/** 只测试文件校验与版本逻辑，不安装 APK 或调用系统界面。 */
public class UpdateIntegrityTest {
    /** JUnit 自动清理的独立测试目录。 */
    @Rule public TemporaryFolder files = new TemporaryFolder();
    /** 完整文件可以继续使用，截断和同长度损坏均必须拒绝。 @throws Exception 测试失败。 */
    @Test public void rejectsTruncatedOrModifiedDownload() throws Exception {
        File apk = files.newFile("fixture.apk"); byte[] bytes = { 1, 2, 3, 4 };
        Files.write(apk.toPath(), bytes);
        JSONObject asset = new JSONObject().put("size", bytes.length).put("digest", "sha256:" + Updates.hex(MessageDigest.getInstance("SHA-256").digest(bytes)));
        Updates.verifyDownload(apk, asset);
        Files.write(apk.toPath(), new byte[] { 1, 2 });
        assertThrows(SecurityException.class, () -> Updates.verifyDownload(apk, asset));
        Files.write(apk.toPath(), new byte[] { 4, 3, 2, 1 });
        assertThrows(SecurityException.class, () -> Updates.verifyDownload(apk, asset));
    }
    /** 文件存在但缺少有效的官方摘要时不能恢复安装。 @throws Exception 测试失败。 */
    @Test public void requiresOfficialDigestMetadata() throws Exception {
        File apk = files.newFile("fixture.apk"); Files.write(apk.toPath(), new byte[] { 1 });
        JSONObject asset = new JSONObject().put("size", 1).put("digest", "sha256:invalid");
        assertThrows(SecurityException.class, () -> Updates.verifyDownload(apk, asset));
    }
    /** 清理中断文件与损坏包时保留目录中的其它文件。 @throws Exception 测试失败。 */
    @Test public void discardsOnlyOwnedUpdateFiles() throws Exception {
        File apk = files.newFile("application-update.apk"), partial = files.newFile("application-update.part"), other = files.newFile("keep.dat");
        Files.write(partial.toPath(), new byte[] {1,2});
        Updates.discardDownload(apk, partial);
        assertFalse(apk.exists()); assertFalse(partial.exists()); assertTrue(other.exists());
        Updates.discardDownload(apk, partial);
    }
    /** 大版本数字不会溢出；旧版、预发行和异常文本不被当成正式更新。 */
    @Test public void comparesStableVersionsWithoutNumericOverflow() {
        assertTrue(Updates.newer("999999999999999999999.0.0", "1.0.0"));
        assertFalse(Updates.newer("1.0.0", "1.0.0"));
        assertFalse(Updates.newer("0.9.9", "1.0.0"));
        assertFalse(Updates.newer("1.1.0-beta", "1.0.0"));
        assertFalse(Updates.newer("broken", "1.0.0"));
    }
}
