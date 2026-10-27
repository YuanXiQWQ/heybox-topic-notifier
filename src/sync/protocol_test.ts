/** @file 验证跨设备同毫秒平局、时钟回退和异常未来版本。 */
import { assertEquals, assertThrows } from "@std/assert";
import { compareEdits, nextEditStamp, parseEditStamp } from "./protocol.ts";

Deno.test("edit stamps retain local order through clock rollback and reject future poisoning", () => {
  const first = nextEditStamp(undefined, 1000, "phone");
  const second = nextEditStamp(first, 999, "phone");
  assertEquals(compareEdits(second, first), 1);
  assertEquals(second.editedAt, 1000);
  assertEquals(compareEdits({ ...first, deviceId: "web" }, first), 1);
  assertThrows(() => parseEditStamp({ ...first, editedAt: 99999999 }, 1000));
  assertThrows(() => parseEditStamp({ ...first, editedAt: Infinity }, 1000));
  assertEquals(parseEditStamp(first, 100000).editedAt, 1000);
});
