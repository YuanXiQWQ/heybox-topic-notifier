/** @file 使用 Android Keystore 保护设备设置和通知游标。 */
package io.github.yuanxiqwq.heyboxnotifier;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** 设备文件不参与系统备份，加密密钥不可导出。 */
final class DeviceState {
    /** 页面与厂商服务共享同一个加密状态对象，避免各自持有过期副本。 */
    private static DeviceState instance;
    /** @param {Context} context 应用上下文。 @return {DeviceState} 进程内共享存储。 @throws Exception 密钥或数据不可用。 */
    static synchronized DeviceState get(Context context) throws Exception { if (instance == null) instance = new DeviceState(context.getApplicationContext()); return instance; }
    private final AtomicFile file;
    private final SecretKey key;
    private JSONObject value;

    /**
     * 读取原子设备状态，解密异常时不以空状态覆盖已有数据。
     * @param {Context} context 应用上下文。
     * @throws Exception 密钥或文件无法读取。
     */
    private DeviceState(Context context) throws Exception {
        file = new AtomicFile(new File(context.getFilesDir(), "device.bin"));
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        if (!keys.containsAlias("heybox-device")) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder("heybox-device", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        key = (SecretKey) keys.getKey("heybox-device", null);
        if (!file.getBaseFile().exists()) { value = new JSONObject(); return; }
        byte[] data = file.readFully();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, data, 0, 12));
        value = new JSONObject(new String(cipher.doFinal(data, 12, data.length - 12), StandardCharsets.UTF_8));
    }
    /**
     * 返回防止跨线程直接修改的状态副本。
     * @return {JSONObject} 当前状态。
     */
    synchronized JSONObject read() { try { return new JSONObject(value.toString()); } catch (Exception error) { throw new IllegalStateException(error); } }
    /**
     * 原子更新一个设备字段，其余字段保持当前值。
     * @param {String} name 字段名称。
     * @param {Object} content JSON 值。
     * @throws Exception 加密或写入失败。
     */
    synchronized void put(String name, Object content) throws Exception {
        JSONObject next = new JSONObject(value.toString()); next.put(name, content);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key);
        FileOutputStream output = file.startWrite();
        try { output.write(cipher.getIV()); output.write(cipher.doFinal(next.toString().getBytes(StandardCharsets.UTF_8))); file.finishWrite(output); value = next; }
        catch (Exception error) { file.failWrite(output); throw error; }
    }
}
