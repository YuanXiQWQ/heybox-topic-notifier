"""独立重算 build1149 的合成签名样例；无网络、APK、真实设备数据或第三方依赖。"""

import hashlib
import hmac
import json


def reflect(value, width):
    """反转指定宽度的位，用于正向 CRC 多项式除法。"""
    return int(f"{value:0{width}b}"[::-1], 2)


def checksum(message):
    """按非反向多项式逐位除法计算摘要的 CRC，与 TypeScript 采用不同方向。"""
    value = 0xFFFFFFFF
    for byte in message:
        value ^= reflect(byte, 8) << 24
        for _ in range(8):
            polynomial = 0x05AD2511 if value & 0x80000000 else 0
            value = ((value << 1) ^ polynomial) & 0xFFFFFFFF
    return reflect(value, 32) ^ 0xFFFFFFFF


def main():
    """输出与离线回归对应的固定输入、中间摘要和期望值，便于独立复核。"""
    device = "0123456789abcdef0123456789abcdef"
    samples = [
        ("/bbs/app/link/tree/", 1700000000, device, "-1"),
        ("/bbs/app/topic/feeds/", 1700000000, device, "-1"),
        ("/bbs/app/link/tree/", 1700000001, device, "-1"),
        ("/bbs/app/link/tree/", 1700000000, "fedcba9876543210fedcba9876543210", "-1"),
        ("/bbs/app/link/tree/", 1700000000, device, "123456"),
        ("/synthetic//path/", 1700000000, "offline-device", "-1"),
        ("/synthetic/" + "long/" * 40, 1700000000, "offline-device", "-1"),
        ("/bbs/app/link/tree/", 1700000014, "offline-device", "-1"),
    ]
    results = []
    for path, seconds, device_id, user_id in samples:
        message = f"{path}{seconds}{device_id}{user_id}".encode("utf-8")
        # APK 中的公开协议常量，前 32 个 ASCII 字节，不是用户凭据。
        digest = hmac.new(
            b"LFEJGJJOKCEHODNMNFIKKONFBKIHJFKB", message, hashlib.sha512
        ).digest()
        results.append({
            "path": path,
            "time": seconds,
            "deviceId": device_id,
            "heyboxId": user_id,
            "digest": digest.hex(),
            "hkey": f"{checksum(digest):X}",
        })
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
