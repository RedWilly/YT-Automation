## 2024-10-24 - SSRF via URL Audio Download
**Vulnerability:** User-supplied URLs for audio download were fetched without validation, allowing access to localhost and private IPs (SSRF).
**Learning:** `fetch` usage on user input requires explicit validation of IP addresses and redirect handling, as it defaults to following redirects and accessing any IP.
**Prevention:** Always validate resolved IPs against private ranges and use a `safeFetch` wrapper that handles DNS resolution and redirects manually.

## 2024-10-24 - Header Leakage on Cross-Origin Redirects
**Vulnerability:** Automatically forwarding all headers (like `Authorization`) during redirects can leak secrets if redirected to a malicious third-party origin.
**Learning:** `fetch` (standard behavior) strips sensitive headers on cross-origin redirects, but manual redirect handling re-introduces this risk if not explicitly handled.
**Prevention:** When handling redirects manually, compare origins and strip sensitive headers (`Authorization`, `Cookie`, etc.) if the origin changes.
