import gsap from "gsap";

// Simple GSAP-driven fade. React owns engine mount/unmount; this module
// only animates the black overlay opacity. Keeping it engine-agnostic so
// Phase 7 polish can extend it to camera zooms without rewiring callers.

export interface TransitionHandle {
  promise: Promise<void>;
  kill: () => void;
}

export function fade(element: HTMLElement, toOpacity: number, durationSec = 0.35): TransitionHandle {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => (resolve = r));

  const tween = gsap.to(element, {
    opacity: toOpacity,
    duration: durationSec,
    ease: "power2.inOut",
    onComplete: resolve
  });

  return { promise, kill: () => tween.kill() };
}
