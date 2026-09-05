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
 * 《脑叶公司》彩蛋媒体资源根目录。
 */
const lobotomyCorpAssetRoot = new URL(
  "../static/easter-egg/lobotomy-corp/assets/",
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
  rangeHeader?: string,
): Promise<Response> {
  return await easterEggAssetResponse(
    assetPath,
    aceAttorneyAssetRoot,
    rangeHeader,
  );
}

/**
 * 创建《脑叶公司》彩蛋前端脚本响应。
 *
 * @return {Promise<Response>} JavaScript 响应。
 */
export async function lobotomyCorpScriptResponse(): Promise<Response> {
  const script = await Deno.readTextFile(
    new URL(
      "../static/easter-egg/lobotomy-corp/lobotomy-corp.js",
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
 * 创建《脑叶公司》彩蛋样式表响应。
 *
 * @return {Promise<Response>} CSS 响应。
 */
export async function lobotomyCorpStyleResponse(): Promise<Response> {
  const style = await Deno.readTextFile(
    new URL(
      "../static/easter-egg/lobotomy-corp/lobotomy-corp.css",
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
 * 创建《脑叶公司》彩蛋媒体资源响应。
 *
 * @param {string} assetPath 请求的媒体资源相对路径。
 * @return {Promise<Response>} 媒体资源响应；路径无效或文件不存在时返回 404。
 */
export async function lobotomyCorpAssetResponse(
  assetPath: string,
  rangeHeader?: string,
): Promise<Response> {
  return await easterEggAssetResponse(
    assetPath,
    lobotomyCorpAssetRoot,
    rangeHeader,
  );
}

/**
 * 从指定彩蛋资源目录读取并创建媒体响应。
 *
 * @param {string} assetPath 请求的媒体资源相对路径。
 * @param {URL} assetRoot 彩蛋资源根目录。
 * @param {string|undefined} rangeHeader HTTP Range 请求头。
 * @return {Promise<Response>} 媒体资源响应；路径无效或文件不存在时返回 404。
 */
async function easterEggAssetResponse(
  assetPath: string,
  assetRoot: URL,
  rangeHeader?: string,
): Promise<Response> {
  if (!easterEggAssetPathPattern.test(assetPath)) {
    return easterEggAssetNotFoundResponse();
  }

  try {
    const content = await Deno.readFile(
      new URL(assetPath, assetRoot),
    );
    const range = easterEggAssetRange(rangeHeader, content.byteLength);
    if (range === "invalid") {
      return new Response(null, {
        status: 416,
        headers: {
          "accept-ranges": "bytes",
          "content-range": `bytes */${content.byteLength}`,
        },
      });
    }

    const partialContent = range
      ? content.slice(range.start, range.end + 1)
      : content;
    const headers: Record<string, string> = {
      "accept-ranges": "bytes",
      "cache-control": "public, max-age=86400",
      "content-length": String(partialContent.byteLength),
      "content-type": easterEggAssetContentType(assetPath),
    };
    if (range) {
      headers["content-range"] =
        `bytes ${range.start}-${range.end}/${content.byteLength}`;
    }
    return new Response(partialContent, {
      status: range ? 206 : 200,
      headers: {
        ...headers,
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
 * 解析单段 HTTP 字节范围。
 *
 * @param {string|undefined} rangeHeader HTTP Range 请求头。
 * @param {number} size 资源总字节数。
 * @return {{start: number, end: number}|"invalid"|undefined} 有效范围、无效范围或未请求范围。
 */
function easterEggAssetRange(
  rangeHeader: string | undefined,
  size: number,
): { start: number; end: number } | "invalid" | undefined {
  if (!rangeHeader) {
    return undefined;
  }
  const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader.trim());
  if (!match || size === 0) {
    return "invalid";
  }

  const [, startText, endText] = match;
  if (!startText && !endText) {
    return "invalid";
  }
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return "invalid";
    }
    return {
      end: size - 1,
      start: Math.max(0, size - suffixLength),
    };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (
    !Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) ||
    start < 0 || start >= size || requestedEnd < start
  ) {
    return "invalid";
  }
  return { end: Math.min(requestedEnd, size - 1), start };
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
