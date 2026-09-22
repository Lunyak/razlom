/**
 * Experimental 3D battle viewport — a 1914 Kriegsspiel sand-table.
 * Phaser keeps HUD / combat; this only draws the tray and tokens.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

export type BattleTableSide = "player" | "enemy";

export type BattleTableKind = "infantry" | "rifle" | "hero" | "clergy" | "undead";

export type BattleTableToken = {
  id: string;
  side: BattleTableSide;
  slot: number;
  kind: BattleTableKind;
  label: string;
  hp: number;
  maxHp: number;
  /** Drop-in glTF miniature (player hero). */
  model?: "ri_hero";
};

export type BattleTablePick =
  | { kind: "token"; id: string }
  | { kind: "empty" };

export type BattleTable3dEvents = {
  onPick?: (pick: BattleTablePick) => void;
  onHit?: (fromId: string, toId: string) => void;
};

const HERO_GLB = "assets/models/ri_hero.glb";
/** Pawn is ~0.9 tall; the glTF is ~1.92m. */
const HERO_SCALE = 0.55;

type TokenView = {
  spec: BattleTableToken;
  group: THREE.Group;
  home: THREE.Vector3;
  body: THREE.Mesh;
  pick: THREE.Mesh;
  mats: THREE.MeshStandardMaterial[];
  mixer?: THREE.AnimationMixer;
  sharedGeo: boolean;
};

type StrikeAnim = {
  fromId: string;
  toId: string;
  t: number;
  hit: boolean;
};

const SLOT_X_FRONT = 1.55;
const SLOT_X_BACK = 2.72;
const SLOT_Z = [-1.55, 0, 1.55] as const;
const TABLE_Y = 0.22;
const BG = 0x0c0c0c;

const RI_KHAKI = 0x5a4e32;
const RI_BRASS = 0xc4a35a;
const ORDO_ASH = 0x6e6a64;
const ORDO_IRON = 0x3a3834;
const CLERGY = 0x1a1816;

export class BattleTable3d {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly root: THREE.Group;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly tokens = new Map<string, TokenView>();
  private selectedId: string | null = null;
  private strike: StrikeAnim | null = null;
  private az = 0.18;
  private el = 0.86;
  private dist = 11.2;
  private readonly look = new THREE.Vector3(0, 0.35, 0);
  private dragging = false;
  private moved = 0;
  private lastX = 0;
  private lastY = 0;
  private events: BattleTable3dEvents = {};
  private disposed = false;
  private heroTemplate: THREE.Group | null = null;
  private heroClips: THREE.AnimationClip[] = [];
  private heroLoad: Promise<void> | null = null;

  constructor(private readonly parent: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.dataset.battleTable3d = "1";
    this.canvas.style.position = "absolute";
    this.canvas.style.zIndex = "2";
    this.canvas.style.display = "block";
    this.canvas.style.touchAction = "none";
    this.canvas.style.outline = "none";

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(BG, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.FogExp2(0x16120c, 0.038);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.buildRoom();
    this.buildTable();
    this.buildLamp();
    this.lights();
    this.bindInput();
    this.orbit();
  }

  setEvents(events: BattleTable3dEvents): void {
    this.events = events;
  }

  /** Load the RI officer miniature once. Safe to call twice. */
  loadHero(): Promise<void> {
    if (this.heroTemplate) return Promise.resolve();
    if (this.heroLoad) return this.heroLoad;
    this.heroLoad = new Promise((resolve) => {
      new GLTFLoader().load(
        HERO_GLB,
        (gltf) => {
          if (this.disposed) {
            resolve();
            return;
          }
          this.heroTemplate = gltf.scene;
          this.heroClips = gltf.animations;
          this.heroTemplate.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          });
          resolve();
        },
        undefined,
        () => resolve(),
      );
    });
    return this.heroLoad;
  }

  mount(): void {
    if (getComputedStyle(this.parent).position === "static") {
      this.parent.style.position = "relative";
    }
    this.parent.appendChild(this.canvas);
  }

  /** CSS box of the battle-window hole, relative to `parent`. */
  setViewRect(rect: { left: number; top: number; width: number; height: number }): void {
    const w = Math.max(8, Math.round(rect.width));
    const h = Math.max(8, Math.round(rect.height));
    this.canvas.style.left = `${Math.round(rect.left)}px`;
    this.canvas.style.top = `${Math.round(rect.top)}px`;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const pr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setTokens(list: BattleTableToken[]): void {
    for (const view of this.tokens.values()) this.dropToken(view);
    this.tokens.clear();
    for (const spec of list) this.spawn(spec);
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    for (const [tid, view] of this.tokens) {
      const on = tid === id;
      const glow = on ? (view.spec.side === "player" ? RI_BRASS : 0x8a8680) : 0x000000;
      for (const mat of view.mats) {
        mat.emissive = new THREE.Color(glow);
        mat.emissiveIntensity = on ? 0.22 : 0;
      }
    }
  }

  setTokenHp(id: string, hp: number): void {
    const view = this.tokens.get(id);
    if (!view) return;
    view.spec.hp = hp;
    if (hp <= 0) this.layDown(view);
  }

  playStrike(fromId: string, toId: string): boolean {
    if (this.strike) return false;
    if (!this.tokens.has(fromId) || !this.tokens.has(toId)) return false;
    this.strike = { fromId, toId, t: 0, hit: false };
    return true;
  }

  tick(dtMs: number): void {
    if (this.disposed) return;
    const dt = Math.min(0.05, dtMs / 1000);
    this.stepStrike(dt);
    const pulse = 0.16 + Math.sin(performance.now() * 0.004) * 0.05;
    if (this.selectedId) {
      const view = this.tokens.get(this.selectedId);
      if (view && view.spec.hp > 0) {
        for (const mat of view.mats) mat.emissiveIntensity = pulse;
      }
    }
    for (const view of this.tokens.values()) view.mixer?.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.remove();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach(disposeMat);
      else if (mat) disposeMat(mat);
    });
    this.renderer.dispose();
  }

  private spawn(spec: BattleTableToken): void {
    const home = slotPos(spec.side, spec.slot);
    const group =
      spec.model === "ri_hero" && this.heroTemplate ? makeHeroFigure(spec, this.heroTemplate, this.heroClips) : makePawn(spec);
    group.position.copy(home);
    const body = group.getObjectByName("body") as THREE.Mesh;
    const pick = group.getObjectByName("pick") as THREE.Mesh;
    const mixer = group.userData.mixer as THREE.AnimationMixer | undefined;
    const mats = collectMats(group);
    const sharedGeo = spec.model === "ri_hero" && !!this.heroTemplate;
    this.root.add(group);
    this.tokens.set(spec.id, {
      spec: { ...spec },
      group,
      home: home.clone(),
      body,
      pick,
      mats,
      mixer,
      sharedGeo,
    });
    if (spec.hp <= 0) this.layDown(this.tokens.get(spec.id)!);
  }

  private dropToken(view: TokenView): void {
    view.mixer?.stopAllAction();
    this.root.remove(view.group);
    view.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!view.sharedGeo && mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach(disposeMat);
      else if (mat) disposeMat(mat);
    });
  }

  private layDown(view: TokenView): void {
    view.group.rotation.x = view.spec.side === "player" ? 1.22 : -1.22;
    view.group.position.y = view.home.y + 0.12;
    for (const mat of view.mats) {
      mat.emissiveIntensity = 0;
      mat.color.multiplyScalar(0.45);
    }
  }

  private stepStrike(dt: number): void {
    const anim = this.strike;
    if (!anim) return;
    const from = this.tokens.get(anim.fromId);
    const to = this.tokens.get(anim.toId);
    if (!from || !to) {
      this.strike = null;
      return;
    }
    anim.t = Math.min(1, anim.t + dt / 0.42);
    const lunge = anim.t < 0.42 ? easeOut(anim.t / 0.42) : anim.t < 0.55 ? 1 : 1 - easeIn((anim.t - 0.55) / 0.45);
    from.group.position.lerpVectors(from.home, toward(from.home, to.home, 0.62), lunge);
    if (!anim.hit && anim.t >= 0.42) {
      anim.hit = true;
      to.group.position.lerpVectors(to.home, toward(to.home, from.home, -0.18), 1);
      this.events.onHit?.(anim.fromId, anim.toId);
    }
    if (anim.t >= 0.62 && to.spec.hp > 0) {
      to.group.position.lerp(to.home, 0.18);
    }
    if (anim.t >= 1) {
      from.group.position.copy(from.home);
      if (to.spec.hp > 0) to.group.position.copy(to.home);
      this.strike = null;
    }
  }

  private bindInput(): void {
    const el = this.canvas;
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      el.setPointerCapture(ev.pointerId);
      this.dragging = true;
      this.moved = 0;
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
    });
    el.addEventListener("pointermove", (ev) => {
      if (!this.dragging) return;
      const dx = ev.clientX - this.lastX;
      const dy = ev.clientY - this.lastY;
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.az -= dx * 0.005;
      this.el = THREE.MathUtils.clamp(this.el + dy * 0.004, 0.38, 1.18);
      this.orbit();
    });
    const end = (ev: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
      if (this.moved < 5) this.pickAt(ev.clientX, ev.clientY);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener(
      "wheel",
      (ev) => {
        ev.preventDefault();
        this.dist = THREE.MathUtils.clamp(this.dist + ev.deltaY * 0.01, 7.2, 16);
        this.orbit();
      },
      { passive: false },
    );
  }

  private pickAt(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = [...this.tokens.values()].map((v) => v.pick);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) {
      this.events.onPick?.({ kind: "empty" });
      return;
    }
    const id = hit.object.userData.tokenId as string;
    this.events.onPick?.({ kind: "token", id });
  }

  private orbit(): void {
    const x = Math.sin(this.az) * Math.cos(this.el) * this.dist;
    const y = Math.sin(this.el) * this.dist;
    const z = Math.cos(this.az) * Math.cos(this.el) * this.dist;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.look);
  }

  private lights(): void {
    const hemi = new THREE.HemisphereLight(0xcbb892, 0x2a241c, 0.55);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xe6d4b0, 1.35);
    key.position.set(-3.2, 8.4, 5.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 24;
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0008;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x7a7670, 0.28);
    fill.position.set(4.5, 3.2, -2.4);
    this.scene.add(fill);
    const lamp = new THREE.PointLight(0xf0dcb0, 22, 18, 2);
    lamp.position.set(-0.2, 3.6, 2.4);
    lamp.castShadow = true;
    this.scene.add(lamp);
  }

  private buildRoom(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x12100c, roughness: 0.95, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.62;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private buildTable(): void {
    const wood = new THREE.MeshStandardMaterial({
      map: woodTexture(),
      color: 0x5a4630,
      roughness: 0.72,
      metalness: 0.04,
    });
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthTexture(),
      color: 0x8a754c,
      roughness: 0.92,
      metalness: 0,
    });
    const rimH = 0.42;
    const innerW = 9.6;
    const innerD = 6.4;
    const rim = 0.38;

    const tray = new THREE.Mesh(new THREE.BoxGeometry(innerW + rim * 2, rimH, innerD + rim * 2), wood);
    tray.position.y = -0.08;
    tray.castShadow = true;
    tray.receiveShadow = true;
    this.root.add(tray);

    const sand = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.28, innerD), earthMat);
    sand.position.y = TABLE_Y;
    sand.receiveShadow = true;
    this.root.add(sand);

    const trench = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.16, innerD * 0.92),
      new THREE.MeshStandardMaterial({ color: 0x4a3e2a, roughness: 0.95, metalness: 0 }),
    );
    trench.position.y = TABLE_Y + 0.02;
    trench.receiveShadow = true;
    this.root.add(trench);

    const lipMat = new THREE.MeshStandardMaterial({ color: 0xb8a46a, roughness: 0.88, metalness: 0 });
    for (const x of [-0.42, 0.42]) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, innerD * 0.9), lipMat);
      lip.position.set(x, TABLE_Y + 0.14, 0);
      this.root.add(lip);
    }

    const markMat = new THREE.MeshStandardMaterial({
      color: 0x3d3424,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
    });
    for (const side of ["player", "enemy"] as const) {
      for (let slot = 0; slot < 6; slot++) {
        const p = slotPos(side, slot);
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 20), markMat);
        disc.position.set(p.x, TABLE_Y + 0.15, p.z);
        this.root.add(disc);
      }
    }

    const spruce = new THREE.MeshStandardMaterial({ color: 0x243022, roughness: 0.9, metalness: 0 });
    for (const [x, z, s] of [
      [-3.6, -2.55, 0.85],
      [-2.4, -2.7, 1.05],
      [3.3, -2.6, 0.9],
      [2.1, 2.65, 0.7],
      [-3.2, 2.55, 0.95],
    ] as const) {
      const tree = new THREE.Mesh(new THREE.ConeGeometry(0.22 * s, 0.85 * s, 7), spruce);
      tree.position.set(x, TABLE_Y + 0.48 * s, z);
      tree.castShadow = true;
      this.root.add(tree);
    }
  }

  private buildLamp(): void {
    const brass = new THREE.MeshStandardMaterial({
      color: RI_BRASS,
      roughness: 0.35,
      metalness: 0.65,
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 1.65, 8), brass);
    pole.position.set(0, 1.05, 3.18);
    this.root.add(pole);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), brass);
    arm.rotation.x = 0.95;
    arm.position.set(0, 1.78, 2.92);
    this.root.add(arm);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.28, 12, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xd8c49a,
        roughness: 0.45,
        metalness: 0.1,
        emissive: new THREE.Color(0xc4a060),
        emissiveIntensity: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    shade.position.set(0, 2.22, 2.55);
    this.root.add(shade);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0xfff1cc,
        emissive: new THREE.Color(0xf0dcb0),
        emissiveIntensity: 1.4,
        roughness: 0.4,
      }),
    );
    bulb.position.set(0, 2.08, 2.55);
    this.root.add(bulb);
  }
}

export function holeCssRect(
  canvas: HTMLCanvasElement,
  parent: HTMLElement,
  inner: { x: number; y: number; w: number; h: number },
  viewW: number,
  viewH: number,
): { left: number; top: number; width: number; height: number } {
  const cr = canvas.getBoundingClientRect();
  const pr = parent.getBoundingClientRect();
  const sx = cr.width / Math.max(1, viewW);
  const sy = cr.height / Math.max(1, viewH);
  return {
    left: cr.left - pr.left + inner.x * sx,
    top: cr.top - pr.top + inner.y * sy,
    width: inner.w * sx,
    height: inner.h * sy,
  };
}

function slotPos(side: BattleTableSide, slot: number): THREE.Vector3 {
  const col = slot < 3 ? 0 : 1;
  const row = slot % 3;
  const xAbs = col === 0 ? SLOT_X_FRONT : SLOT_X_BACK;
  const x = side === "player" ? -xAbs : xAbs;
  return new THREE.Vector3(x, TABLE_Y + 0.16, SLOT_Z[row]);
}

function collectMats(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (mat && "emissive" in mat) out.push(mat as THREE.MeshStandardMaterial);
    }
  });
  return out;
}

function makeHeroFigure(
  spec: BattleTableToken,
  template: THREE.Group,
  clips: THREE.AnimationClip[],
): THREE.Group {
  const g = new THREE.Group();
  const model = cloneSkinned(template);
  model.scale.setScalar(HERO_SCALE);
  // glTF forward is +Z; player sits on -X and should face the trench (+X).
  model.rotation.y = spec.side === "player" ? Math.PI / 2 : -Math.PI / 2;
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.material = Array.isArray(mesh.material)
      ? mats.map((m) => m.clone())
      : mats[0].clone();
  });
  g.add(model);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.3, 0.06, 12),
    new THREE.MeshStandardMaterial({ color: RI_BRASS, roughness: 0.45, metalness: 0.4 }),
  );
  body.name = "body";
  body.position.y = 0.03;
  g.add(body);

  const pick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.2, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  pick.name = "pick";
  pick.position.y = 0.6;
  pick.userData.tokenId = spec.id;
  g.add(pick);

  if (clips.length > 0) {
    const mixer = new THREE.AnimationMixer(model);
    const clip = clips.find((c) => c.name.includes("Idle")) ?? clips[0];
    mixer.clipAction(clip).play();
    g.userData.mixer = mixer;
  }
  return g;
}

function makePawn(spec: BattleTableToken): THREE.Group {
  const g = new THREE.Group();
  const hero = spec.kind === "hero";
  const clergy = spec.kind === "clergy";
  const undead = spec.kind === "undead";
  const rifle = spec.kind === "rifle";
  const h = hero ? 0.92 : clergy ? 0.84 : undead ? 0.7 : rifle ? 0.74 : 0.68;
  const r = hero ? 0.26 : clergy ? 0.2 : undead ? 0.18 : 0.22;
  const bodyColor =
    spec.side === "player" ? (clergy ? CLERGY : RI_KHAKI) : undead ? 0x5c5850 : ORDO_ASH;
  const trim = spec.side === "player" ? RI_BRASS : ORDO_IRON;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.86, r, h, 10),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.82, metalness: spec.side === "enemy" ? 0.18 : 0.06 }),
  );
  body.name = "body";
  body.position.y = h / 2 + 0.04;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(r * (hero ? 0.55 : 0.48), 10, 8),
    new THREE.MeshStandardMaterial({
      color: spec.side === "player" ? 0x6a5a42 : 0x9a9488,
      roughness: 0.7,
      metalness: 0,
    }),
  );
  head.position.y = h + 0.16;
  head.castShadow = true;
  g.add(head);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 1.15, r * 1.2, 0.07, 12),
    new THREE.MeshStandardMaterial({ color: trim, roughness: 0.45, metalness: 0.4 }),
  );
  base.position.y = 0.04;
  g.add(base);

  if (hero) {
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshStandardMaterial({ color: trim, roughness: 0.3, metalness: 0.7 }),
    );
    bead.position.y = h + 0.34;
    g.add(bead);
  }

  const pick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, h + 0.4, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  pick.name = "pick";
  pick.position.y = (h + 0.4) / 2;
  pick.userData.tokenId = spec.id;
  g.add(pick);
  return g;
}

function toward(from: THREE.Vector3, to: THREE.Vector3, t: number): THREE.Vector3 {
  return from.clone().lerp(to, t);
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function easeIn(t: number): number {
  return t * t;
}

function disposeMat(mat: THREE.Material): void {
  const std = mat as THREE.MeshStandardMaterial;
  std.map?.dispose();
  std.roughnessMap?.dispose();
  mat.dispose();
}

function earthTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#6e5c3c";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const n = Math.random();
    ctx.fillStyle = `rgba(${90 + n * 70},${78 + n * 50},${42 + n * 28},${0.12 + n * 0.28})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2.4, 1 + Math.random() * 2.4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.anisotropy = 4;
  return tex;
}

function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#3a2a1c";
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    const wiggle = Math.sin(y * 0.08) * 8;
    ctx.strokeStyle = `rgba(20,14,8,${0.08 + (y % 7) * 0.02})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + wiggle);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}
