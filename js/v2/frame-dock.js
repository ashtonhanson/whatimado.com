export { SNAP, EASE_MS, EASE_CURVE } from "./dock/constants.js";
export {
  measureTopLock,
  measureHomeBase,
  measureFrameTopToComposerGap,
  measureFrameBottomToComposerGap,
  measureMobileFrameChrome,
  measureMobileComposerOffset,
  measureMobileAnchors,
  measureAnchors,
  computeSnapZones,
  clampTop,
  resolveSnap,
  resolveMobileSnap,
  mapDimStrength
} from "./dock/anchors.js";
export { FrameDockController } from "./dock/frame-dock-controller.js";
