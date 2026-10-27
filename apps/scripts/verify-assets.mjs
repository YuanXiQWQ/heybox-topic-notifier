/** @file 核对安装包中每个静态资源的完整摘要，包含所有彩蛋音视频、字体和脚本。 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** 源资源是唯一校验基准，安装包中的清单不能自行定义完整性范围。 */
const source = fileURLToPath(new URL("../../static/", import.meta.url));
/** 参数指向 Windows 解包资源或 Android APK 中解出的 assets/static。 */
const target = path.resolve(
  process.argv[2] ||
    fileURLToPath(new URL("../generated/static/", import.meta.url)),
);
/**
 * 递归收集原始静态资源路径。
 * @param {string} directory 当前源目录。
 * @return {Promise<string[]>} 排序前的相对路径。
 */
async function entries(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    if (item.isDirectory()) result.push(...await entries(absolute));
    else if (item.isFile()) {
      result.push(path.relative(source, absolute).split(path.sep).join("/"));
    } else throw new Error(`Unsupported resource: ${absolute}`);
  }
  return result;
}
/**
 * 流式计算完整文件摘要，不同时将多个视频读入内存。
 * @param {string} filename 文件绝对路径。
 * @return {Promise<string>} SHA-256 摘要。
 */
async function digest(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}
/** 清单必须包含每个源资源，不能靠目录数量相同判断完整。 */
const expected = (await entries(source)).sort();
/** 安装清单必须与源目录逐项一致。 */
const manifest = JSON.parse(
  await readFile(path.join(target, "asset-manifest.json"), "utf8"),
);
if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
  throw new Error("Packaged resource manifest differs from source");
}
for (const name of expected) {
  const [original, packaged] = await Promise.all([
    digest(path.join(source, name)),
    digest(path.join(target, name)),
  ]);
  if (original !== packaged) {
    throw new Error(`Packaged resource differs: ${name}`);
  }
}
console.log(`已核对 ${expected.length} 个安装资源，全部 SHA-256 与源码一致。`);
