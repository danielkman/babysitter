// avatar.js — TalkingHead scene-owned renderer (PoC, SKELETON / no logic yet).
//
// Responsibility (proves gap G1 — render an avatar in-browser):
//   Construct @met4citizen/TalkingHead in "scene-owned" mode: it manages its own
//   Three.js scene/camera/renderer on a WebGL canvas inside the #avatar-stage host.
//   This module exposes a thin control surface (mood/gesture/gaze/view + direct viseme
//   morph writes used by the lipsync runtime) and a renderFrame()/getCanvas() pair so
//   compositor.js can drawImage() the avatar's WebGL canvas onto the single #out canvas.
//
// Avatar asset / licensing (risk X8 — see README):
//   This module MUST NOT load TalkingHead's bundled `brunette.glb` (CC BY-NC). Default
//   behavior (AVATAR_GLB_URL undefined) is to render a license-clean PRIMITIVE placeholder
//   (a simple head-proxy mesh with one mouth-open morph) so the PoC renders something out
//   of the box. To use a real avatar, supply your own / a self-exported Ready Player Me
//   GLB at avatar-poc/assets/avatar.glb and set AVATAR_GLB_URL. No GLB is committed.
//   This is an explicit, documented PoC placeholder — NOT a hidden production fallback.
//
// Implements nothing yet — exported stub only.

/**
 * Create the avatar renderer.
 *
 * @param {Object} [opts]
 * @param {HTMLElement} [opts.stage]          Host element for TalkingHead's WebGL canvas (#avatar-stage).
 * @param {string} [opts.AVATAR_GLB_URL]      Optional user-owned/RPM GLB URL. Undefined => primitive placeholder.
 * @returns {{
 *   setMood: (mood: string) => void,         // neutral|happy|angry|sad|fear|disgust|love|sleep
 *   playGesture: (name: string) => void,     // handup|index|ok|thumbup|thumbdown|side|shrug
 *   lookAt: (x: number, y: number) => void,
 *   lookAtCamera: () => void,
 *   setView: (view: string) => void,         // full|mid|upper|head
 *   setViseme: (morph: string, weight: number) => void, // direct morph write (lipsync runtime)
 *   renderFrame: () => void,                  // render one avatar frame
 *   getCanvas: () => HTMLCanvasElement,       // the avatar's WebGL canvas (for compositor drawImage)
 * }}
 */
export function createAvatar(/* opts */) {
  // TODO(poc): construct TalkingHead in scene-owned mode against opts.stage; load
  //            opts.AVATAR_GLB_URL or build the primitive placeholder; wire the control surface.
  throw new Error('avatar.js: createAvatar() not implemented (PoC skeleton)');
}
