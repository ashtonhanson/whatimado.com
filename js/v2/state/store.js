import { hydrateGraph, resetGraph } from "../graph-store.js";
import { createEmptyJourney, normalizeJourney } from "./journey.js";
import { emptyUserProfile, normalizeUserProfile } from "./user-profile.js";
import {
  emptyLocationDraft,
  emptyUserLocation,
  normalizeLocationDraft,
  normalizeUserLocation
} from "./location.js";

/** Live product state. Map geometry stays in graph-store; this holds the journey. */
export const appStore = {
  journey: createEmptyJourney(),
  profile: emptyUserProfile(),
  location: emptyUserLocation(),
  locationDraft: emptyLocationDraft(),
  /** Ephemeral — never persisted */
  pathsGenerating: false
};

export function resetAppStore() {
  appStore.journey = createEmptyJourney();
  appStore.profile = emptyUserProfile();
  appStore.location = emptyUserLocation();
  appStore.locationDraft = emptyLocationDraft();
  appStore.pathsGenerating = false;
  resetGraph();
}

/**
 * @param {{ journey?: unknown, profile?: unknown, graph?: unknown, location?: unknown, locationDraft?: unknown }} snapshot
 */
export function hydrateAppStore(snapshot) {
  appStore.journey = normalizeJourney(snapshot?.journey);
  appStore.profile = normalizeUserProfile(snapshot?.profile);
  appStore.location = normalizeUserLocation(snapshot?.location);
  appStore.locationDraft = normalizeLocationDraft(snapshot?.locationDraft);
  appStore.pathsGenerating = false;
  hydrateGraph(snapshot?.graph);
}

export function touchJourney() {
  if (appStore.journey.id) appStore.journey.updatedAt = Date.now();
}
