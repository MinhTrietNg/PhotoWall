/**
 * Feature flags for capabilities the design specifies but the deployed backend
 * does not yet permit. Each one names the decision it is waiting on.
 */

/**
 * S09's "Gỡ dải ảnh của tôi" (DESIGN-D14). The backend allows the owner
 * `pending|approved -> removed` (final, the strip is deleted) — see removeMyPhoto.
 */
export const GUEST_SELF_REMOVE_ENABLED = true;
