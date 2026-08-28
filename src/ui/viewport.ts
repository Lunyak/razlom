import Phaser from "phaser";

export { DESIGN_W, DESIGN_H } from "./chrome";

export function viewW(scene: Phaser.Scene): number {
  return Math.max(1, Math.round(scene.scale.gameSize.width));
}

export function viewH(scene: Phaser.Scene): number {
  return Math.max(1, Math.round(scene.scale.gameSize.height));
}

export function viewSize(scene: Phaser.Scene): { w: number; h: number } {
  return { w: viewW(scene), h: viewH(scene) };
}

export function viewCenter(scene: Phaser.Scene): { x: number; y: number } {
  return { x: viewW(scene) / 2, y: viewH(scene) / 2 };
}

/**
 * Run `fn` now and when the *game* size changes (resolution picker).
 * Window drags in FIT mode only change the CSS letterbox — skipped.
 */
export function onViewResize(scene: Phaser.Scene, fn: () => void): void {
  let lastW = 0;
  let lastH = 0;
  const run = () => {
    const w = viewW(scene);
    const h = viewH(scene);
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    fn();
  };
  scene.scale.on("resize", run);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off("resize", run);
  });
  run();
}
