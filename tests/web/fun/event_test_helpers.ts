/** @file 提供彩蛋测试使用的 DOM 查询与脚本、样式检查工具。 */
/**
 * 在测试用的树形节点中按类名查找第一个匹配节点。
 *
 * 类名按空格分词匹配，因此 `lobotomy-corp-alert-corner left-up` 也能命中
 * `lobotomy-corp-alert-corner`。
 *
 * @param {object} root 子树根节点。
 * @param {string} className 目标类名。
 * @return {object|undefined} 首个匹配节点。
 */
export function findByClass<T extends { children: T[]; className: string }>(
  root: T,
  className: string,
): T | undefined {
  if (hasTestClass(root, className)) return root;
  for (const child of root.children) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return undefined;
}

/**
 * 在测试用的树形节点中按类名收集全部匹配节点（文档顺序）。
 *
 * @param {object} root 子树根节点。
 * @param {string} className 目标类名。
 * @return {object[]} 匹配节点列表。
 */
export function findAllByClass<T extends { children: T[]; className: string }>(
  root: T,
  className: string,
): T[] {
  const matches = hasTestClass(root, className) ? [root] : [];
  for (const child of root.children) {
    matches.push(...findAllByClass(child, className));
  }
  return matches;
}

/**
 * 判断节点是否带有指定类名。
 *
 * @param {object} node 节点。
 * @param {string} className 目标类名。
 * @return {boolean} 带有该类名时返回 true。
 */
function hasTestClass(
  node: { className: string },
  className: string,
): boolean {
  return node.className.split(/\s+/).includes(className);
}

/**
 * 按类名查找必须存在的节点，缺失时给出可读的失败信息。
 *
 * @param {object} root 子树根节点。
 * @param {string} className 目标类名。
 * @return {object} 匹配节点。
 */
export function requireByClass<T extends { children: T[]; className: string }>(
  root: T,
  className: string,
): T {
  const found = findByClass(root, className);
  if (!found) {
    throw new Error(`测试 DOM 中缺少 .${className} 节点。`);
  }
  return found;
}

/**
 * 去掉 JavaScript 源码中的注释与字符串内容，只保留代码结构。
 *
 * 供「源码中不得出现某个标识符」这类检查使用：注释或字符串里提到该标识符（例如
 * 资源文件名）不属于违规，不应让检查失败。
 *
 * @param {string} source 源码文本。
 * @return {string} 去掉注释与字符串内容后的文本。
 */
export function stripJavaScriptCommentsAndStrings(source: string): string {
  let result = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "/" && source[index + 1] === "/") {
      const newline = source.indexOf("\n", index);
      index = newline < 0 ? source.length : newline;
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      const close = source.indexOf("*/", index + 2);
      index = close < 0 ? source.length : close + 2;
      continue;
    }
    if (char === '"' || char === "'") {
      result += `${char}${char}`;
      index++;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === char) break;
        index++;
      }
      index++;
      continue;
    }
    if (char === "`") {
      result += "``";
      index++;
      while (index < source.length) {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === "`") break;
        if (source[index] === "$" && source[index + 1] === "{") {
          let depth = 1;
          let inner = index + 2;
          while (inner < source.length && depth > 0) {
            if (source[inner] === "{") depth++;
            else if (source[inner] === "}") depth--;
            inner++;
          }
          result += stripJavaScriptCommentsAndStrings(
            source.slice(index + 2, Math.max(index + 2, inner - 1)),
          );
          index = inner;
          continue;
        }
        index++;
      }
      index++;
      continue;
    }
    result += char;
    index++;
  }
  return result;
}

/**
 * 去掉 CSS 源码中的注释。
 *
 * @param {string} source 样式表文本。
 * @return {string} 去掉注释后的文本。
 */
export function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ");
}
