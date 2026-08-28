/**
 * Persistent army tokens on the iso map. Survives redraws so a figure can
 * tween along a path instead of teleporting.
 */
import { livingUnits, type Army } from "../../game/data";
import {
  ARMY_IDLE_FRAME,
  ARMY_WALK_FRAMES,
  armyWalkStripFor,
  defaultIsoDir,
  ensureArmyWalkSheet,
  isoDirFromStep,
  walkFrameAt,
  type IsoDir,
} from "../../game/armyWalk";
import { MAP_ARMY_HEIGHT, armyMapTokenKey } from "../../game/mapTokens";
import type { GridPos } from "../../game/world";
import { ensureCutout } from "../../game/chromaCutout";
import {
  armyMapLabel,
  armyTokenColor,
  createMapTokenImage,
  sizeMapTokenImage,
  type MarkerIso,
} from "./mapMarkers";

export interface ArmyLayerView {
  armies: Army[];
  mapId: string;
  cols: number;
  rows: number;
  visible: boolean[][];
  selectedArmyId: string | null;
  isoCenter: MarkerIso;
}

export interface ArmyMarchOpts {
  armyId: string;
  path: GridPos[];
  isoCenter: MarkerIso;
  stepMs: (to: GridPos) => number;
  onStepBegin?: (to: GridPos, duration: number) => void;
  onStepEnd?: (to: GridPos) => void;
  onComplete: () => void;
}

function armyDepth(x: number, y: number): number {
  return 6 + (x + y) * 0.01 + x * 0.0001;
}

interface ArmyMarker {
  root: Phaser.GameObjects.Container;
  bob: Phaser.GameObjects.Container;
  token?: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Graphics;
  idleCut?: string;
  faction: Army["faction"];
  isNeutral: boolean;
  dir: IsoDir;
}

export class ArmyMapLayer {
  private readonly markers = new Map<string, ArmyMarker>();
  private isoCenter: MarkerIso = () => ({ cx: 0, cy: 0 });
  private marchingId: string | null = null;
  private march: ArmyMarchOpts | null = null;
  private remaining: GridPos[] = [];
  private fromCell: GridPos | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  isMarching(): boolean {
    return this.marchingId !== null;
  }

  hasMarker(armyId: string): boolean {
    return this.markers.has(armyId);
  }

  followTarget(armyId: string): Phaser.GameObjects.Container | undefined {
    return this.markers.get(armyId)?.root;
  }

  sync(view: ArmyLayerView): void {
    this.isoCenter = view.isoCenter;
    const live = view.armies.filter(
      (a) =>
        a.mapId === view.mapId &&
        livingUnits(a).length > 0 &&
        a.y >= 0 &&
        a.x >= 0 &&
        a.y < view.rows &&
        a.x < view.cols &&
        (a.isPlayer || !!view.visible[a.y]?.[a.x] || a.id === this.marchingId),
    );
    const liveIds = new Set(live.map((a) => a.id));

    for (const [id, marker] of this.markers) {
      if (liveIds.has(id)) continue;
      if (id === this.marchingId) continue;
      this.destroyMarker(id, marker);
    }

    for (const army of live) {
      if (army.id === this.marchingId) {
        const marker = this.markers.get(army.id);
        if (marker) this.styleMarker(marker, army, view.selectedArmyId);
        continue;
      }
      this.upsert(army, view.selectedArmyId);
    }
  }

  /** Iso origin changed (resize) — retarget an in-flight march. */
  relayout(isoCenter: MarkerIso): void {
    this.isoCenter = isoCenter;
    if (!this.march || !this.marchingId) return;
    const marker = this.markers.get(this.marchingId);
    if (!marker || !this.fromCell) return;
    this.scene.tweens.killTweensOf(marker.root);
    marker.bob.y = 0;
    const { cx, cy } = isoCenter(this.fromCell.x, this.fromCell.y);
    marker.root.setPosition(cx, cy);
    this.playNextStep();
  }

  marchAlongPath(opts: ArmyMarchOpts): void {
    const waypoints = opts.path.slice(1);
    if (waypoints.length === 0) {
      opts.onComplete();
      return;
    }
    const marker = this.markers.get(opts.armyId);
    if (!marker) {
      opts.onComplete();
      return;
    }
    this.scene.tweens.killTweensOf(marker.root);
    marker.bob.y = 0;

    this.isoCenter = opts.isoCenter;
    this.marchingId = opts.armyId;
    this.march = opts;
    this.remaining = waypoints;
    this.fromCell = opts.path[0] ?? null;
    const start = opts.path[0];
    if (start) {
      const { cx, cy } = opts.isoCenter(start.x, start.y);
      marker.root.setPosition(cx, cy);
    }
    this.playNextStep();
  }

  private playNextStep(): void {
    const opts = this.march;
    const id = this.marchingId;
    if (!opts || !id) return;
    const to = this.remaining[0];
    const marker = this.markers.get(id);
    if (!to || !marker) {
      this.finishMarch();
      return;
    }

    const duration = Math.max(80, opts.stepMs(to));
    const { cx, cy } = this.isoCenter(to.x, to.y);
    const from = this.fromCell;
    if (from) {
      marker.root.setDepth(Math.max(armyDepth(from.x, from.y), armyDepth(to.x, to.y)));
      marker.dir = isoDirFromStep(from, to);
    }
    this.setArmyPose(marker, "walk", 0);
    opts.onStepBegin?.(to, duration);

    this.scene.tweens.add({
      targets: marker.root,
      x: cx,
      y: cy,
      duration,
      ease: "Linear",
      onUpdate: (tween) => {
        this.setArmyPose(marker, "walk", tween.progress);
      },
      onComplete: () => {
        this.remaining.shift();
        this.fromCell = to;
        marker.root.setDepth(armyDepth(to.x, to.y));
        opts.onStepEnd?.(to);
        this.playNextStep();
      },
    });
  }

  private finishMarch(): void {
    const id = this.marchingId;
    const done = this.march?.onComplete;
    if (id) {
      const marker = this.markers.get(id);
      if (marker) this.setArmyPose(marker, "idle", 0);
    }
    this.march = null;
    this.marchingId = null;
    this.remaining = [];
    this.fromCell = null;
    done?.();
  }

  private setArmyPose(marker: ArmyMarker, mode: "idle" | "walk", progress: number): void {
    const token = marker.token;
    if (!token) return;
    const { key, flip } = armyWalkStripFor(
      { faction: marker.faction, isNeutral: marker.isNeutral },
      marker.dir,
    );
    token.setFlipX(flip);

    const sheet = ensureArmyWalkSheet(this.scene, key);
    if (sheet) {
      const frame = String(
        mode === "walk" ? walkFrameAt(progress, ARMY_WALK_FRAMES) : ARMY_IDLE_FRAME,
      );
      if (token.texture.key !== sheet) token.setTexture(sheet, frame);
      else token.setFrame(frame);
      sizeMapTokenImage(token, MAP_ARMY_HEIGHT);
      return;
    }

    if (marker.idleCut) {
      token.setTexture(marker.idleCut);
      sizeMapTokenImage(token, MAP_ARMY_HEIGHT);
    }
  }

  private upsert(army: Army, selectedArmyId: string | null): void {
    const prev = this.markers.get(army.id);
    if (prev) {
      const { cx, cy } = this.isoCenter(army.x, army.y);
      prev.root.setPosition(cx, cy);
      prev.root.setDepth(armyDepth(army.x, army.y));
      prev.faction = army.faction;
      prev.isNeutral = !!army.isNeutral;
      this.styleMarker(prev, army, selectedArmyId);
      this.setArmyPose(prev, "idle", 0);
      return;
    }

    const { cx, cy } = this.isoCenter(army.x, army.y);
    const root = this.scene.add.container(cx, cy).setDepth(armyDepth(army.x, army.y));
    root.setData("armyToken", true);
    const bob = this.scene.add.container(0, 0);
    root.add(bob);

    const tokenKey = armyMapTokenKey(army);
    const token = createMapTokenImage(this.scene, tokenKey, MAP_ARMY_HEIGHT);
    if (token) {
      bob.add(token);
    } else {
      const gfx = this.scene.add.graphics();
      gfx.fillStyle(armyTokenColor(army), 1);
      gfx.fillTriangle(0, -18, -14, 10, 14, 10);
      gfx.fillStyle(0xf5e6c8, 1);
      gfx.fillCircle(0, -22, 5);
      bob.add(gfx);
    }

    const ring = this.scene.add.graphics();
    root.add(ring);

    const label = this.scene.add
      .text(0, 18, armyMapLabel(army), {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#ddd0b0",
        align: "center",
      })
      .setOrigin(0.5, 0);
    label.setData("armyLabel", true);
    root.add(label);

    const marker: ArmyMarker = {
      root,
      bob,
      token,
      label,
      ring,
      idleCut: token ? ensureCutout(this.scene, tokenKey) ?? undefined : undefined,
      faction: army.faction,
      isNeutral: !!army.isNeutral,
      dir: defaultIsoDir(tokenKey),
    };
    this.styleMarker(marker, army, selectedArmyId);
    this.setArmyPose(marker, "idle", 0);
    this.markers.set(army.id, marker);
  }

  private styleMarker(marker: ArmyMarker, army: Army, selectedArmyId: string | null): void {
    marker.label.setText(armyMapLabel(army));
    marker.ring.clear();
    if (army.id === selectedArmyId) {
      marker.ring.lineStyle(2, 0xfff0c0, 1);
      marker.ring.strokeCircle(0, 0, 28);
    }
  }

  private destroyMarker(id: string, marker: ArmyMarker): void {
    this.scene.tweens.killTweensOf(marker.root);
    marker.root.destroy();
    this.markers.delete(id);
  }
}
