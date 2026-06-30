export type HeyboxSignatureParams = {
  hkey: string;
  nonce: string;
  time: number;
};

const hkeyAlphabet = "AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89";

export function createHeyboxSignatureParams(
  path: string,
  now = new Date(),
  random = Math.random,
): HeyboxSignatureParams {
  const time = Math.floor(now.getTime() / 1000);
  const nonce = md5Hex(`${time}${random()}`).toUpperCase();

  return {
    hkey: buildHkey(path, time, nonce),
    nonce,
    time,
  };
}

export function buildHkey(path: string, time: number, nonce: string): string {
  const normalizedPath = `/${path.split("/").filter(Boolean).join("/")}/`;
  const parts = [
    encodeByPrefix(String(time + 1), hkeyAlphabet, -2),
    encodeByAlphabet(normalizedPath, hkeyAlphabet),
    encodeByAlphabet(nonce, hkeyAlphabet),
  ];
  const interleaved = interleave(parts).slice(0, 20);
  const digest = md5Hex(interleaved);
  const checksumValues = mixBytes(
    digest.slice(-6).split("").map((char) => char.charCodeAt(0)),
  );
  const checksum = String(checksumValues.reduce((sum, value) => sum + value, 0) % 100)
    .padStart(2, "0");

  return `${encodeByPrefix(digest.slice(0, 5), hkeyAlphabet, -4)}${checksum}`;
}

function encodeByPrefix(value: string, alphabet: string, end: number): string {
  const prefix = alphabet.slice(0, end);
  return Array.from(value, (char) => prefix[char.charCodeAt(0) % prefix.length]).join("");
}

function encodeByAlphabet(value: string, alphabet: string): string {
  return Array.from(value, (char) => alphabet[char.charCodeAt(0) % alphabet.length]).join("");
}

function interleave(parts: string[]): string {
  const maxLength = Math.max(...parts.map((part) => part.length));
  let value = "";

  for (let index = 0; index < maxLength; index += 1) {
    for (const part of parts) {
      if (index < part.length) {
        value += part[index];
      }
    }
  }

  return value;
}

function mixBytes(values: number[]): number[] {
  const mixed = [0, 0, 0, 0];
  mixed[0] = mixG(values[0]) ^ mixY(values[1]) ^ mixD(values[2]) ^ mixQ(values[3]);
  mixed[1] = mixQ(values[0]) ^ mixG(values[1]) ^ mixY(values[2]) ^ mixD(values[3]);
  mixed[2] = mixD(values[0]) ^ mixQ(values[1]) ^ mixG(values[2]) ^ mixY(values[3]);
  mixed[3] = mixY(values[0]) ^ mixD(values[1]) ^ mixQ(values[2]) ^ mixG(values[3]);
  values[0] = mixed[0];
  values[1] = mixed[1];
  values[2] = mixed[2];
  values[3] = mixed[3];
  return values;
}

function mixV(value: number): number {
  return (128 & value) ? (255 & ((value << 1) ^ 27)) : value << 1;
}

function mixQ(value: number): number {
  return mixV(value) ^ value;
}

function mixD(value: number): number {
  return mixQ(mixV(value));
}

function mixY(value: number): number {
  return mixD(mixQ(mixV(value)));
}

function mixG(value: number): number {
  return mixY(value) ^ mixD(value) ^ mixQ(value);
}

function md5Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const paddedLength = md5PaddedLength(bytes.length);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = Array.from(
      { length: 16 },
      (_, index) => view.getUint32(offset + index * 4, true),
    );
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let wordIndex: number;

      if (index < 16) {
        f = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }

      const next = d;
      d = c;
      c = b;
      b = unsignedAdd(
        b,
        rotateLeft(unsignedAdd(a, f, md5K[index], words[wordIndex]), md5S[index]),
      );
      a = next;
    }

    a0 = unsignedAdd(a0, a);
    b0 = unsignedAdd(b0, b);
    c0 = unsignedAdd(c0, c);
    d0 = unsignedAdd(d0, d);
  }

  return [a0, b0, c0, d0].map(littleEndianHex).join("");
}

function md5PaddedLength(inputLength: number): number {
  let length = inputLength + 1;
  while (length % 64 !== 56) {
    length += 1;
  }
  return length + 8;
}

function unsignedAdd(...values: number[]): number {
  return values.reduce((sum, value) => (sum + value) >>> 0, 0);
}

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function littleEndianHex(value: number): string {
  return [0, 8, 16, 24]
    .map((shift) => ((value >>> shift) & 0xff).toString(16).padStart(2, "0"))
    .join("");
}

const md5S = [
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  7,
  12,
  17,
  22,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  5,
  9,
  14,
  20,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  4,
  11,
  16,
  23,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
  6,
  10,
  15,
  21,
];

const md5K = Array.from(
  { length: 64 },
  (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
);
