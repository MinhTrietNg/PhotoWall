/**
 * Feature flags for capabilities the design specifies but the deployed backend
 * does not yet permit. Each one names the decision it is waiting on.
 */

/**
 * S09's "Gỡ dải ảnh của tôi" (DESIGN-D14).
 *
 * firestore.rules currently allows a guest exactly one transition on their own
 * photo — `uploading -> pending`. There is no owner-initiated removal, and
 * reject/remove delete the storage object, so a later restore would have nothing
 * to show. Shipping the button would mean shipping a control that always fails.
 *
 * Flip to true only after the backend adds the `approved -> removed` owner
 * transition. See Claude/Claude-Plan.md §20.5 #9 and §31 Q2.
 */
export const GUEST_SELF_REMOVE_ENABLED = false;
