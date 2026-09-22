/**
 * Experimental 3D Kriegsspiel table inside the battle window hole.
 * Boot menu or `#test/battle-table3d`.
 */
import Phaser from "phaser";
import {
  BattleTable3d,
  holeCssRect,
  type BattleTableToken,
} from "../game/battleStage3d";
import { attachOptionalLoadPump, queueAssetPack } from "../game/assetPacks";
import {
  BATTLE_STAGE_COLOR,
  BATTLE_WINDOW_ASSET,
  BattleWindowFrame,
  battleInnerRect,
} from "../ui/battleHud";
import { onViewResize, viewSize } from "../ui/viewport";

const HUD_ID = "battle-table3d-hud";
const FONT = "Georgia, 'Times New Roman', serif";

const PLAYER: Array<Pick<BattleTableToken, "id" | "kind" | "label" | "model">> = [
  { id: "p0", kind: "hero", label: "Герой", model: "ri_hero" },
  { id: "p1", kind: "infantry", label: "Юнкер" },
  { id: "p2", kind: "rifle", label: "Стрелок" },
  { id: "p3", kind: "clergy", label: "Послушник" },
  { id: "p4", kind: "clergy", label: "Черница" },
  { id: "p5", kind: "rifle", label: "Егерь" },
];

const ENEMY: Array<Pick<BattleTableToken, "id" | "kind" | "label">> = [
  { id: "e0", kind: "hero", label: "Иерофант" },
  { id: "e1", kind: "infantry", label: "Посвящённый" },
  { id: "e2", kind: "undead", label: "Костяк" },
  { id: "e3", kind: "undead", label: "Тень" },
  { id: "e4", kind: "undead", label: "Мертвец" },
  { id: "e5", kind: "undead", label: "Банши" },
];

export class BattleTable3dTestScene extends Phaser.Scene {
  private table?: BattleTable3d;
  private windowFrame?: BattleWindowFrame;
  private hud?: HTMLDivElement;
  private tokens: BattleTableToken[] = [];
  private selectedId: string | null = null;
  private status = "ЛКМ по своей фишке, затем по врагу — удар";
  private readonly onWinResize = () => this.syncRect();

  constructor() {
    super("BattleTable3dTest");
  }

  preload() {
    attachOptionalLoadPump(this);
    queueAssetPack(this, [BATTLE_WINDOW_ASSET]);
  }

  create() {
    this.cameras.main.setBackgroundColor(BATTLE_STAGE_COLOR);
    this.windowFrame = new BattleWindowFrame(this);
    this.tokens = seedTokens();
    this.selectedId = "p0";

    const parent = this.game.canvas.parentElement;
    if (!parent) return;
    this.table = new BattleTable3d(parent);
    this.table.mount();
    this.table.setEvents({
      onPick: (pick) => this.handlePick(pick.kind === "token" ? pick.id : null),
      onHit: (fromId, toId) => this.applyHit(fromId, toId),
    });
    void this.table.loadHero().then(() => {
      if (!this.table) return;
      this.table.setTokens(this.tokens);
      this.table.setSelected(this.selectedId);
    });

    this.mountHud();
    this.syncRect();
    onViewResize(this, () => this.syncRect());
    window.addEventListener("resize", this.onWinResize);
    document.addEventListener("fullscreenchange", this.onWinResize);

    this.input.keyboard?.on("keydown-ESC", () => {
      window.location.hash = "";
      this.scene.start("Boot");
    });
    this.input.keyboard?.on("keydown-R", () => this.resetTable());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.refreshHud();
  }

  update(_time: number, delta: number) {
    this.table?.tick(delta);
  }

  private handlePick(id: string | null): void {
    if (!id) {
      this.selectedId = null;
      this.table?.setSelected(null);
      this.status = "Никто не выбран";
      this.refreshHud();
      return;
    }
    const clicked = this.tokens.find((t) => t.id === id);
    const selected = this.tokens.find((t) => t.id === this.selectedId);
    if (
      selected &&
      selected.side === "player" &&
      selected.hp > 0 &&
      clicked &&
      clicked.side === "enemy" &&
      clicked.hp > 0
    ) {
      if (this.table?.playStrike(selected.id, clicked.id)) {
        this.status = `${selected.label} бьёт ${clicked.label}`;
        this.refreshHud();
      }
      return;
    }
    this.selectedId = id;
    this.table?.setSelected(id);
    const hp = clicked ? `${clicked.hp}/${clicked.maxHp}` : "";
    this.status = clicked ? `${clicked.label}  ·  ${hp}` : "";
    this.refreshHud();
  }

  private applyHit(fromId: string, toId: string): void {
    const target = this.tokens.find((t) => t.id === toId);
    const from = this.tokens.find((t) => t.id === fromId);
    if (!target || !from) return;
    target.hp = Math.max(0, target.hp - 8);
    this.table?.setTokenHp(toId, target.hp);
    this.status =
      target.hp <= 0
        ? `${from.label} сбивает ${target.label}`
        : `${from.label} бьёт ${target.label}  ·  ${target.hp}/${target.maxHp}`;
    this.refreshHud();
  }

  private resetTable(): void {
    this.tokens = seedTokens();
    this.selectedId = "p0";
    this.table?.setTokens(this.tokens);
    this.table?.setSelected(this.selectedId);
    this.status = "Стол сброшен";
    this.refreshHud();
  }

  private syncRect(): void {
    const parent = this.game.canvas.parentElement;
    if (!parent || !this.table) return;
    const { w, h } = viewSize(this);
    this.table.setViewRect(holeCssRect(this.game.canvas, parent, battleInnerRect(w, h), w, h));
    this.layoutHud();
    this.windowFrame?.layout();
  }

  private mountHud(): void {
    document.getElementById(HUD_ID)?.remove();
    const hud = document.createElement("div");
    hud.id = HUD_ID;
    hud.style.position = "absolute";
    hud.style.zIndex = "10";
    hud.style.pointerEvents = "none";
    hud.style.color = "#efe9df";
    hud.style.fontFamily = FONT;
    hud.style.textShadow = "0 1px 2px #000, 0 0 8px #000";
    hud.style.userSelect = "none";
    this.game.canvas.parentElement?.appendChild(hud);
    this.hud = hud;
  }

  private layoutHud(): void {
    const hud = this.hud;
    const canvas = this.game.canvas;
    const parent = canvas.parentElement;
    if (!hud || !parent) return;
    const cr = canvas.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    hud.style.left = `${cr.left - pr.left}px`;
    hud.style.top = `${cr.top - pr.top}px`;
    hud.style.width = `${cr.width}px`;
    hud.style.height = `${cr.height}px`;
  }

  private refreshHud(): void {
    if (!this.hud) return;
    const sel = this.tokens.find((t) => t.id === this.selectedId);
    this.hud.innerHTML = `
      <div style="position:absolute;left:4.5%;top:5.5%;font-size:15px;letter-spacing:0.12em;">
        СТОЛ БОЯ · 1914
      </div>
      <div style="position:absolute;left:4.5%;top:9.2%;font-size:13px;color:#cbb892;">
        ${escapeHtml(sel ? `Выбран: ${sel.label}` : "Фишка не выбрана")}
      </div>
      <div style="position:absolute;left:4.5%;bottom:7.5%;right:4.5%;font-size:13px;color:#d8cfc2;">
        ${escapeHtml(this.status)}
      </div>
      <div style="position:absolute;left:4.5%;bottom:4.2%;font-size:12px;color:#8a847a;">
        ЛКМ — выбор / удар · тянуть — камера · колесо — масштаб · R — сброс · Esc — меню
      </div>
    `;
  }

  private teardown(): void {
    window.removeEventListener("resize", this.onWinResize);
    document.removeEventListener("fullscreenchange", this.onWinResize);
    this.table?.dispose();
    this.table = undefined;
    this.hud?.remove();
    this.hud = undefined;
    this.windowFrame = undefined;
  }
}

export function shouldOpenBattleTable3dTest(): boolean {
  const hash = (window.location.hash || "").replace(/^#/, "");
  return hash === "test/battle-table3d" || hash === "test/battle3d";
}

function seedTokens(): BattleTableToken[] {
  return [
    ...PLAYER.map((u, slot) => ({
      ...u,
      side: "player" as const,
      slot,
      hp: 24,
      maxHp: 24,
    })),
    ...ENEMY.map((u, slot) => ({
      ...u,
      side: "enemy" as const,
      slot,
      hp: 24,
      maxHp: 24,
    })),
  ];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
