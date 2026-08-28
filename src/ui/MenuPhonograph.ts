import Phaser from "phaser";
import { menuDirge } from "../audio/menuDirge";
import { MENU_TRACKS } from "../audio/tracks";
import { viewSize } from "./viewport";

const INK = "#efe9df";
const GHOST = "#7a756c";
const HOVER = "#ffffff";
const STROKE = "#0a0806";
const FONT = "Georgia, 'Times New Roman', serif";

export class MenuPhonograph {
  private readonly root: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly needle: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;
  private readonly playBtn: Phaser.GameObjects.Text;
  private readonly prevBtn: Phaser.GameObjects.Text;
  private readonly nextBtn: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly rows: Phaser.GameObjects.Text[] = [];
  private tick?: Phaser.Time.TimerEvent;

  constructor(private readonly scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(72).setScrollFactor(0);
    this.plate = scene.add.graphics();
    this.needle = scene.add.graphics();
    this.root.add([this.plate, this.needle]);

    this.prevBtn = this.ctl("‹", () => {
      void menuDirge.start().then(() => menuDirge.prevTrack());
    });
    this.playBtn = this.ctl("▶", () => {
      void menuDirge.toggle();
    });
    this.nextBtn = this.ctl("›", () => {
      void menuDirge.start().then(() => menuDirge.nextTrack());
    });

    this.title = scene.add
      .text(0, 0, "", {
        fontFamily: FONT,
        fontSize: "16px",
        color: INK,
      })
      .setOrigin(0, 0.5)
      .setStroke(STROKE, 4)
      .setShadow(0, 1, "#000000", 6, true, true);
    this.sub = scene.add
      .text(0, 0, "", {
        fontFamily: FONT,
        fontSize: "12px",
        color: GHOST,
      })
      .setOrigin(0, 0.5)
      .setStroke(STROKE, 3);
    this.hint = scene.add
      .text(0, 0, "граммофон  ·  ▶ чтобы слушать", {
        fontFamily: FONT,
        fontSize: "11px",
        color: GHOST,
      })
      .setOrigin(0.5, 1)
      .setStroke(STROKE, 3);

    this.root.add([this.prevBtn, this.playBtn, this.nextBtn, this.title, this.sub, this.hint]);

    for (const track of MENU_TRACKS) {
      const row = scene.add
        .text(0, 0, track.title, {
          fontFamily: FONT,
          fontSize: "13px",
          color: GHOST,
        })
        .setOrigin(0, 0.5)
        .setStroke(STROKE, 3)
        .setInteractive({ useHandCursor: true });
      row.on("pointerover", () => row.setColor(HOVER));
      row.on("pointerout", () => this.paintRows());
      row.on("pointerdown", () => {
        void menuDirge.start().then(() => {
          menuDirge.setTrack(track.id);
          if (menuDirge.getState().paused) menuDirge.resume();
        });
      });
      this.rows.push(row);
      this.root.add(row);
    }

    menuDirge.onChange = () => this.refresh();
    this.tick = scene.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => this.paintNeedle(),
    });

    scene.input.keyboard?.on("keydown-P", () => {
      if (menuDirge.getState().running) void menuDirge.toggle();
    });
    scene.input.keyboard?.on("keydown-OPEN_BRACKET", () => menuDirge.prevTrack());
    scene.input.keyboard?.on("keydown-CLOSED_BRACKET", () => menuDirge.nextTrack());

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.keyboard?.off("keydown-P");
      scene.input.keyboard?.off("keydown-OPEN_BRACKET");
      scene.input.keyboard?.off("keydown-CLOSED_BRACKET");
      this.tick?.remove(false);
      menuDirge.onChange = null;
      menuDirge.fadeOut(1.8);
    });

    this.refresh();
    this.layout();
  }

  layout(): void {
    const { w, h } = viewSize(this.scene);
    const s = Math.min(w, h);
    const pw = Phaser.Math.Clamp(w * 0.42, 340, 560);
    const ph = Phaser.Math.Clamp(h * 0.22, 148, 210);
    const x = (w - pw) / 2;
    const y = h - ph - Math.max(28, h * 0.03);
    this.root.setPosition(x, y);

    this.drawPlate(pw, ph);

    const pad = 18;
    const btnY = 28;
    this.prevBtn.setPosition(pad + 8, btnY).setFontSize(Math.round(s * 0.028));
    this.playBtn.setPosition(pad + 40, btnY).setFontSize(Math.round(s * 0.026));
    this.nextBtn.setPosition(pad + 72, btnY).setFontSize(Math.round(s * 0.028));

    this.title.setPosition(pad + 104, btnY - 7).setFontSize(Phaser.Math.Clamp(s * 0.018, 13, 17));
    this.sub.setPosition(pad + 104, btnY + 12).setFontSize(Phaser.Math.Clamp(s * 0.013, 10, 12));
    this.title.setWordWrapWidth(pw - pad - 120, true);

    const listTop = 58;
    const rowH = (ph - listTop - 28) / Math.max(1, this.rows.length);
    this.rows.forEach((row, i) => {
      row.setPosition(pad + 8, listTop + rowH * i + rowH * 0.35);
      row.setFontSize(Phaser.Math.Clamp(s * 0.015, 12, 14));
    });

    this.hint.setPosition(pw / 2, ph - 8).setFontSize(Phaser.Math.Clamp(s * 0.012, 10, 12));
    this.paintNeedle();
    this.paintRows();
  }

  private ctl(label: string, onClick: () => void): Phaser.GameObjects.Text {
    const btn = this.scene.add
      .text(0, 0, label, {
        fontFamily: FONT,
        fontSize: "20px",
        color: INK,
      })
      .setOrigin(0.5)
      .setStroke(STROKE, 4)
      .setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => btn.setColor(HOVER));
    btn.on("pointerout", () => btn.setColor(INK));
    btn.on("pointerdown", onClick);
    return btn;
  }

  private refresh(): void {
    const st = menuDirge.getState();
    this.title.setText(st.track.title);
    this.sub.setText(st.track.subtitle);
    this.playBtn.setText(st.running && !st.paused ? "❚❚" : "▶");
    this.hint.setText(st.running && !st.paused ? "граммофон  ·  P пауза  [ ] смена" : "граммофон  ·  ▶ чтобы слушать");
    this.paintRows();
    this.paintNeedle();
  }

  private paintRows(): void {
    const id = menuDirge.getState().track.id;
    this.rows.forEach((row, i) => {
      const on = MENU_TRACKS[i].id === id;
      row.setColor(on ? INK : GHOST);
      row.setText(on ? `—  ${MENU_TRACKS[i].title}` : MENU_TRACKS[i].title);
    });
  }

  private paintNeedle(): void {
    const { w } = viewSize(this.scene);
    const pw = Phaser.Math.Clamp(w * 0.42, 340, 560);
    const st = menuDirge.getState();
    const t = st.running ? st.progress : 0;
    const x0 = 18;
    const x1 = pw - 18;
    const y = 48;
    this.needle.clear();
    this.needle.lineStyle(1, 0x3a3530, 0.9);
    this.needle.lineBetween(x0, y, x1, y);
    this.needle.lineStyle(1, 0xc8c2b6, 0.55);
    this.needle.lineBetween(x0, y, x0 + (x1 - x0) * t, y);
    this.needle.fillStyle(0xefe9df, 0.85);
    this.needle.fillCircle(x0 + (x1 - x0) * t, y, 2.2);
  }

  private drawPlate(pw: number, ph: number): void {
    const g = this.plate;
    g.clear();
    g.fillStyle(0x0c0a08, 0.88);
    g.fillRoundedRect(0, 0, pw, ph, 2);
    g.lineStyle(1.25, 0xd4cfc4, 0.55);
    g.strokeRoundedRect(0.5, 0.5, pw - 1, ph - 1, 2);
    g.lineStyle(1, 0x6a6560, 0.35);
    g.strokeRoundedRect(5.5, 5.5, pw - 11, ph - 11, 1);

    g.lineStyle(1, 0x9a9488, 0.4);
    const tick = 7;
    g.lineBetween(4, 4, 4 + tick, 4);
    g.lineBetween(4, 4, 4, 4 + tick);
    g.lineBetween(pw - 4, 4, pw - 4 - tick, 4);
    g.lineBetween(pw - 4, 4, pw - 4, 4 + tick);
    g.lineBetween(4, ph - 4, 4 + tick, ph - 4);
    g.lineBetween(4, ph - 4, 4, ph - 4 - tick);
    g.lineBetween(pw - 4, ph - 4, pw - 4 - tick, ph - 4);
    g.lineBetween(pw - 4, ph - 4, pw - 4, ph - 4 - tick);
  }
}
