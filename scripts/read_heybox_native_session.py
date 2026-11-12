"""读取已授权专用 Android 的正常 SDK 缓存，供受保护的子进程管道消费。

默认只输出是否就绪；--emit-session 只能连接管道，输出不得写入日志或仓库。
设备绑定文件须事先建立；读取失败不创建身份、不清缓存、不登录、不接受协议。
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path
from observe_heybox_android import PACKAGE, SDK_CACHE_NAME, read_adb, read_prefs, ObservationError

# 仅支持已核对协议及来源的官方版本。
APP_VERSION = "1.3.400"
APP_BUILD = "1149"


def preference(adb: list[str], name: str, key: str) -> str:
    """读取指定缓存字段，缺失或重复均拒绝。

    @param {list[str]} adb 已绑定设备的 ADB 命令。
    @param {str} name 缓存文件名。
    @param {str} key 目标字段。
    @return {str} 仅供内存处理的字段值。
    """
    values = [node.text or "" for node in read_prefs(adb, name) if node.tag == "string" and node.get("name") == key]
    if len(values) != 1:
        raise ObservationError("native_session_not_ready")
    return values[0]


def collect(adb: list[str], expected: str) -> dict:
    """校验同一设备、App 版本及服务端 SDK 缓存，提取最少请求字段。

    @param {list[str]} adb 已绑定设备的 ADB 命令。
    @param {str} expected 持久绑定的设备编号。
    @return {dict} 不含登录凭据的匿名 SDK 快照。
    """
    if not re.fullmatch(r"[a-f0-9]{16}", expected):
        raise ObservationError("invalid_native_device_binding")
    if preference(adb, "config.xml", "device_id") != expected:
        raise ObservationError("native_device_binding_mismatch")
    if preference(adb, "enterflag.xml", "privacy_agreement") != "1":
        raise ObservationError("native_device_not_prepared")
    token = preference(adb, "enterflag.xml", "sm_device_id")
    server = preference(adb, SDK_CACHE_NAME + ".xml", SDK_CACHE_NAME)
    if not re.fullmatch(r"B[A-Za-z0-9+/=_-]{88}", token) or server != token[1:]:
        raise ObservationError("native_session_not_ready")
    package = read_adb(adb, ["shell", "dumpsys", "package", PACKAGE]).decode("utf-8")
    if not re.search(r"versionCode=" + APP_BUILD + r"\b", package) or not re.search(r"versionName=" + re.escape(APP_VERSION) + r"\s", package):
        raise ObservationError("unsupported_native_app_version")
    size = read_adb(adb, ["shell", "wm", "size"]).decode("ascii")
    density = read_adb(adb, ["shell", "wm", "density"]).decode("ascii")
    sizes = re.findall(r"(?:Physical|Override) size: (\d+)x(\d+)", size)
    densities = re.findall(r"(?:Physical|Override) density: (\d+)", density)
    if not sizes or not densities or int(densities[-1]) <= 0:
        raise ObservationError("native_display_unavailable")
    return {
        "deviceId": expected,
        "token": token,
        "model": read_adb(adb, ["shell", "getprop", "ro.product.model"]).decode("utf-8").strip(),
        "osVersion": read_adb(adb, ["shell", "getprop", "ro.build.version.release"]).decode("ascii").strip(),
        "dw": str(int(sizes[-1][0]) * 160 // int(densities[-1])),
        "appVersion": APP_VERSION,
        "appBuild": APP_BUILD,
        "channel": "heybox",
        "observedAt": int(time.time() * 1000),
    }


def main() -> int:
    """默认输出脱敏状态；显式管道模式供固定设备的详情服务读取。

    @return {int} 成功为零，尚未就绪或读取失败为二。
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", default="adb")
    parser.add_argument("--serial", required=True)
    parser.add_argument("--binding", required=True, type=Path)
    parser.add_argument("--emit-session", action="store_true")
    args = parser.parse_args()
    try:
        if args.emit_session and sys.stdout.isatty():
            raise ObservationError("native_session_requires_private_pipe")
        expected = args.binding.read_text(encoding="ascii").strip()
        result = collect([args.adb, "-s", args.serial], expected)
        print(json.dumps(result if args.emit_session else {"ready": True, "observedAt": result["observedAt"]}))
        return 0
    except (OSError, UnicodeError, ObservationError):
        print(json.dumps({"ready": False, "error": "native_session_unavailable"}))
        return 2


if __name__ == "__main__":
    sys.exit(main())
