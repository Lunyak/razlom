import { BattleMechanicsTestScene } from "./BattleMechanicsTestScene";

/**
 * Same battle chrome as the mechanics sandbox, without the right test panel.
 * Boot menu or `#test/battle-screen`.
 */
export class BattleLookTestScene extends BattleMechanicsTestScene {
  constructor() {
    super("BattleLookTest", true);
  }
}

export function shouldOpenBattleLookTest(): boolean {
  const hash = (window.location.hash || "").replace(/^#/, "");
  return hash === "test/battle-screen" || hash === "test/battle-look";
}
