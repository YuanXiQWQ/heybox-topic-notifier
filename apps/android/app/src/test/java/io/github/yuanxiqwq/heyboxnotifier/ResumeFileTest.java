/** @file 验证 APK 暂停检查点、强制中断尾部恢复、损坏拒绝与发行包隔离。 */
package io.github.yuanxiqwq.heyboxnotifier;
import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import org.json.JSONObject;

/** 文件级恢复测试不依赖 Android 设备或网络。 */
public class ResumeFileTest {
    /** 自动清理测试专用目录。 */
    @Rule public TemporaryFolder files = new TemporaryFolder();
    /** @return {JSONObject} 固定官方元数据。 @throws Exception JSON 构造失败。 */
    private JSONObject asset() throws Exception { return new JSONObject().put("size",8).put("digest","sha256:"+"a".repeat(64)).put("browser_download_url","https://github.com/owner/repo/releases/download/1/app.apk"); }
    /** @return {ResumeFile} 已暂停的四字节下载。 @throws Exception 文件操作失败。 */
    private ResumeFile paused() throws Exception {
        ResumeFile partial=new ResumeFile(files.getRoot()); partial.reset(asset(),"1.0.0");
        try (FileOutputStream output=new FileOutputStream(partial.file)) { byte[] bytes={1,2,3,4}; output.write(bytes); partial.appended(bytes,bytes.length); partial.checkpoint(output); }
        return partial;
    }
    /** 正常暂停可恢复，进程中断追加但未提交的尾部会被截断。 @throws Exception 测试失败。 */
    @Test public void resumesCheckpointAndTruncatesUncommittedTail() throws Exception {
        ResumeFile partial=paused(); Files.write(partial.file.toPath(),new byte[]{5,6},StandardOpenOption.APPEND);
        ResumeFile reopened=new ResumeFile(files.getRoot()); assertTrue(reopened.restore()); assertEquals(4,reopened.offset); assertEquals(4,reopened.file.length());
        assertTrue(reopened.matches(asset(),"1.0.0"));
        try (FileOutputStream output=new FileOutputStream(reopened.file,true)) { byte[] bytes={5,6,7,8}; output.write(bytes); reopened.appended(bytes,bytes.length); reopened.checkpoint(output); }
        assertEquals(8,reopened.file.length());
        assertTrue(ResumeFile.validRange("bytes 4-7/8",4,8));
        assertFalse(ResumeFile.validRange("bytes 0-7/8",4,8));
        assertFalse(ResumeFile.validRange("bytes 4-8/9",4,8));
    }
    /** 内容损坏、缺少元数据或版本不同不得复用残片。 @throws Exception 测试失败。 */
    @Test public void rejectsCorruptionOrUnrelatedRelease() throws Exception {
        ResumeFile partial=paused(); assertFalse(partial.matches(asset(),"2.0.0"));
        JSONObject changed=asset().put("digest","sha256:"+"b".repeat(64)); assertFalse(partial.matches(changed,"1.0.0"));
        Files.write(partial.file.toPath(),new byte[]{4,3,2,1});
        assertFalse(new ResumeFile(files.getRoot()).restore()); assertFalse(partial.file.exists());
        Files.write(partial.file.toPath(),new byte[]{1,2}); assertFalse(new ResumeFile(files.getRoot()).restore()); assertFalse(partial.file.exists());
    }
}
