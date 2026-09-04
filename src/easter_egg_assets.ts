/**
 * @file 本文件负责读取并响应各个彩蛋模块所需的前端文件与媒体资源。
 */

/**
 * 彩蛋媒体资源允许使用的相对路径格式。
 */
const easterEggAssetPathPattern =
  /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:mp3|png|wav)$/;

/**
 * 彩蛋媒体资源根目录。
 */
const aceAttorneyAssetRoot = new URL(
  "../static/easter-egg/ace-attorney/assets/",
  import.meta.url,
);

/**
 * 创建《逆转裁判》彩蛋前端脚本响应。
 *
 * @return {Promise<Response>} JavaScript 响应。
 */
export async function aceAttorneyScriptResponse(): Promise<Response> {
  const script = await Deno.readTextFile(
    new URL(
      "../static/easter-egg/ace-attorney/ace-attorney.js",
      import.meta.url,
    ),
  );
  return new Response(script, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/javascript; charset=utf-8",
    },
  });
}

/**
 * 创建《逆转裁判》彩蛋样式表响应。
 *
 * @return {Promise<Response>} CSS 响应。
 */
export async function aceAttorneyStyleResponse(): Promise<Response> {
  const style = await Deno.readTextFile(
    new URL(
      "../static/easter-egg/ace-attorney/ace-attorney.css",
      import.meta.url,
    ),
  );
  return new Response(style, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/css; charset=utf-8",
    },
  });
}

/**
 * 创建《逆转裁判》彩蛋媒体资源响应。
 *
 * @param {string} assetPath 请求的媒体资源相对路径。
 * @return {Promise<Response>} 媒体资源响应；路径无效或文件不存在时返回 404。
 */
export async function aceAttorneyAssetResponse(
  assetPath: string,
): Promise<Response> {
  if (!easterEggAssetPathPattern.test(assetPath)) {
    return easterEggAssetNotFoundResponse();
  }

  try {
    const content = await Deno.readFile(
      new URL(assetPath, aceAttorneyAssetRoot),
    );
    return new Response(content, {
      headers: {
        "cache-control": "public, max-age=86400",
        "content-type": easterEggAssetContentType(assetPath),
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return easterEggAssetNotFoundResponse();
    }
    throw error;
  }
}

/**
 * 根据彩蛋资源扩展名返回响应媒体类型。
 *
 * @param {string} assetPath 彩蛋资源相对路径。
 * @return {string} 对应的 HTTP Content-Type。
 */
function easterEggAssetContentType(assetPath: string): string {
  if (assetPath.endsWith(".png")) {
    return "image/png";
  }
  return assetPath.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
}

/**
 * 创建彩蛋资源不存在响应。
 *
 * @return {Response} 状态码为 404 的纯文本响应。
 */
function easterEggAssetNotFoundResponse(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
