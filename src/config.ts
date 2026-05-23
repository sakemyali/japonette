import { homedir } from "node:os";
import { join } from "node:path";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

export const CONFIG_DIR = join(homedir(), ".config", "42-cli");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");
export const TOKEN_FILE = join(CONFIG_DIR, "token.json");
export const CAMPUSES_FILE = join(CONFIG_DIR, "campuses.json");
export const FRIENDS_FILE = join(CONFIG_DIR, "friends.json");

export interface AppConfig {
  defaultCampusSlug: string;
}

export interface TokenCache {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: number;
}

export interface Friend {
  login: string;
  display_name: string;
  added: string;
}

export interface FriendsFile {
  friends: Friend[];
}

export interface CampusesCache {
  campuses: any[];
  fetched_at: number;
}

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  try {
    chmodSync(CONFIG_DIR, 0o700);
  } catch {
    // best-effort on Windows
  }
}

function writeSecure(path: string, data: string): void {
  ensureDir();
  writeFileSync(path, data, { encoding: "utf8" });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on Windows
  }
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function loadConfig(): AppConfig {
  const data = readJson<Partial<AppConfig>>(CONFIG_FILE);
  return {
    defaultCampusSlug: data?.defaultCampusSlug ?? "",
  };
}

export function saveConfig(cfg: AppConfig): void {
  writeSecure(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

export function loadToken(): TokenCache | null {
  const raw = readJson<Partial<TokenCache>>(TOKEN_FILE);
  if (!raw || !raw.access_token || !raw.refresh_token) return null;
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    token_type: raw.token_type ?? "bearer",
    expires_at: raw.expires_at ?? 0,
  };
}

export function deleteToken(): boolean {
  if (!existsSync(TOKEN_FILE)) return false;
  try {
    unlinkSync(TOKEN_FILE);
    return true;
  } catch {
    return false;
  }
}

export function saveToken(tok: TokenCache): void {
  writeSecure(TOKEN_FILE, JSON.stringify(tok, null, 2));
}

export function loadCampuses(): any[] | null {
  const cached = readJson<CampusesCache>(CAMPUSES_FILE);
  return cached?.campuses ?? null;
}

export function saveCampuses(campuses: any[]): void {
  ensureDir();
  writeFileSync(
    CAMPUSES_FILE,
    JSON.stringify({ campuses, fetched_at: Date.now() }, null, 2),
    "utf8",
  );
}

export function loadFriends(): FriendsFile {
  const data = readJson<FriendsFile>(FRIENDS_FILE);
  return { friends: data?.friends ?? [] };
}

export function saveFriends(f: FriendsFile): void {
  ensureDir();
  writeFileSync(FRIENDS_FILE, JSON.stringify(f, null, 2), "utf8");
}

export function friendsHas(f: FriendsFile, login: string): boolean {
  return f.friends.some((x) => x.login === login);
}

export function friendsAdd(f: FriendsFile, friend: Friend): void {
  if (!friendsHas(f, friend.login)) f.friends.push(friend);
}

export function friendsRemove(f: FriendsFile, login: string): boolean {
  const before = f.friends.length;
  f.friends = f.friends.filter((x) => x.login !== login);
  return f.friends.length !== before;
}
