import ipaddr from "ipaddr.js";

export type HostResolver = (hostname: string) => Promise<string[]>;

export class InvalidPricingUrlError extends Error {
  constructor(
    readonly code:
      | "invalid_url"
      | "https_required"
      | "credentials_not_allowed"
      | "port_not_allowed"
      | "local_hostname"
      | "non_public_address"
      | "dns_resolution_failed",
  ) {
    super(code);
    this.name = "InvalidPricingUrlError";
  }
}

const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan"];

function stripIpv6Brackets(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

export function isPublicIp(value: string): boolean {
  const candidate = stripIpv6Brackets(value);
  if (!ipaddr.isValid(candidate)) return false;
  return ipaddr.process(candidate).range() === "unicast";
}

function isIp(value: string): boolean {
  return ipaddr.isValid(stripIpv6Brackets(value));
}

export async function normalizePricingUrl(
  input: string,
  resolveHost: HostResolver,
): Promise<{ canonicalUrl: string; normalizedDomain: string }> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new InvalidPricingUrlError("invalid_url");
  }

  if (url.protocol !== "https:") throw new InvalidPricingUrlError("https_required");
  if (url.username || url.password) throw new InvalidPricingUrlError("credentials_not_allowed");
  if (url.port && url.port !== "443") throw new InvalidPricingUrlError("port_not_allowed");

  let hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname.startsWith("www.")) hostname = hostname.slice(4);
  const bareHostname = stripIpv6Brackets(hostname);

  if (
    bareHostname === "localhost" ||
    LOCAL_SUFFIXES.some((suffix) => bareHostname.endsWith(suffix))
  ) {
    throw new InvalidPricingUrlError("local_hostname");
  }

  if (isIp(bareHostname)) {
    if (!isPublicIp(bareHostname)) throw new InvalidPricingUrlError("non_public_address");
  } else {
    let addresses: string[];
    try {
      addresses = await resolveHost(bareHostname);
    } catch {
      throw new InvalidPricingUrlError("dns_resolution_failed");
    }
    if (addresses.length === 0) throw new InvalidPricingUrlError("dns_resolution_failed");
    if (addresses.some((address) => !isPublicIp(address))) {
      throw new InvalidPricingUrlError("non_public_address");
    }
  }

  url.hostname = hostname;
  url.hash = "";
  return { canonicalUrl: url.toString(), normalizedDomain: bareHostname };
}
