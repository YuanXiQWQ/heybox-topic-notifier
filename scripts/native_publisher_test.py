"""验证固定匿名身份发布器的重连边界和子进程退出，不连接真实设备或上游。"""
import contextlib
import io
import json
import queue
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.dont_write_bytecode = True
import pipe_heybox_native_sessions as publisher

# 合成数据仅用于验证传递边界，不是运行环境中的设备或鉴权。
BINDING = "0123456789abcdef"
RELAY_TOKEN = "synthetic_relay_credential_0123456789"


class PublisherRecoveryTest(unittest.TestCase):
    """检查总运行期限、固定身份和清理顺序。"""

    def invoke(self, outcomes: list, duration: int = 1000) -> tuple[int, Mock, str, float]:
        """用可控时钟运行入口，保留重连调用和脱敏日志。

        @param {list} outcomes 每次传输的异常或正常结束。
        @param {int} duration 总运行秒数。
        @return {tuple[int, Mock, str, float]} 状态、传输调用、日志和已用时间。
        """
        elapsed = [0.0]

        def advance(seconds: float) -> None:
            """推进合成时钟，不进行实际等待。

            @param {float} seconds 等待秒数。
            """
            elapsed[0] += seconds

        argv = ["publisher", "--serial", "isolated", "--binding", "binding",
                "--relay-token-file", "token", "--duration-seconds", str(duration),
                "--reconnect-attempts", "3", "--reconnect-delay-seconds", "15", "--", "transport"]
        output = io.StringIO()
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(sys, "argv", argv))
            stack.enter_context(patch.object(Path, "read_text", side_effect=[BINDING, RELAY_TOKEN]))
            stack.enter_context(patch.object(publisher.time, "monotonic", side_effect=lambda: elapsed[0]))
            stack.enter_context(patch.object(publisher.time, "sleep", side_effect=advance))
            run = stack.enter_context(patch.object(publisher, "publish", side_effect=outcomes))
            stack.enter_context(contextlib.redirect_stdout(output))
            stack.enter_context(contextlib.redirect_stderr(output))
            result = publisher.main()
        return result, run, output.getvalue(), elapsed[0]

    def test_transient_failure_reuses_identity_and_total_deadline(self) -> None:
        """两次暂时故障后继续同一绑定，并要求持久化冷却。"""
        result, run, output, elapsed = self.invoke([OSError(), publisher.TransportUnavailable(), None])
        self.assertEqual(result, 0)
        self.assertEqual(elapsed, 45)
        self.assertEqual(run.call_count, 3)
        for call in run.call_args_list:
            self.assertEqual(call.args[2:4], (BINDING, RELAY_TOKEN))
            self.assertEqual(call.args[6:8], (1000, True))
            self.assertIs(call.args[8], run.call_args_list[0].args[8])
        self.assertNotIn(BINDING, output)
        self.assertNotIn(RELAY_TOKEN, output)

    def test_permanent_device_error_never_reconnects(self) -> None:
        """身份和版本变化均直接停止，不能由重试改选设备。"""
        for reason in publisher.PERMANENT_DEVICE_ERRORS:
            with self.subTest(reason=reason):
                result, run, _, elapsed = self.invoke([publisher.ObservationError(reason)])
                self.assertEqual((result, run.call_count, elapsed), (2, 1, 0))

    def test_deadline_prevents_retry_that_would_outlive_run(self) -> None:
        """总期限不足以完成退避时停止，不延长验证窗口。"""
        result, run, _, elapsed = self.invoke([OSError()], duration=10)
        self.assertEqual((result, run.call_count, elapsed), (2, 1, 0))

    def test_reconnect_attempts_are_bounded(self) -> None:
        """连续故障达到上限后停止，避免无限恢复循环。"""
        result, run, _, elapsed = self.invoke([OSError()] * 4)
        self.assertEqual((result, run.call_count, elapsed), (2, 4, 105))

    def test_zero_exit_before_deadline_is_transport_failure(self) -> None:
        """真实子进程提前以零退出也视为传输中断，触发外层恢复。"""
        with patch.object(publisher, "current_session", return_value={"observedAt": 1000, "token": "synthetic"}):
            with self.assertRaises((OSError, publisher.TransportUnavailable)):
                publisher.publish([sys.executable, "-B", "-c", "import sys; sys.stdin.readline()"],
                                  [], BINDING, RELAY_TOKEN, False, 30,
                                  publisher.time.monotonic() + 10, True)

    def test_sdk_read_failure_closes_transport_pipe(self) -> None:
        """定时观察失败后先关闭管道并等待服务结束。"""
        process = Mock()
        process.stdin = io.BytesIO()
        process.stdout = io.BytesIO()
        process.poll.return_value = None
        process.wait.return_value = 0
        with patch.object(publisher, "current_session", side_effect=[{"observedAt":1000,"token":"synthetic"}, publisher.ObservationError("temporarily_offline")]), \
                patch.object(publisher.subprocess, "Popen", return_value=process), \
                patch.object(publisher.time, "monotonic", side_effect=[0, 31]):
            with self.assertRaises(publisher.ObservationError):
                publisher.publish(["transport"], [], BINDING, RELAY_TOKEN, False, 30, None, True)
        self.assertTrue(process.stdin.closed)
        process.wait.assert_called_once_with(timeout=15)

    def test_permanent_sdk_read_error_is_not_delayed(self) -> None:
        """App 已运行时版本不符直接返回，不进行初始化重试。"""
        with patch.object(publisher, "preference", side_effect=[BINDING, "1"]), \
                patch.object(publisher, "read_adb", return_value=b"1234"), \
                patch.object(publisher, "collect", side_effect=publisher.ObservationError("unsupported_native_app_version")), \
                patch.object(publisher.time, "sleep") as sleep:
            with self.assertRaises(publisher.ObservationError):
                publisher.current_session([], BINDING, True)
            sleep.assert_not_called()

    def test_read_only_collection_treats_protocol_changes_as_permanent(self) -> None:
        """未启用 App 启动时也不能把协议状态变化当成可自动恢复的缓存缺失。"""
        with patch("read_heybox_native_session.preference", side_effect=[BINDING,"0"]):
            with self.assertRaisesRegex(publisher.ObservationError,"native_device_not_prepared"):
                publisher.collect([],BINDING)

    def test_transport_status_rejects_extra_private_fields(self) -> None:
        """控制消息只允许固定状态，不能转发额外身份、命令或错误正文。"""
        valid = {"event":"native_session_status","status":"rejected","retryAfterSeconds":60,"observedAt":1000}
        for value in [valid, {**valid,"token":"private"}, {**valid,"status":"show_captcha"}, {**valid,"retryAfterSeconds":-1}]:
            events = queue.Queue(maxsize=2)
            failed = threading.Event()
            publisher.transport_events(io.BytesIO((json.dumps(value)+"\n").encode()), events, failed)
            self.assertEqual(failed.is_set(), value != valid)
            self.assertEqual(events.qsize(), int(value == valid))

    def test_normal_refresh_waits_for_a_different_sdk_cache(self) -> None:
        """正常启动暂时返回旧缓存时继续等待，不把新观察时间误认为续期。"""
        old, fresh = {"token":"old"}, {"token":"new"}
        with patch.object(publisher, "current_session", side_effect=[old, old]), \
                patch.object(publisher, "collect", side_effect=[old, fresh]), \
                patch.object(publisher.subprocess, "run") as run, \
                patch.object(publisher.time, "sleep"):
            result = publisher.renewed_session(["adb","-s","isolated"], BINDING, "old")
            self.assertIs(result, fresh)
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args.args[0][-2:], ["force-stop", publisher.PACKAGE])

    def test_sdk_refresh_reuses_an_already_updated_cache(self) -> None:
        """SDK 已自行更新时直接接收，不再结束 App。"""
        with patch.object(publisher, "current_session", return_value={"token":"new"}), \
                patch.object(publisher.subprocess, "run") as run:
            self.assertEqual(publisher.renewed_session([], BINDING, "old"), {"token":"new"})
            run.assert_not_called()

    def test_unchanged_sdk_cache_stops_refresh(self) -> None:
        """正常启动后缓存始终未更新时停止，不循环重启设备或生成替代值。"""
        with patch.object(publisher, "current_session", return_value={"token":"old"}), \
                patch.object(publisher.subprocess, "run") as run, \
                patch.object(publisher.time, "monotonic", side_effect=[0,61]):
            with self.assertRaisesRegex(publisher.ObservationError, "native_sdk_refresh_unavailable"):
                publisher.renewed_session([], BINDING, "old")
            self.assertEqual(run.call_count, 1)


    def test_rejected_session_recovers_once_and_waits_for_acceptance(self) -> None:
        """真实子进程的合成拒绝信号只能触发一次刷新，成功或再次拒绝均有明确结果。"""
        for accepted, stale_rejection in ((True, False), (True, True), (False, False)):
            transport = """import json,sys
initial=json.loads(sys.stdin.readline())['session']
print(json.dumps({'event':'native_session_status','status':'rejected','retryAfterSeconds':0,'observedAt':initial['observedAt']}),flush=True)
fresh=json.loads(sys.stdin.readline())['session']
assert fresh['token']!=initial['token']
if STALE:
    print(json.dumps({'event':'native_session_status','status':'rejected','retryAfterSeconds':60,'observedAt':initial['observedAt']}),flush=True)
print(json.dumps({'event':'native_session_status','status':STATUS,'retryAfterSeconds':0,'observedAt':fresh['observedAt']}),flush=True)
sys.stdin.read()
""".replace("STATUS", repr("accepted" if accepted else "rejected")).replace("STALE",repr(stale_rejection))
            state = {"phase":"idle"}
            output = io.StringIO()
            with self.subTest(accepted=accepted, stale_rejection=stale_rejection), \
                    patch.object(publisher, "current_session", return_value={"observedAt":1000,"token":"old"}), \
                    patch.object(publisher, "renewed_session", return_value={"observedAt":2000,"token":"new"}) as renew, \
                    contextlib.redirect_stdout(output):
                arguments = ([sys.executable,"-B","-c",transport], [], BINDING, RELAY_TOKEN,
                             True, 30, publisher.time.monotonic()+3, False, state)
                if accepted:
                    publisher.publish(*arguments)
                    self.assertEqual(state, {"phase":"idle"})
                else:
                    with self.assertRaisesRegex(publisher.ObservationError, "native_sdk_refresh_rejected"):
                        publisher.publish(*arguments)
                renew.assert_called_once_with([], BINDING, "old")
                self.assertNotIn(RELAY_TOKEN, output.getvalue())


if __name__ == "__main__":
    unittest.main()
