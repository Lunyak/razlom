import Phaser from "phaser";

export type FloatingCombatKind = "damage" | "heal" | "miss" | "dot" | "block";

const KIND_STYLE: Record<
  FloatingCombatKind,
  { color: string; stroke: string; size: string; prefix?: string }
> = {
  damage: { color: "#f0c8c0", stroke: "#4a1010", size: "22px", prefix: "−" },
  heal: { color: "#b8e8b0", stroke: "#143018", size: "22px", prefix: "+" },
  miss: { color: "#c8c0b0", stroke: "#2a2418", size: "18px" },
  dot: { color: "#e8a090", stroke: "#3a1010", size: "18px", prefix: "−" },
  block: { color: "#d8c890", stroke: "#2a2010", size: "16px" },
};

export interface FloatingCombatTextOpts {
  /** Extra delay before the float starts (ms). */
  delay?: number;
  depth?: number;
  /** Horizontal jitter so stacked floats don't overlap. */
  jitter?: number;
}

/**
 * Floating combat number / label above a battle portrait.
 * Uses Phaser tweens only.
 */
export function spawnFloatingCombatText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string | number,
  kind: FloatingCombatKind = "damage",
  opts: FloatingCombatTextOpts = {},
): Phaser.GameObjects.Text {
  const style = KIND_STYLE[kind];
  const label =
    kind === "miss" || kind === "block"
      ? String(value)
      : `${style.prefix ?? ""}${value}`;

  const jitter = opts.jitter ?? Phaser.Math.Between(-14, 14);
  const text = scene.add
    .text(x + jitter, y, label, {
      fontFamily: "Georgia, serif",
      fontSize: style.size,
      color: style.color,
      stroke: style.stroke,
      strokeThickness: 4,
    })
    .setOrigin(0.5)
    .setDepth(opts.depth ?? 40)
    .setAlpha(0);

  const start = () => {
    text.setAlpha(1);
    scene.tweens.add({
      targets: text,
      y: y - 64,
      alpha: 0,
      scale: 1.08,
      duration: kind === "miss" || kind === "block" ? 1400 : 1600,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
  };

  if (opts.delay && opts.delay > 0) {
    scene.time.delayedCall(opts.delay, start);
  } else {
    start();
  }

  return text;
}
