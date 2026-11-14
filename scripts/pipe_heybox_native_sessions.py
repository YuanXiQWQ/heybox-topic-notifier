"""从已绑定的专用 Android 定时读取正常 SDK 状态，经子进程管道供给详情服务。

传输命令来自部署配置，可为本机 Deno 或既有 SSH 连接；不创建、轮换设备身份。
SDK 标识不落盘，读取失败即关闭服务。可选有界重连要求服务端持久保存冷却。
SSH 私钥和服务鉴权由部署方独立配置。
"""

import argparse
import json
import queue
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

sys.dont_write_bytecode = True
from read_heybox_native_session import collect, preference, ObservationError
from observe_heybox_android import PACKAGE, read_adb

# 身份、版本和协议状态变化需要人工检查，不通过重试选择其它设备。
PERMANENT_DEVICE_ERRORS = {
    "invalid_native_device_binding", "native_device_binding_mismatch",
    "native_device_not_prepared", "unsupported_native_app_version",
    "native_sdk_refresh_requires_start_app", "native_sdk_refresh_rejected",
    "native_sdk_refresh_unavailable",
}


class TransportUnavailable(Exception):
    """仅表示当前传输未能持续运行，不携带命令或凭据。"""


def transport_events(stream, events: queue.Queue, failed: threading.Event) -> None:
    """读取有限的服务事件；异常格式停止传输，原始输出不进入日志。

    @param {object} stream 子进程标准输出。
    @param {queue.Queue} events 有界状态队列。
    @param {threading.Event} failed 格式或容量异常信号。
    """
    try:
        while line := stream.readline(8194):
            if len(line) > 8192:
                raise ValueError("invalid transport output")
            value = json.loads(line)
            event = value.get("event")
            valid = (event == "native_session_observed" and set(value) == {"event"})
            if event == "native_detail_listening":
                valid = set(value) == {"event", "port"} and type(value["port"]) is int and 1024 <= value["port"] <= 65535
            if event == "native_session_status":
                valid = (set(value) == {"event", "status", "retryAfterSeconds", "observedAt"}
                         and value["status"] in ("accepted", "rejected")
                         and type(value["observedAt"]) is int and 0 < value["observedAt"] < 2**53
                         and type(value["retryAfterSeconds"]) is int and 0 <= value["retryAfterSeconds"] <= 900)
            if not valid:
                raise ValueError("invalid transport event")
            events.put(value, timeout=1)
    except (OSError, ValueError, TypeError, AttributeError, queue.Full):
        failed.set()


def renewed_session(adb: list[str], expected: str, rejected_token: str) -> dict:
    """正常恢复同一 App 并等待官方 SDK 更新；不修改缓存或重复申请身份。

    @param {list[str]} adb 固定设备的 ADB 命令。
    @param {str} expected 已保存的设备编号。
    @param {str} rejected_token 服务端明确拒绝的 SDK 值，仅在内存比较。
    @return {dict} 同设备中实际不同的新 SDK 快照。
    """
    current = current_session(adb, expected, False)
    if current["token"] != rejected_token:
        return current
    subprocess.run(adb + ["shell", "am", "force-stop", PACKAGE], capture_output=True, check=True, timeout=15)
    current = current_session(adb, expected, True)
    deadline = time.monotonic() + 60
    while current["token"] == rejected_token:
        if time.monotonic() >= deadline:
            raise ObservationError("native_sdk_refresh_unavailable")
        time.sleep(2)
        current = collect(adb, expected)
    return current


def current_session(adb: list[str], expected: str, start_app: bool) -> dict:
    """按既有设备绑定正常启动 App，等待 SDK 就绪，不清除缓存或修改协议状态。

    @param {list[str]} adb 已绑定的 ADB 命令。
    @param {str} expected 持久设备编号。
    @param {bool} start_app 是否允许恢复同一 App 的正常进程。
    @return {dict} 正常 SDK 缓存的只读快照。
    """
    if not start_app:
        return collect(adb, expected)
    if preference(adb, "config.xml", "device_id") != expected or preference(adb, "enterflag.xml", "privacy_agreement") != "1":
        raise ObservationError("native_device_not_prepared")
    running = read_adb(adb, ["shell", "pidof", PACKAGE], (0, 1)).strip()
    started = not running
    if started:
        subprocess.run(adb + ["shell", "am", "start", "-n", PACKAGE + "/.SplashActivity"], capture_output=True, check=True, timeout=15)
    deadline = time.monotonic() + 60
    while True:
        try:
            return collect(adb, expected)
        except ObservationError as error:
            if str(error) in PERMANENT_DEVICE_ERRORS or time.monotonic() >= deadline:
                if started:
                    subprocess.run(adb + ["shell", "am", "force-stop", PACKAGE], capture_output=True, timeout=15)
                raise
            time.sleep(2)


def publish(command: list[str], adb: list[str], device_id: str, token: str,
            start_app: bool, refresh_seconds: int, deadline: float | None,
            require_persistent_cooldown: bool, recovery: dict | None = None) -> None:
    """运行双向传输并按冷却恢复同设备 SDK；失败先关闭管道，再允许外层退避重连。

    @param {list[str]} command 已配置的传输命令。
    @param {list[str]} adb 固定设备的 ADB 命令。
    @param {str} device_id 持久设备绑定。
    @param {str} token 独立详情鉴权，只在内存和管道中传递。
    @param {bool} start_app 是否允许恢复同一已同意协议的 App。
    @param {int} refresh_seconds 缓存观察间隔。
    @param {float | None} deadline 整个运行的单调时钟截止时间。
    @param {bool} require_persistent_cooldown 是否要求服务端冷却检查点。
    @param {dict | None} recovery 跨传输重连保留的 SDK 恢复阶段，不落盘身份。
    """
    session = current_session(adb, device_id, start_app)
    if deadline is not None and time.monotonic() >= deadline:
        return
    bootstrap = {"deviceId": device_id, "token": token, "session": session}
    if require_persistent_cooldown:
        bootstrap["requirePersistentCooldown"] = True
    recovery = recovery if recovery is not None else {"phase": "idle"}
    observed_tokens = {session["observedAt"]: session["token"]}
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    events = queue.Queue(maxsize=128)
    output_failed = threading.Event()
    reader = threading.Thread(target=transport_events, args=(process.stdout, events, output_failed), daemon=True)
    reader.start()
    failed = False
    try:
        process.stdin.write((json.dumps(bootstrap) + "\n").encode())
        process.stdin.flush()
        bootstrap.clear()
        next_refresh = time.monotonic() + refresh_seconds
        while True:
            current = time.monotonic()
            if deadline is not None and current >= deadline:
                break
            if process.poll() is not None:
                raise TransportUnavailable()
            if output_failed.is_set():
                raise TransportUnavailable()
            while not events.empty():
                event = events.get_nowait()
                print(json.dumps(event), flush=True)
                if event["event"] == "native_session_status":
                    if event["status"] == "accepted":
                        recovery.clear()
                        recovery["phase"] = "idle"
                    elif not start_app:
                        raise ObservationError("native_sdk_refresh_requires_start_app")
                    else:
                        if event["observedAt"] not in observed_tokens:
                            raise TransportUnavailable()
                        rejected_token = observed_tokens[event["observedAt"]]
                        if recovery["phase"] == "renewed":
                            if rejected_token == recovery["fresh_token"]:
                                raise ObservationError("native_sdk_refresh_rejected")
                        elif recovery["phase"] == "idle":
                            recovery.update(phase="waiting", token=rejected_token, due=current + event["retryAfterSeconds"])
            if recovery["phase"] == "waiting" and current >= recovery["due"]:
                try:
                    session = renewed_session(adb, device_id, recovery["token"])
                except (OSError, ObservationError, subprocess.SubprocessError):
                    raise ObservationError("native_sdk_refresh_unavailable") from None
                recovery["phase"] = "renewed"
                recovery["fresh_token"] = session["token"]
                process.stdin.write((json.dumps({"session": session}) + "\n").encode())
                process.stdin.flush()
                observed_tokens[session["observedAt"]] = session["token"]
                print('{"event":"native_session_sdk_refreshed"}', flush=True)
                next_refresh = time.monotonic() + refresh_seconds
            if current >= next_refresh:
                session = current_session(adb, device_id, start_app)
                process.stdin.write((json.dumps({"session": session}) + "\n").encode())
                process.stdin.flush()
                observed_tokens[session["observedAt"]] = session["token"]
                while len(observed_tokens) > 4:
                    del observed_tokens[next(iter(observed_tokens))]
                next_refresh = time.monotonic() + refresh_seconds
            time.sleep(0.5)
    finally:
        bootstrap.clear()
        try:
            process.stdin.close()
        except OSError:
            failed = True
        try:
            if process.wait(timeout=15) != 0:
                failed = True
        except subprocess.TimeoutExpired:
            failed = True
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
        reader.join(timeout=2)
        process.stdout.close()
    if failed:
        raise TransportUnavailable()


def main() -> int:
    """固定身份运行发布器；可选重连采用有界退避，不跨越已知设备错误。

    @return {int} 正常结束为零，读取或传输失败为二。
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adb", default="adb")
    parser.add_argument("--serial", required=True)
    parser.add_argument("--binding", required=True, type=Path)
    parser.add_argument("--relay-token-file", required=True, type=Path)
    parser.add_argument("--refresh-seconds", type=int, default=60)
    parser.add_argument("--duration-seconds", type=int, default=0)
    parser.add_argument("--start-app", action="store_true", help="SDK 读取前正常恢复已绑定、已接受协议的专用 App")
    parser.add_argument("--reconnect-attempts", type=int, default=0, help="传输或设备暂时不可用时的重连次数（0–10）；要求服务端配置持久冷却文件")
    parser.add_argument("--reconnect-delay-seconds", type=int, default=30, help="重连初始退避（15–300 秒），逐次加倍且不超过十五分钟")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    exit_code = 0
    try:
        if (not command or not 30 <= args.refresh_seconds <= 300 or args.duration_seconds < 0
                or not 0 <= args.reconnect_attempts <= 10 or not 15 <= args.reconnect_delay_seconds <= 300):
            raise ValueError("invalid transport configuration")
        device_id = args.binding.read_text(encoding="ascii").strip()
        token = args.relay_token_file.read_text(encoding="ascii").strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", token) or not re.fullmatch(r"[a-f0-9]{16}", device_id):
            raise ValueError("invalid relay configuration")
        adb = [args.adb, "-s", args.serial]
        deadline = time.monotonic() + args.duration_seconds if args.duration_seconds else None
        attempt = 0
        recovery = {"phase": "idle"}
        while True:
            try:
                publish(command, adb, device_id, token, args.start_app, args.refresh_seconds,
                        deadline, args.reconnect_attempts > 0, recovery)
                break
            except (OSError, ObservationError, subprocess.SubprocessError, TransportUnavailable) as error:
                if isinstance(error, ObservationError) and str(error) in PERMANENT_DEVICE_ERRORS:
                    raise
                if attempt >= args.reconnect_attempts:
                    raise
                wait = min(900, args.reconnect_delay_seconds * 2 ** attempt)
                attempt += 1
                resume_at = time.monotonic() + wait
                if deadline is not None and resume_at >= deadline:
                    raise TransportUnavailable() from None
                print(json.dumps({"event": "native_session_reconnecting", "attempt": attempt, "delaySeconds": wait}), flush=True)
                while time.monotonic() < resume_at:
                    time.sleep(max(0, min(0.5, resume_at - time.monotonic())))
    except KeyboardInterrupt:
        pass
    except (OSError, UnicodeError, ValueError, ObservationError, subprocess.SubprocessError, TransportUnavailable):
        exit_code = 2
    if exit_code:
        print('{"event":"native_session_publisher_stopped","reason":"device_or_transport_unavailable"}', file=sys.stderr)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
