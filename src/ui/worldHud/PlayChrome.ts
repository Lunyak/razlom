import Phaser from "phaser";
import { viewSize } from "../viewport";
import { ScreenHitRouter, rectFromCenter, rectFromXY } from "../ScreenHitRouter";
import { MINIMAP_FRAME, hitsMinimap, minimapLayout, worldGutterW } from "./layout";
import { paintMinimap, type MinimapPaintModel } from "./minimapPaint";

export type PlayChromeModel = {
  gold: number;
  mana: number;
  people: number;
  coal: number;
  steel: number;
  lastMessage: string;
  mapTitle: string;
  objective: string;
};

export type MinimapModel = MinimapPaintModel;

/**
 * Map-side chrome: resources, title, objective, toast, minimap.
 * Does not own the left player plate.
 */
export class PlayChrome {
  private goldIcon!: Phaser.GameObjects.Image;
  private goldText!: Phaser.GameObjects.Text;
  private manaIcon!: Phaser.GameObjects.Image;
  private manaText!: Phaser.GameObjects.Text;
  private peopleIcon!: Phaser.GameObjects.Image;
  private peopleText!: Phaser.GameObjects.Text;
  private coalIcon!: Phaser.GameObjects.Image;
  private coalText!: Phaser.GameObjects.Text;
  private steelIcon!: Phaser.GameObjects.Image;
  private steelText!: Phaser.GameObjects.Text;
  private minimapFrame!: Phaser.GameObjects.Image;
  private minimapGfx!: Phaser.GameObjects.Graphics;
  private mapTitle!: Phaser.GameObjects.Text;
  private objective!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {}

  build(): void {
    const serif = { fontFamily: "Georgia, serif", fontSize: "15px", color: "#e8d5a3" } as const;

    this.goldIcon = this.scene.add
      .image(0, 0, "icon_gold")
      .setDisplaySize(24, 24)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(72);
    this.goldText = this.scene.add.text(0, 0, "", serif).setOrigin(0, 0.5).setDepth(72).setScrollFactor(0);

    this.manaIcon = this.scene.add
      .image(0, 0, "icon_mana")
      .setDisplaySize(24, 24)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(72);
    this.manaText = this.scene.add.text(0, 0, "", serif).setOrigin(0, 0.5).setDepth(72).setScrollFactor(0);

    this.peopleIcon = this.scene.add
      .image(0, 0, "icon_people")
      .setDisplaySize(24, 24)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(72);
    this.peopleText = this.scene.add.text(0, 0, "", serif).setOrigin(0, 0.5).setDepth(72).setScrollFactor(0);

    this.coalIcon = this.scene.add
      .image(0, 0, "icon_coal")
      .setDisplaySize(24, 24)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(72);
    this.coalText = this.scene.add.text(0, 0, "", serif).setOrigin(0, 0.5).setDepth(72).setScrollFactor(0);

    this.steelIcon = this.scene.add
      .image(0, 0, "icon_steel")
      .setDisplaySize(24, 24)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(72);
    this.steelText = this.scene.add.text(0, 0, "", serif).setOrigin(0, 0.5).setDepth(72).setScrollFactor(0);

    this.minimapFrame = this.scene.add
      .image(0, 0, "ui_minimap_frame")
      .setDisplaySize(MINIMAP_FRAME, MINIMAP_FRAME)
      .setScrollFactor(0)
      .setDepth(72);
    this.minimapGfx = this.scene.add.graphics().setDepth(73).setScrollFactor(0);

    this.mapTitle = this.scene.add
      .text(0, 6, "", {
        fontFamily: "Georgia, serif",
        fontSize: "16px",
        color: "#e8d5a3",
      })
      .setOrigin(0.5, 0)
      .setDepth(72)
      .setScrollFactor(0);

    this.objective = this.scene.add
      .text(0, 52, "", {
        fontFamily: "Georgia, serif",
        fontSize: "13px",
        color: "#a09070",
        wordWrap: { width: 720 },
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(72)
      .setScrollFactor(0);

    this.msg = this.scene.add
      .text(worldGutterW() + 16, 0, "", {
        fontFamily: "Georgia, serif",
        fontSize: "13px",
        color: "#c8b890",
        wordWrap: { width: 420 },
      })
      .setOrigin(0, 1)
      .setDepth(70)
      .setScrollFactor(0);
  }

  layout(w: number, h: number): void {
    const gutter = worldGutterW(w);
    const playCx = gutter + (w - gutter) / 2;
    this.mapTitle.setPosition(playCx, 6);
    this.objective.setPosition(playCx, 52);
    const mm = minimapLayout(w, h);
    this.objective.setWordWrapWidth(
      Math.max(280, w - gutter - (mm.embedded ? 48 : MINIMAP_FRAME + 48)),
    );
    this.msg.setPosition(gutter + 16, h - 36);

    const resRight = w - 24;
    const col = (i: number) => resRight - 56 - i * 110;
    this.peopleIcon.setPosition(col(0), 12);
    this.peopleText.setPosition(col(0) + 30, 12);
    this.manaIcon.setPosition(col(1), 12);
    this.manaText.setPosition(col(1) + 30, 12);
    this.goldIcon.setPosition(col(2), 12);
    this.goldText.setPosition(col(2) + 30, 12);
    this.steelIcon.setPosition(col(0), 38);
    this.steelText.setPosition(col(0) + 30, 38);
    this.coalIcon.setPosition(col(1), 38);
    this.coalText.setPosition(col(1) + 30, 38);

    this.minimapFrame.setPosition(mm.cx, mm.cy);
    this.minimapFrame.setVisible(!mm.embedded);
  }

  registerHits(hits: ScreenHitRouter, w: number, h: number): void {
    const mm = minimapLayout(w, h);
    hits.add({
      id: "minimap",
      z: 5,
      rect: mm.embedded
        ? rectFromXY(mm.mapX, mm.mapY, mm.mapW, mm.mapH)
        : rectFromCenter(mm.cx, mm.cy, mm.frame, mm.frame),
    });
  }

  hitsMinimap(x: number, y: number): boolean {
    const { w, h } = viewSize(this.scene);
    return hitsMinimap(x, y, w, h);
  }

  refresh(model: PlayChromeModel): void {
    this.goldText.setText(String(model.gold));
    this.manaText.setText(String(model.mana));
    this.peopleText.setText(String(model.people));
    this.coalText.setText(String(model.coal));
    this.steelText.setText(String(model.steel));
    this.mapTitle.setText(model.mapTitle);
    this.objective.setText(model.objective);
    this.msg.setText(model.lastMessage);
  }

  redrawMinimap(model: MinimapModel): void {
    const { w, h } = viewSize(this.scene);
    const mm = minimapLayout(w, h);
    paintMinimap(this.minimapGfx, model, { mapX: mm.mapX, mapY: mm.mapY, mapW: mm.mapW, mapH: mm.mapH }, {
      armyDotRadius: mm.embedded ? 2 : 3,
      chromeStroke: !mm.embedded,
    });
  }

  setVisible(visible: boolean): void {
    const { w, h } = viewSize(this.scene);
    this.goldIcon.setVisible(visible);
    this.goldText.setVisible(visible);
    this.manaIcon.setVisible(visible);
    this.manaText.setVisible(visible);
    this.peopleIcon.setVisible(visible);
    this.peopleText.setVisible(visible);
    this.coalIcon.setVisible(visible);
    this.coalText.setVisible(visible);
    this.steelIcon.setVisible(visible);
    this.steelText.setVisible(visible);
    this.minimapFrame.setVisible(visible && !minimapLayout(w, h).embedded);
    this.minimapGfx.setVisible(visible);
    this.mapTitle.setVisible(visible);
    this.objective.setVisible(visible);
    this.msg.setVisible(visible);
  }
}
