import { Agent } from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { ECDH, timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors";

const reserved = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0",8], ["10.0.0.0",8], ["100.64.0.0",10], ["127.0.0.0",8], ["169.254.0.0",16],
  ["172.16.0.0",12], ["192.0.0.0",24], ["192.0.2.0",24], ["192.168.0.0",16],
  ["198.18.0.0",15], ["198.51.100.0",24], ["203.0.113.0",24], ["224.0.0.0",4], ["240.0.0.0",4],
] as const) reserved.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList(); globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [["2001::",23], ["2001:db8::",32], ["2002::",16], ["3fff::",20]] as const) reserved.addSubnet(address, prefix, "ipv6");
export function publicPushAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !reserved.check(address, "ipv4")
    : family === 6 && globalV6.check(address, "ipv6") && !reserved.check(address, "ipv6");
}
export function pushEndpoint(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 4096) throw new ApiError(400, "Inscrição inválida");
  let url: URL;
  try { url = new URL(raw); } catch { throw new ApiError(400, "Inscrição inválida"); }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      isIP(host) && !publicPushAddress(host)) throw new ApiError(400, "Endereço de notificação inválido");
  return url;
}
export function validatePushSubscription(value: unknown) {
  if (!value || typeof value !== "object" || !("endpoint" in value) || !("keys" in value)) throw new ApiError(400, "Inscrição inválida");
  pushEndpoint(value.endpoint);
  const keys = value.keys as { p256dh?: unknown; auth?: unknown } | null;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string" ||
      !/^[A-Za-z0-9_-]{87}={0,1}$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(keys.auth)) throw new ApiError(400, "Chaves de notificação inválidas");
  try {
    const key = Buffer.from(keys.p256dh, "base64url");
    if (key.length !== 65 || key[0] !== 4 || Buffer.from(keys.auth, "base64url").length !== 16) throw Error();
    ECDH.convertKey(key, "prime256v1");
  } catch { throw new ApiError(400, "Chaves de notificação inválidas"); }
  return { endpoint: value.endpoint as string, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/** The subscription auth secret proves possession of this browser device, not just its URL. */
export function samePushDevice(stored: { p256dh: string; auth: string }, keys: { p256dh: string; auth: string }) {
  return (["p256dh", "auth"] as const).every(name => {
    const a = Buffer.from(stored[name], "base64url"), b = Buffer.from(keys[name], "base64url");
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/** Check the addresses at connection time and hand the exact checked IP to HTTPS.
 * No second DNS resolution, private/mixed answers, proxy, or automatic redirect. */
export const pushAgent = new Agent({ lookup(hostname, options, callback) {
  lookup(hostname, { all: true, verbatim: true }).then(addresses => {
    if (!addresses.length || addresses.some(item => !publicPushAddress(item.address))) {
      callback(new Error("Push destination is not public"), "", 4); return;
    }
    const family = typeof options === "object" ? options.family : options;
    const matching = family ? addresses.filter(item => item.family === family) : addresses;
    if (!matching.length) { callback(new Error("Push address unavailable"), "", 4); return; }
    if (typeof options === "object" && options.all) callback(null, matching);
    else callback(null, matching[0].address, matching[0].family);
  }, () => callback(new Error("Push DNS unavailable"), "", 4));
} });
