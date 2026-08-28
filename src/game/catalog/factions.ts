/** Faction ids and display labels. Keep this file free of other catalogs to avoid cycles. */

export type FactionId = "ri" | "ordo" | "risen" | "neutral" | "cossack" | "highlander";

/** Display names for UI */
export const FACTION_LABEL: Record<FactionId, string> = {
  ri: "Российская Империя",
  ordo: "Ordo Lumen",
  risen: "Восставшие",
  neutral: "Нейтралы",
  cossack: "Казачество",
  highlander: "Горцы",
};

export const PLAYABLE_FACTIONS: FactionId[] = ["ri", "ordo", "risen", "cossack", "highlander"];
