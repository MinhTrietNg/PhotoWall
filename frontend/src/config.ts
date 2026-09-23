/**
 * Feature flags for capabilities the design specifies but the deployed backend
 * does not yet permit. Each one names the decision it is waiting on.
 */

/**
 * "Gỡ dải ảnh này" on the done screen, S07 / S07b. The backend allows the owner
 * `pending|approved -> removed` (final, the strip is deleted) — see removeMyPhoto.
 */
export const GUEST_SELF_REMOVE_ENABLED = true;
