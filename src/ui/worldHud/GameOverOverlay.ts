import Phaser from "phaser";
import { getScenario, nextScenarioId } from "../../game/scenario";
import { continueCampaign } from "../../game/session";
import { session } from "../../game/data";
import { viewSize } from "../viewport";

/**
 * Full-screen victory / defeat plate. WorldScene only decides *when* to show it.
 */
export function showGameOverOverlay(
  scene: Phaser.Scene,
  result: "victory" | "defeat",
  overlayGfx: Phaser.GameObjects.Graphics,
): void {
  const { w, h } = viewSize(scene);
  const cx = w / 2;
  const cy = h / 2;
  overlayGfx.clear();
  overlayGfx.fillStyle(0x000000, 0.72);
  overlayGfx.fillRect(0, 0, w, h);

  const title = result === "victory" ? "ПОБЕДА" : "ПОРАЖЕНИЕ";
  const color = result === "victory" ? "#e8d5a3" : "#a05050";
  const nextId =
    result === "victory" ? nextScenarioId(session.state.campaignId, session.state.scenarioId) : null;
  const nextSc = nextId ? getScenario(nextId) : undefined;

  const sub =
    result === "victory"
      ? nextSc
        ? `Сценарий пройден. Далее: ${nextSc.name}`
        : "Часть кампании завершена."
      : "Отряд разбит, городов РИ не осталось.";

  const hint =
    result === "victory"
      ? nextSc
        ? "Клик / Enter — следующий сценарий · M — меню · R — сначала"
        : "Клик / Enter / M — меню · R — сначала"
      : "Клик / Enter / M — меню · R — сначала";

  const goMenu = () => scene.scene.start("Boot");
  const goNext = () => {
    if (result === "victory" && nextSc && continueCampaign()) scene.scene.start("World");
    else goMenu();
  };

  const zone = scene.add.zone(cx, cy, w, h).setInteractive().setScrollFactor(0).setDepth(50);
  zone.on("pointerdown", () => goNext());

  scene.add
    .text(cx, cy - 60, title, { fontFamily: "Georgia, serif", fontSize: "48px", color })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51);
  scene.add
    .text(cx, cy + 10, sub, { fontFamily: "Georgia, serif", fontSize: "20px", color: "#c8b890" })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51);
  scene.add
    .text(cx, cy + 70, hint, { fontFamily: "Georgia, serif", fontSize: "16px", color: "#8a7a5a" })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(51);

  const menuBtn = scene.add
    .text(cx, cy + 140, "[ В меню ]", {
      fontFamily: "Georgia, serif",
      fontSize: "22px",
      color: "#c9a227",
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(52)
    .setInteractive({ useHandCursor: true });
  menuBtn.on("pointerover", () => menuBtn.setColor("#fff0c0"));
  menuBtn.on("pointerout", () => menuBtn.setColor("#c9a227"));
  menuBtn.on(
    "pointerdown",
    (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      goMenu();
    },
  );

  if (result === "victory" && nextSc) {
    const nextBtn = scene.add
      .text(cx, cy + 185, "[ Следующий сценарий ]", {
        fontFamily: "Georgia, serif",
        fontSize: "22px",
        color: "#8fdf8f",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(52)
      .setInteractive({ useHandCursor: true });
    nextBtn.on("pointerover", () => nextBtn.setColor("#c0ffc0"));
    nextBtn.on("pointerout", () => nextBtn.setColor("#8fdf8f"));
    nextBtn.on(
      "pointerdown",
      (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        goNext();
      },
    );
  }
}
