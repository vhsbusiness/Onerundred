/** Accept only a local path; URL normalization must not change its authority. */
export function safeLoginRedirect(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return "/";
  return value;
}
