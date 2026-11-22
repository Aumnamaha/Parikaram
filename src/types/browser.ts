export interface Space {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface TabInfo {
  id: string;
  space_id: string;
  title: string;
  url: string;
  pinned: boolean;
  is_active: boolean;
  is_loading: boolean;
}

export interface ViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserSnapshot {
  spaces: Space[];
  active_space_id: string;
  tabs: TabInfo[];
  active_tab_id: string | null;
  split_tab_id: string | null;
  viewport: ViewportBounds;
  overlay_hidden: boolean;
}

export interface AppInfo {
  app_name: string;
  version: string;
  arch: string;
  target_os: string;
  debug: boolean;
  capabilities: Record<string, boolean>;
}
