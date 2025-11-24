// Utility to build social profile URLs consistently across the app
// Supported networks: instagram, tiktok, snapchat, x (twitter), linkedin (personal), facebook (personal new format), youtube

function cleanUsername(v = '') {
  let s = String(v || '').trim();
  // strip leading @ if present
  if (s.startsWith('@')) s = s.slice(1);
  return s;
}

export function buildSocialProfileUrl(type, username) {
  const t = String(type || '').toLowerCase();
  const u = cleanUsername(username);
  if (!t || !u) return '';
  switch (t) {
    case 'instagram':
      // Keep trailing slash as existing convention in screens
      return `https://www.instagram.com/${encodeURIComponent(u)}/`;
    case 'tiktok':
      return `https://www.tiktok.com/@${encodeURIComponent(u)}`;
    case 'snapchat':
      return `https://www.snapchat.com/add/${encodeURIComponent(u)}`;
    case 'x':
    case 'twitter': // alias just in case
      return `https://x.com/${encodeURIComponent(u)}`;
    case 'linkedin': // personal profile
      return `https://www.linkedin.com/in/${encodeURIComponent(u)}`;
    case 'facebook': // personal profile, new format
      return `https://www.facebook.com/${encodeURIComponent(u)}`;
    case 'youtube':
      // Prefer handle URLs. If a channel ID is used, user should paste it as handle and it will still build a usable URL.
      // Supports both @handle and plain handle, we always prefix with @ for consistency.
      return `https://www.youtube.com/@${encodeURIComponent(u)}`;
    default:
      return '';
  }
}

export default buildSocialProfileUrl;
