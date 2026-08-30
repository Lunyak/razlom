import type Phaser from "phaser";
import type { BuildingId } from "../../game/catalog";
import type { Army, City } from "../../game/data";

export type RecruitSlot = {
  defId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type BuildSlot = {
  index: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type UpgradeSlot = {
  unitId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type RiteSlot = {
  riteId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type GarrisonSlot = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  unitId: string | null;
  from: "army" | "garrison";
  /** 0–5 when from army formation cell */
  formationSlot?: number;
};

/**
 * Fields tab paint functions need from CityPanel.
 * Not a public API — CityPanel stays the only exported class.
 */
export type CityTabHost = {
  scene: Phaser.Scene;
  cx: number;
  cy: number;
  city: City;
  army: Army | null;
  content: Phaser.GameObjects.Container;
  recruitLayer: Phaser.GameObjects.GameObject[];
  recruitSlots: RecruitSlot[];
  garrisonLayer: Phaser.GameObjects.GameObject[];
  garrisonSlots: GarrisonSlot[];
  buildLayer: Phaser.GameObjects.GameObject[];
  buildSlots: BuildSlot[];
  upgradeLayer: Phaser.GameObjects.GameObject[];
  upgradeSlots: UpgradeSlot[];
  riteLayer: Phaser.GameObjects.GameObject[];
  riteSlots: RiteSlot[];
  lastShownBuildings: BuildingId[];
  selectedFormationUnitId: string | null;
  heroInCity(): boolean;
};

export type CityRecruitCtx = Pick<
  CityTabHost,
  | "scene"
  | "cx"
  | "cy"
  | "city"
  | "army"
  | "content"
  | "recruitLayer"
  | "recruitSlots"
  | "heroInCity"
>;

export type CityGarrisonCtx = Pick<
  CityTabHost,
  | "scene"
  | "cx"
  | "cy"
  | "city"
  | "army"
  | "content"
  | "garrisonLayer"
  | "garrisonSlots"
  | "upgradeLayer"
  | "upgradeSlots"
  | "selectedFormationUnitId"
  | "heroInCity"
>;

export type CityBuildCtx = Pick<
  CityTabHost,
  "scene" | "cx" | "cy" | "city" | "content" | "buildLayer" | "buildSlots" | "lastShownBuildings"
>;

export type CityRiteCtx = Pick<
  CityTabHost,
  "scene" | "cx" | "cy" | "city" | "army" | "content" | "riteLayer" | "riteSlots"
>;
