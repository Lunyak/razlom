import Phaser from "phaser";
import { viewSize } from "./viewport";
import {
  buildRaceFrame,
  type RaceFrameId,
} from "./raceFrameConstructor";
import { SCREEN_FRAME_SLICES, addHollowArtFrame } from "./nineSliceFrame";
import { paintFolioChrome } from "./screenFolioFrame";

/**
 * Hollow race chrome around the live viewport.
 *
 * Art plates: four corners only (no rails, no NineSlice stretch).
 * Folio: tiled knotwork rails + ornate corners (manuscript plate).
 * Other races: constructed at live `viewW`×`viewH` (corners-only).
 */
export class ScreenRaceFrame {
  private readonly root: Phaser.GameObjects.Container;
  private race: RaceFrameId;

  constructor(private scene: Phaser.Scene, race: RaceFrameId = "ri") {
    this.race = race;
    this.root = scene.add.container(0, 0).setDepth(70).setScrollFactor(0);
    this.rebuild();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  setRace(race: RaceFrameId): void {
    if (this.race === race) return;
    this.race = race;
    this.rebuild();
  }

  getRace(): RaceFrameId {
    return this.race;
  }

  layout(): void {
    this.rebuild();
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private rebuild(): void {
    if (!this.root.active) return;
    this.root.removeAll(true);
    const { w, h } = viewSize(this.scene);
    this.root.setPosition(0, 0).setScrollFactor(0);

    const folioPanel = this.race === "folioPanel";
    if (this.race === "folio" || folioPanel) {
      if (paintFolioChrome(this.scene, this.root, w, h, folioPanel)) return;
    }

    const plateKey = `screen_frame_${this.race}`;
    const slice = SCREEN_FRAME_SLICES[plateKey];
    if (slice && addHollowArtFrame(this.scene, this.root, plateKey, w, h, slice)) return;

    const rim = Phaser.Math.Clamp(Math.round(Math.min(w, h) * 0.052), 48, 92);
    const built = buildRaceFrame(this.scene, this.race, {
      w,
      h,
      rim,
      hero: true,
      skipAsset: true,
      cornersOnly: this.race !== "folio" && this.race !== "folioPanel",
    });
    built.root.setPosition(w / 2, h / 2);
    this.root.add(built.root);
  }
}
