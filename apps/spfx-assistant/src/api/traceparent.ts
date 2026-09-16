function toHexByte(value: number): string {
  const hex = value.toString(16);
  return hex.length < 2 ? `0${hex}` : hex;
}

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, toHexByte).join("");
}

/** W3C Trace Context header: version-traceId-parentId-flags (sampled). */
export function newTraceparent(): string {
  return `00-${randomHex(16)}-${randomHex(8)}-01`;
}
