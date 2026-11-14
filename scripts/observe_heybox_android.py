"""提供专用 Android 的有界只读访问，在内存中解析官方 App 缓存。"""

import hashlib
import subprocess
import xml.etree.ElementTree as ET

# 官方 App 的固定包名，不接受调用方替换为其它应用。
PACKAGE = "com.max.xiaoheihe"
# 只读访问官方 App 自身的偏好目录。
PREFS = f"/data/user/0/{PACKAGE}/shared_prefs/"
# SDK 用公开组织常量和包名的摘要选择主缓存。
SDK_CACHE_NAME = hashlib.md5(
    f"0yD85BjYvGFAvHaSQ1mc_{PACKAGE}".encode("utf-8")
).hexdigest()


class ObservationError(Exception):
    """仅携带固定错误代码，避免异常信息泄露设备数据。"""


def read_adb(
    adb: list[str], arguments: list[str], valid_exit_codes: tuple[int, ...] = (0,)
) -> bytes:
    """执行有超时和输出上限的只读 ADB 命令，不回显原始输出。

    @param {list[str]} adb 包含固定设备序列号的 ADB 命令。
    @param {list[str]} arguments 调用方指定的只读参数。
    @param {tuple[int, ...]} valid_exit_codes 允许的退出码。
    @return {bytes} 已校验退出状态与大小的原始读取结果。
    """
    try:
        result = subprocess.run(adb + arguments, capture_output=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ObservationError("adb_unavailable_or_timed_out") from error
    if result.returncode not in valid_exit_codes:
        raise ObservationError("android_read_failed")
    if result.returncode != 0 and result.stderr.strip():
        # ADB 断线等错误也可能返回 1，不能把它误报为 App 已退出。
        raise ObservationError("android_read_failed")
    if len(result.stdout) > 2 * 1024 * 1024:
        raise ObservationError("android_read_exceeded_bound")
    return result.stdout


def read_prefs(adb: list[str], name: str) -> ET.Element:
    """在内存中解析 App 偏好，不保存或回显文件内容。

    @param {list[str]} adb 包含固定设备序列号的 ADB 命令。
    @param {str} name App 偏好文件名。
    @return {ET.Element} 已校验为 map 的 XML 根节点。
    """
    try:
        # shell 协议保留远端退出码；exec-out 可能把 cat 的错误正文当成成功输出。
        root = ET.fromstring(read_adb(adb, ["shell", "-T", "cat", PREFS + name]))
    except ET.ParseError as error:
        raise ObservationError("invalid_preferences_xml") from error
    if root.tag != "map":
        raise ObservationError("unexpected_preferences_format")
    return root
