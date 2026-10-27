/** @file 将全部现有静态资源复制到原生构建目录，保留彩蛋完整资源和目录层级。 */
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

/** 仓库中的原始静态资源目录。 */
const source = fileURLToPath(new URL("../../static/", import.meta.url));
/** 原生工程共用的生成目录，不纳入版本控制。 */
const destination = fileURLToPath(
  new URL("../generated/static/", import.meta.url),
);
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
/**
 * 递归收集资源路径，校验各端安装包没有遗漏整套彩蛋资源。
 * @param {string} folder 当前目录。
 * @return {Promise<string[]>} 相对于源目录的路径。
 */
async function entries(folder) {
  const result = [];
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const name = path.join(folder, item.name);
    if (item.isDirectory()) result.push(...await entries(name));
    else result.push(path.relative(source, name).split(path.sep).join("/"));
  }
  return result;
}
await writeFile(
  path.join(destination, "asset-manifest.json"),
  JSON.stringify((await entries(source)).sort()),
);
/** 复用站点图标的原始 PNG 字节，仅添加平台容器，不改变图案。 */
const faviconSource = await readFile(
  new URL("../../src/favicon.ts", import.meta.url),
  "utf8",
);
const encoded = faviconSource.match(
  /const faviconPngBase64 = \[([\s\S]*?)\]\.join/,
)[1].match(/"([A-Za-z0-9+/=]+)"/g).map((value) => value.slice(1, -1)).join("");
const icon = Buffer.from(encoded, "base64");
await writeFile(path.join(destination, "favicon.png"), icon);
if (!process.argv.includes("--android")) {
  /** Windows 图标画布补齐 256 像素，原图像素与尺寸保持不变。 */
  const { PNG } = createRequire(
    new URL("../desktop/package.json", import.meta.url),
  )("pngjs");
  const original = PNG.sync.read(icon);
  const canvas = new PNG({ width: 256, height: 256 });
  PNG.bitblt(
    original,
    canvas,
    0,
    0,
    original.width,
    original.height,
    Math.floor((256 - original.width) / 2),
    Math.floor((256 - original.height) / 2),
  );
  const windowsIcon = PNG.sync.write(canvas);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(windowsIcon.length, 14);
  header.writeUInt32LE(22, 18);
  await writeFile(
    new URL("../generated/app.ico", import.meta.url),
    Buffer.concat([header, windowsIcon]),
  );
}
const androidIcons = new URL(
  "../generated/android-res/drawable/",
  import.meta.url,
);
await mkdir(androidIcons, { recursive: true });
await writeFile(new URL("launcher.png", androidIcons), icon);
