/** @file 将二进制摘要编码为会话绑定、下载检查点和发行清单共用的十六进制格式。 */
package io.github.yuanxiqwq.heyboxnotifier;

/** 生成不受系统语言影响的小写摘要文本。 */
final class DigestHex {
    /** 此类只提供静态编码方法。 */
    private DigestHex() {}

    /**
     * 将每个字节写为两位小写十六进制，保留前导零。
     * @param {byte[]} bytes 摘要字节。
     * @return {String} 十六进制文本。
     */
    static String encode(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            result.append(Character.forDigit((value & 0xff) >>> 4, 16));
            result.append(Character.forDigit(value & 0x0f, 16));
        }
        return result.toString();
    }
}
