/* config.js — app-wide settings set once by the app owner.
 *
 * googleClientId: a Google OAuth "Web application" Client ID whose
 * Authorized JavaScript origins include this site's address. When set,
 * every user can tap "Connect Gmail + Calendar" with no setup of their own
 * (Google still asks each person to allow access). A Client ID is public
 * by design — it is not a secret. Leave it '' to let each device paste its
 * own in Settings → Ask your pet. */
window.ROOTLING_CONFIG = {
  googleClientId: ''
};
