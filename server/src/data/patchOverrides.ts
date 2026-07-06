/**
 * OPTIONAL hand-curation overlay for Patch Impact — SHIPPED EMPTY, and the
 * feature is complete without it (zero-maintenance by default, per the
 * design spec). Fill in to hide a noise post, pin a landmark patch, or
 * annotate an upcoming feature with a hand-written note.
 */
export interface PatchOverrides {
  /** Update pageids to drop from the list entirely. */
  hidePatches: number[];
  /** Update pageids to float to the top of the list, in this order. */
  pinPatches: number[];
  /** Notes shown on upcoming features, keyed by the feature's section anchor. */
  upcomingNotes: Record<string, string>;
}

export const PATCH_OVERRIDES: PatchOverrides = {
  hidePatches: [],
  pinPatches: [],
  upcomingNotes: {},
};
