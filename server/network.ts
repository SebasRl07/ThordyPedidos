import { isIP } from "node:net";
export function isPrivateAddress(ip: string) {
  const address = ip.replace(/^::ffff:/, "");
  if (
    address === "::1" ||
    address.startsWith("fe80:") ||
    /^f[cd][0-9a-f]{2}:/i.test(address)
  )
    return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}
