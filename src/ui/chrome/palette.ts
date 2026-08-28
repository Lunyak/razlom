import type { FactionId } from "../../game/catalog";

export const DOSSIER = {
  ink: "#e8dcc8",
  inkMuted: "#9a8a70",
  inkDim: "#6a6050",
  gold: "#c9a227",
  title: "#f5e6c8",
  danger: "#c08080",
  paper: 0x1a1410,
  plate: 0x221a14,
  plateEdge: 0x3a2e22,
  headerRi: 0x3a2018,
  headerOrdo: 0x22241c,
  shadow: 0x0a0806,
} as const;

export const DOSSIER_HEADER: Record<FactionId, number> = {
  ri: DOSSIER.headerRi,
  ordo: DOSSIER.headerOrdo,
  risen: DOSSIER.headerOrdo,
  cossack: 0x2a2410,
  highlander: 0x1c1810,
  neutral: DOSSIER.headerRi,
};

export const DOSSIER_ACCENT: Record<FactionId, number> = {
  ri: 0xc9a227,
  ordo: 0xa8a090,
  risen: 0xa8a090,
  cossack: 0xc9a870,
  highlander: 0xa89070,
  neutral: 0xc9a227,
};

export function dossierHeaderColor(faction: FactionId): number {
  return DOSSIER_HEADER[faction] ?? DOSSIER.headerRi;
}

export function dossierAccent(faction: FactionId): number {
  return DOSSIER_ACCENT[faction] ?? 0xc9a227;
}
