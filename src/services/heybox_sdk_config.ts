/** @file 原生匿名 SDK 的配置握手编解码；本模块不发请求、不采集设备或生成服务端令牌。 */
import { Buffer } from "node:buffer";
import {
  constants,
  createDecipheriv,
  createECDH,
  createHash,
  hkdfSync,
  publicEncrypt,
  randomBytes,
} from "node:crypto";
import { inflateSync } from "node:zlib";

/** 官方 build1149 初始化使用的公开组织标识。 */
export const heyboxSmOrganization = "0yD85BjYvGFAvHaSQ1mc";
/** 从官方 build1149 APK 公开 X.509 证书提取的 SPKI。 */
export const heyboxSmPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkCkIMCdReFwXJPspHG7B
2Vp2Q8Qc+Zil2Al40OHjoYNtyrCd2bY2KgHwm/GjafOLULfGYn4/WyZQLXmH7VDr
cpqxK2DYluH6TNww/mpVCNzoZkOfDrTNYlVOv0bNn9EtUI8a1LzBBEb7J3X9QNRU
q88IDbTfjNTZdXOkpZXkVFrxL1NK3Y5h+BnnJEJY63FC5HRJNsiRgc3pZp1bMhUf
SYcZ3Emzp10SmyTitkcspL+LoXiz1Tfz8y5ukSFQeoLwx7wRV741NOv2pKN6gpjM
Wv2H0h9lnl7wxFHaHMURzsODoCkw8u2Oj0a4Ycl+C3V+VJh7YzUjiuMBRiT+G3id
owIDAQAB
-----END PUBLIC KEY-----`;
/** 配置层采用的固定 IV，与动态采集配置响应中的 IV 分开。 */
const configIv = Buffer.from("0102030405060708");
/** 限制密文、解压数据与 JSON 的大小，防止异常配置耗尽内存。 */
const configLimit = 1024 * 1024;

/** 配置请求已有的本地元数据；均不是登录账号凭据。 */
export type HeyboxSmConfigOptions = {
  sessionId: string;
  cachedDeviceId?: string;
  cachedConfigDigest?: string;
  organization?: string;
  publicKey?: string;
};
/** 一次握手的密钥材料；仅保存在内存中，不得写入日志、报告或普通缓存。 */
export type HeyboxSmConfigKeys = {
  configKey: Uint8Array;
  privateKey: Uint8Array;
};
/** 已解密的动态采集参数；key 与 iv 仅供后续原生数据封装使用。 */
export type HeyboxSmDynamicConfig = {
  messageId: string;
  key: Uint8Array;
  iv: Uint8Array;
  collectors: string[];
};
/** 配置解密结果；动态握手失败时仍可保留静态配置，不能误报为取得令牌。 */
export type HeyboxSmConfig = {
  value: Record<string, unknown>;
  digest: string;
  dynamicStatus: "ready" | "absent" | "invalid" | "legacy";
  dynamic?: HeyboxSmDynamicConfig;
};

/**
 * 创建 SDK 配置握手请求及绑定同一组临时密钥的响应解码器。
 * @param {HeyboxSmConfigOptions} options 持久身份的现有配置元数据。
 * @return {object} 请求体和解码器；不发送请求或返回设备令牌。
 */
export function createHeyboxSmConfigExchange(options: HeyboxSmConfigOptions) {
  const org = options.organization ?? heyboxSmOrganization;
  const cachedDeviceId = options.cachedDeviceId ?? "";
  const digest = options.cachedConfigDigest ?? "";
  if (
    !validText(options.sessionId, 256) || !validText(org, 128) ||
    !validText(cachedDeviceId, 4096, true) ||
    (digest !== "" && !/^[0-9a-f]{32}$/.test(digest))
  ) throw new Error("Invalid SM configuration metadata");
  const agreement = createECDH("prime256v1");
  const publicPoint = agreement.generateKeys();
  const keys = {
    configKey: randomBytes(32),
    privateKey: agreement.getPrivateKey(),
  };
  let wrappedKey: Buffer;
  try {
    wrappedKey = publicEncrypt({
      key: options.publicKey ?? heyboxSmPublicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    }, keys.configKey);
  } catch {
    throw new Error("Invalid SM configuration public key");
  }
  return {
    body: JSON.stringify({
      organization: org,
      data: {
        os: "android",
        // APK 的展示版本为 3.17.2_build1，但该请求明确使用 3.17.2。
        sdkver: "3.17.2",
        md5: digest,
        enc: 1,
        bb: cachedDeviceId,
        sid: options.sessionId,
        pri: wrappedKey.toString("base64"),
        epk: publicPoint.toString("base64"),
      },
    }),
    /**
     * 使用该请求的临时密钥读取响应。
     * @param {unknown} response 配置接口的响应 JSON。
     * @return {HeyboxSmConfig} 解码的配置和动态状态。
     */
    decode: (response: unknown): HeyboxSmConfig =>
      decodeHeyboxSmConfigResponse(response, keys),
  };
}

/**
 * 按 APK 配置路径解密响应，供内存握手和无真实凭据的离线向量核对共用。
 * @param {unknown} response 包含 detail.data 的 SDK JSON 响应。
 * @param {HeyboxSmConfigKeys} keys 当前配置请求独有的 AES key 与 P-256 私钥。
 * @return {HeyboxSmConfig} 静态配置及独立的动态握手状态。
 */
export function decodeHeyboxSmConfigResponse(
  response: unknown,
  keys: HeyboxSmConfigKeys,
): HeyboxSmConfig {
  try {
    if (!record(response) || !record(response.detail)) throw new Error();
    const detail = response.detail;
    if (
      !Number.isSafeInteger(detail.length) || Number(detail.length) < 0 ||
      Number(detail.length) > configLimit || keys.configKey.length !== 32 ||
      keys.privateKey.length === 0 || keys.privateKey.length > 32 ||
      ![undefined, 0, 1].includes(detail.enc as number | undefined) ||
      ![undefined, 0, 1].includes(detail.ver as number | undefined)
    ) throw new Error();
    const ciphertext = base64(detail.data, configLimit);
    const decrypted = decrypt(ciphertext, keys.configKey, configIv);
    const plain = detail.enc === 1
      ? inflateSync(decrypted, { maxOutputLength: configLimit })
      : decrypted;
    if (plain.length > configLimit) throw new Error();
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(plain),
    );
    if (!record(value)) throw new Error();
    const result: HeyboxSmConfig = {
      value,
      digest: createHash("md5").update(plain).digest("hex"),
      dynamicStatus: detail.ver === 1 ? "absent" : "legacy",
    };
    if (detail.ver !== 1 || value.encry === undefined) return result;
    try {
      result.dynamic = decodeDynamic(value.encry, keys.privateKey);
      result.dynamicStatus = "ready";
    } catch {
      // SDK 在动态部分失败时保留已解析的配置，但不会把 C 置为成功状态 5。
      result.dynamicStatus = "invalid";
    }
    return result;
  } catch {
    // 不把上游响应、密钥材料或密码库错误拼入可记录的诊断信息。
    throw new Error("Invalid SM configuration response");
  }
}

/**
 * 使用 P-256 ECDH 与 HKDF 还原动态采集配置的独立会话密钥。
 * @param {unknown} encoded Base64 编码的动态参数 JSON。
 * @param {Uint8Array} privateKey 当前握手的 P-256 私钥。
 * @return {HeyboxSmDynamicConfig} 解密后的采集项、消息标识与数据封装密钥。
 */
function decodeDynamic(
  encoded: unknown,
  privateKey: Uint8Array,
): HeyboxSmDynamicConfig {
  const envelope: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      base64(encoded, configLimit),
    ),
  );
  if (!record(envelope) || !validText(envelope.msgId, 1024)) throw new Error();
  const peer = base64(envelope.ephemeral_pub, 65);
  const iv = base64(envelope.iv, 16);
  const salt = base64(envelope.salt, 1024);
  if (peer.length !== 65 || peer[0] !== 4 || iv.length !== 16 || !salt.length) {
    throw new Error();
  }
  const agreement = createECDH("prime256v1");
  agreement.setPrivateKey(privateKey);
  const shared = agreement.computeSecret(peer);
  const key = new Uint8Array(hkdfSync("sha256", shared, salt, "AES-KEY", 32));
  const plaintext = decrypt(base64(envelope.ciphertext, configLimit), key, iv);
  const data: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
  );
  if (!record(data)) throw new Error();
  const collectors = data.collect ?? [];
  if (
    !Array.isArray(collectors) || collectors.length > 4096 ||
    collectors.some((item) => !validText(item, 1024))
  ) throw new Error();
  return { messageId: envelope.msgId as string, key, iv, collectors };
}

/**
 * 按 AES-256-CBC 和 PKCS 填充解密，拒绝空密文或残缺的加密块。
 * @param {Uint8Array} data 密文。
 * @param {Uint8Array} key 当前握手密钥。
 * @param {Uint8Array} iv 当前层初始化向量。
 * @return {Buffer} 解密后的字节。
 */
function decrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Buffer {
  if (!data.length || data.length % 16 !== 0) throw new Error();
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * 严格读取标准 Base64，限制解码大小并拒绝无效字符。
 * @param {unknown} value 编码文本。
 * @param {number} limit 解码字节上限。
 * @return {Buffer} 已校验的解码字节。
 */
function base64(value: unknown, limit: number): Buffer {
  if (
    typeof value !== "string" || value.length > 4 * Math.ceil(limit / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) throw new Error();
  const decoded = Buffer.from(value, "base64");
  if (decoded.length > limit || decoded.toString("base64") !== value) {
    throw new Error();
  }
  return decoded;
}

/**
 * 判断 JSON 值是否是普通对象，排除空值和数组。
 * @param {unknown} value 待检查值。
 * @return {boolean} 是否为对象。
 */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 校验有限长度的元数据，禁止控制字符进入身份或诊断字段。
 * @param {unknown} value 待检查的元数据。
 * @param {number} limit 字符上限。
 * @param {boolean} allowEmpty 是否允许空字符串。
 * @return {boolean} 是否为有效字符串。
 */
function validText(
  value: unknown,
  limit: number,
  allowEmpty = false,
): value is string {
  // deno-lint-ignore no-control-regex -- 此处特意拒绝 ASCII 控制字符。
  const controls = /[\x00-\x1f\x7f]/;
  return typeof value === "string" && (allowEmpty || value.length > 0) &&
    value.length <= limit && !controls.test(value);
}
