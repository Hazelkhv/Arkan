/**
 * Which sites may embed the widget.
 *
 * Matching is on the host and nothing else. A stored entry of "example.com"
 * allows https://example.com and https://www.example.com, and refuses
 * https://example.com.attacker.test — the substring check that would allow
 * that third one is the usual way an allowlist quietly stops being one.
 *
 * An empty list refuses everything. A list nobody has filled in must not mean
 * "anywhere at all", because the setting that gets forgotten is the setting
 * that has to fail closed.
 */
export function isAllowed(origin: string, allowed: string[]): boolean {
  if (allowed.length === 0) return false;

  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }

  return allowed.some((entry) => {
    const wanted = entry
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    if (!wanted) return false;
    return host === wanted || host === `www.${wanted}`;
  });
}
