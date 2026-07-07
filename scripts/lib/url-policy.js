function collectStringValues(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStringValues(item));
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => collectStringValues(item));
  }
  return [];
}

function hostnameMatches(hostname, blockedHost) {
  const normalizedHostname = hostname.toLowerCase();
  const normalizedBlockedHost = blockedHost.toLowerCase();
  return normalizedHostname === normalizedBlockedHost || normalizedHostname.endsWith(`.${normalizedBlockedHost}`);
}

function isBlockedRemoteUrl(value, blockedHosts) {
  if (typeof value !== "string") return false;

  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return [...blockedHosts].some((host) => hostnameMatches(url.hostname, host));
}

module.exports = {
  collectStringValues,
  hostnameMatches,
  isBlockedRemoteUrl
};
