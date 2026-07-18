/**
 * @file 本文件提供通知投递出站目标的安全校验能力。
 */

/**
 * 出站目标校验成功或失败的统一结果。
 */
export type OutboundValidationResult<T> =
  | { ok: true; value: T }
  | { message: string; ok: false };

/**
 * HTTP 出站目标校验选项。
 */
export type HttpEndpointValidationOptions = {
  allowedHosts: readonly string[];
  serviceLabel: string;
};

/**
 * SMTP 出站目标校验选项。
 */
export type SmtpEndpointValidationOptions = {
  allowedHosts: readonly string[];
  serviceLabel: string;
};

/**
 * DNS 记录类型。
 */
export type DnsRecordType = "A" | "AAAA";

/**
 * DNS 解析函数。
 */
export type DnsResolver = (hostname: string, recordType: DnsRecordType) => Promise<string[]>;

/**
 * DNS 解析结果校验选项。
 */
export type ResolvedHostValidationOptions = {
  allowedHosts: readonly string[];
  resolveDns: DnsResolver;
  serviceLabel: string;
};

/**
 * SMTP 出站目标。
 */
export type SmtpEndpoint = {
  host: string;
  port: number;
};

/**
 * HTTP(S) 出站目标默认允许的端口集合。
 */
const allowedHttpPorts = new Set(["", "443"]);

/**
 * SMTP 出站目标默认允许的端口集合。
 */
const allowedSmtpPorts = new Set([25, 465, 587]);

/**
 * 明确代表本机或非公网命名空间的主机名集合。
 */
const blockedHostnames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

/**
 * 将环境变量中的出站允许主机列表解析为规范化主机名。
 *
 * @param {string | undefined} value 逗号分隔的主机名列表。
 * @return {string[]} 规范化后的主机名或通配符列表。
 */
export function parseAllowedOutboundHosts(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((host) => normalizeHostPattern(host))
    .filter((host): host is string => Boolean(host));
}

/**
 * 校验并规范化 HTTP(S) 出站目标 URL。
 *
 * @param {string} value 原始 URL。
 * @param {HttpEndpointValidationOptions} options 出站目标校验选项。
 * @return {OutboundValidationResult<string>} 校验结果，成功时包含规范化 URL。
 */
export function validateHttpEndpoint(
  value: string,
  options: HttpEndpointValidationOptions,
): OutboundValidationResult<string> {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return blockedEndpoint(options.serviceLabel);
  }

  if (parsed.protocol !== "https:") {
    return blockedEndpoint(options.serviceLabel);
  }

  if (parsed.username || parsed.password) {
    return blockedEndpoint(options.serviceLabel);
  }

  if (!allowedHttpPorts.has(parsed.port)) {
    return blockedEndpoint(options.serviceLabel);
  }

  return validateHost(parsed.hostname, options.allowedHosts, options.serviceLabel)
    ? { ok: true, value: parsed.toString() }
    : blockedEndpoint(options.serviceLabel);
}

/**
 * 校验并规范化 SMTP 出站目标。
 *
 * @param {SmtpEndpoint} endpoint 原始 SMTP 主机和端口。
 * @param {SmtpEndpointValidationOptions} options 出站目标校验选项。
 * @return {OutboundValidationResult<SmtpEndpoint>} 校验结果，成功时包含规范化 SMTP 目标。
 */
export function validateSmtpEndpoint(
  endpoint: SmtpEndpoint,
  options: SmtpEndpointValidationOptions,
): OutboundValidationResult<SmtpEndpoint> {
  if (!allowedSmtpPorts.has(endpoint.port)) {
    return blockedEndpoint(options.serviceLabel);
  }

  const host = normalizeHost(endpoint.host);
  if (!host) {
    return blockedEndpoint(options.serviceLabel);
  }

  return validateHost(host, options.allowedHosts, options.serviceLabel)
    ? { ok: true, value: { host, port: endpoint.port } }
    : blockedEndpoint(options.serviceLabel);
}

/**
 * 校验主机名 DNS 解析结果是否仍为允许的出站目标。
 *
 * @param {string} value 原始主机名。
 * @param {ResolvedHostValidationOptions} options DNS 解析结果校验选项。
 * @return {Promise<OutboundValidationResult<void>>} DNS 解析结果校验结果。
 */
export async function validateResolvedOutboundHost(
  value: string,
  options: ResolvedHostValidationOptions,
): Promise<OutboundValidationResult<void>> {
  const host = normalizeHost(value);
  if (!host) {
    return blockedEndpoint(options.serviceLabel);
  }

  if (options.allowedHosts.length > 0 || parseIpv4Address(host) || parseIpv6Address(host)) {
    return { ok: true, value: undefined };
  }

  let addresses: string[];
  try {
    addresses = await resolveHostAddresses(host, options.resolveDns);
  } catch {
    return blockedEndpoint(options.serviceLabel);
  }

  return addresses.some((address) => isBlockedIpAddress(normalizeHost(address) ?? ""))
    ? blockedEndpoint(options.serviceLabel)
    : { ok: true, value: undefined };
}

/**
 * 判断主机名是否通过出站安全规则。
 *
 * @param {string} value 原始主机名。
 * @param {readonly string[]} allowedHosts 管理员配置的允许主机列表。
 * @param {string} serviceLabel 当前通知服务标签。
 * @return {boolean} 主机名允许出站访问时返回 true。
 */
function validateHost(
  value: string,
  allowedHosts: readonly string[],
  serviceLabel: string,
): boolean {
  const host = normalizeHost(value);
  if (!host) {
    return false;
  }

  if (allowedHosts.length > 0) {
    return allowedHosts.some((allowedHost) => hostMatchesAllowedPattern(host, allowedHost));
  }

  if (isBlockedHostname(host) || isBlockedIpAddress(host)) {
    return false;
  }

  if (!isPublicDomainName(host)) {
    return false;
  }

  return serviceLabel.length > 0;
}

/**
 * 规范化允许主机列表中的单项模式。
 *
 * @param {string} value 原始允许主机模式。
 * @return {string | undefined} 规范化后的允许主机模式，空值无效时返回 undefined。
 */
function normalizeHostPattern(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("*.")) {
    const suffix = normalizeHost(trimmed.slice(2));
    return suffix ? `*.${suffix}` : undefined;
  }

  return normalizeHost(trimmed);
}

/**
 * 规范化主机名并移除 URL IPv6 方括号。
 *
 * @param {string} value 原始主机名。
 * @return {string | undefined} 规范化后的主机名，空值或明显非法时返回 undefined。
 */
function normalizeHost(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  const unwrapped = trimmed.startsWith("[") && trimmed.endsWith("]")
    ? trimmed.slice(1, -1)
    : trimmed;
  const host = unwrapped.replace(/\.$/, "");

  if (!host || host.includes("/") || host.includes("\\") || host.includes("@")) {
    return undefined;
  }

  if (host.includes(":")) {
    return parseIpv6Address(host) ? host : undefined;
  }

  return host;
}

/**
 * 判断主机名是否命中管理员允许模式。
 *
 * @param {string} host 待匹配主机名。
 * @param {string} pattern 允许主机模式。
 * @return {boolean} 主机名命中允许模式时返回 true。
 */
function hostMatchesAllowedPattern(host: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(2);
    return host !== suffix && host.endsWith(`.${suffix}`);
  }

  return host === pattern;
}

/**
 * 判断主机名是否属于明确不允许的本机或内部命名空间。
 *
 * @param {string} host 规范化后的主机名。
 * @return {boolean} 主机名应被拒绝时返回 true。
 */
function isBlockedHostname(host: string): boolean {
  return blockedHostnames.has(host) || host.endsWith(".localhost") || host.endsWith(".local") ||
    host.endsWith(".internal");
}

/**
 * 判断主机名是否是允许直接访问的公网域名。
 *
 * @param {string} host 规范化后的主机名。
 * @return {boolean} 主机名看起来是公网域名时返回 true。
 */
function isPublicDomainName(host: string): boolean {
  if (parseIpv4Address(host) || parseIpv6Address(host)) {
    return true;
  }

  if (!host.includes(".") || host.length > 253) {
    return false;
  }

  return host.split(".").every((label) =>
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  );
}

/**
 * 判断主机名是否是禁止出站访问的 IP 地址。
 *
 * @param {string} host 规范化后的主机名。
 * @return {boolean} 主机名是非公网 IP 地址时返回 true。
 */
function isBlockedIpAddress(host: string): boolean {
  const ipv4 = parseIpv4Address(host);
  if (ipv4) {
    return isBlockedIpv4Address(ipv4);
  }

  const ipv6 = parseIpv6Address(host);
  if (ipv6) {
    return isBlockedIpv6Address(ipv6);
  }

  return false;
}

/**
 * 解析主机名的 A 和 AAAA 记录。
 *
 * @param {string} host 规范化后的主机名。
 * @param {DnsResolver} resolveDns DNS 解析函数。
 * @return {Promise<string[]>} 解析得到的 IP 地址列表。
 */
async function resolveHostAddresses(host: string, resolveDns: DnsResolver): Promise<string[]> {
  const [ipv4Addresses, ipv6Addresses] = await Promise.all([
    resolveDnsRecords(host, "A", resolveDns),
    resolveDnsRecords(host, "AAAA", resolveDns),
  ]);

  return [...ipv4Addresses, ...ipv6Addresses];
}

/**
 * 解析指定类型的 DNS 记录。
 *
 * @param {string} host 规范化后的主机名。
 * @param {DnsRecordType} recordType DNS 记录类型。
 * @param {DnsResolver} resolveDns DNS 解析函数。
 * @return {Promise<string[]>} 指定类型解析得到的 IP 地址列表。
 */
async function resolveDnsRecords(
  host: string,
  recordType: DnsRecordType,
  resolveDns: DnsResolver,
): Promise<string[]> {
  try {
    return await resolveDns(host, recordType);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return [];
    }

    throw error;
  }
}

/**
 * 解析 IPv4 字符串。
 *
 * @param {string} value IPv4 字符串。
 * @return {number[] | undefined} IPv4 字节数组，无效时返回 undefined。
 */
function parseIpv4Address(value: string): number[] | undefined {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return undefined;
  }

  const bytes = parts.map((part) => Number(part));
  return bytes.every((byte, index) =>
      String(byte) === parts[index] &&
      Number.isInteger(byte) &&
      byte >= 0 &&
      byte <= 255
    )
    ? bytes
    : undefined;
}

/**
 * 解析 IPv6 字符串。
 *
 * @param {string} value IPv6 字符串。
 * @return {number[] | undefined} IPv6 字节数组，无效时返回 undefined。
 */
function parseIpv6Address(value: string): number[] | undefined {
  if (!value.includes(":")) {
    return undefined;
  }

  const doubleColonParts = value.split("::");
  if (doubleColonParts.length > 2) {
    return undefined;
  }

  const left = parseIpv6Groups(doubleColonParts[0] ?? "");
  const right = parseIpv6Groups(doubleColonParts[1] ?? "");
  if (!left || !right) {
    return undefined;
  }

  const missingGroups = doubleColonParts.length === 2 ? 8 - left.length - right.length : 0;
  if (missingGroups < 0 || (doubleColonParts.length === 1 && left.length !== 8)) {
    return undefined;
  }

  const groups = [...left, ...Array(missingGroups).fill(0), ...right];
  if (groups.length !== 8) {
    return undefined;
  }

  return groups.flatMap((group) => [group >> 8, group & 0xff]);
}

/**
 * 解析 IPv6 分组片段。
 *
 * @param {string} value IPv6 左侧或右侧分组片段。
 * @return {number[] | undefined} IPv6 16 位分组列表，无效时返回 undefined。
 */
function parseIpv6Groups(value: string): number[] | undefined {
  if (!value) {
    return [];
  }

  const parts = value.split(":");
  if (parts.some((part) => part.length === 0)) {
    return undefined;
  }

  const groups: number[] = [];
  for (const part of parts) {
    const ipv4 = part.includes(".") ? parseIpv4Address(part) : undefined;
    if (ipv4) {
      groups.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/i.test(part)) {
      return undefined;
    }
    groups.push(Number.parseInt(part, 16));
  }

  return groups;
}

/**
 * 判断 IPv4 地址是否属于非公网或保留地址范围。
 *
 * @param {number[]} bytes IPv4 字节数组。
 * @return {boolean} 地址不应出站访问时返回 true。
 */
function isBlockedIpv4Address(bytes: number[]): boolean {
  const [first, second, third] = bytes;
  return first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224;
}

/**
 * 判断 IPv6 地址是否属于非公网或保留地址范围。
 *
 * @param {number[]} bytes IPv6 字节数组。
 * @return {boolean} 地址不应出站访问时返回 true。
 */
function isBlockedIpv6Address(bytes: number[]): boolean {
  const isUnspecified = bytes.every((byte) => byte === 0);
  const isLoopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  const isUniqueLocal = (bytes[0] & 0xfe) === 0xfc;
  const isLinkLocal = bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80;
  const isMulticast = bytes[0] === 0xff;
  const ipv4Mapped = ipv4FromMappedIpv6(bytes);

  return isUnspecified || isLoopback || isUniqueLocal || isLinkLocal || isMulticast ||
    Boolean(ipv4Mapped && isBlockedIpv4Address(ipv4Mapped));
}

/**
 * 从 IPv4 映射 IPv6 地址中提取 IPv4 字节。
 *
 * @param {number[]} bytes IPv6 字节数组。
 * @return {number[] | undefined} 映射的 IPv4 字节数组，不是映射地址时返回 undefined。
 */
function ipv4FromMappedIpv6(bytes: number[]): number[] | undefined {
  const prefix = bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff;
  return prefix ? bytes.slice(12, 16) : undefined;
}

/**
 * 创建出站目标被拒绝时的校验结果。
 *
 * @param {string} serviceLabel 当前通知服务标签。
 * @return {OutboundValidationResult<never>} 出站目标被拒绝的校验结果。
 */
function blockedEndpoint(serviceLabel: string): OutboundValidationResult<never> {
  return {
    message: `${serviceLabel} is not allowed for security reasons.`,
    ok: false,
  };
}
