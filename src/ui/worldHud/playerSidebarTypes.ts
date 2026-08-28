export type SidebarButtonId = "squad" | "map" | "settings";

export type PlayerSidebarActions = {
  onSquad: () => void;
  onMap: () => void;
  onSettings: () => void;
};
