/**
 * @file 本文件提供项目测试共用的轻量断言工具。
 */

/**
 * 断言两个值的 JSON 表示相等。
 *
 * @param actual 实际值。
 * @param expected 期望值。
 * @return 断言通过时无返回值。
 */
export function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

/**
 * 断言异步函数会抛出指定错误信息。
 *
 * @param fn 待执行的异步函数。
 * @param message 期望的错误信息。
 * @return 断言通过时无返回值。
 */
export async function assertRejects(
  fn: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof Error && error.message === message) {
      return;
    }
    throw error;
  }

  throw new Error(`Expected rejection with message: ${message}`);
}
