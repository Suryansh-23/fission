import { fromBase64 } from "@mysten/bcs";

/** Normalize 0x-hex */
function toHexLower(hex: string): `0x${string}` {
  const with0x = hex.startsWith("0x") ? hex : `0x${hex}`;
  return `0x${with0x.slice(2).toLowerCase()}` as `0x${string}`;
}

/** Convert vector<u8> representations in parsedJson to 0x-hex */
function vecU8ToHex(v: unknown): `0x${string}` | null {
  const bytesToHex = (u8: Uint8Array) =>
    `0x${Array.from(u8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}` as `0x${string}`;

  if (typeof v === "string") {
    if (v.startsWith("0x") || v.startsWith("0X")) return toHexLower(v);
    try {
      return bytesToHex(fromBase64(v)); // some nodes encode vector<u8> as base64 in parsedJson
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) {
    return bytesToHex(Uint8Array.from(v as number[]));
  }
  return null;
}

export { toHexLower, vecU8ToHex };
