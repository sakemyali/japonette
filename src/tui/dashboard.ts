// The interactive shell: builds the blessed screen, owns UI state + the refresh
// loop, and projects the pooled data through the content renderers. Kept thin —
// all data-shaping lives in format.ts / render.ts (tested), all fetching in
// store.ts.
import blessed from "neo-blessed";

import { stepCarousel } from "./format.js";
import {
  clusterCount,
  clusterIsEmpty,
  headerContent,
  menuContent,
  peopleContent,
  statusContent,
  type PeopleTab,
  type UIState,
  upcomingContent,
  youContent,
} from "./render.js";
import { type DashboardData, fetchDashboard } from "./store.js";

const REFRESH_MS = 20_000;
const ROTATE_MS = 8_000;
const TABS: PeopleTab[] = ["clusters", "friends", "active"];

export async function runDashboard(campusOpt?: string): Promise<void> {
  const screen = blessed.screen({
    smartCSR: true,
    title: "japonette",
    fullUnicode: true,
    autoPadding: true,
  });

  const box = (opts: Record<string, unknown>) =>
    blessed.box({
      tags: false,
      border: "line",
      style: { border: { fg: "gray" } },
      ...opts,
    });

  const header = blessed.box({ parent: screen, top: 0, left: 0, height: 1, width: "100%" });
  const status = blessed.box({ parent: screen, bottom: 0, left: 0, height: 1, width: "100%" });
  const body = blessed.box({ parent: screen, top: 1, left: 0, width: "100%", height: "100%-2" });

  const people = box({
    parent: body,
    label: " People ",
    top: 0,
    left: 0,
    width: "60%",
    height: "62%",
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
  });
  const menu = box({ parent: body, label: " Menu ", top: "62%", left: 0, width: "60%", height: "38%", mouse: true });
  const you = box({ parent: body, label: " You ", top: 0, left: "60%", width: "40%", height: "55%" });
  const upcoming = box({ parent: body, label: " Upcoming ", top: "55%", left: "60%", width: "40%", height: "45%" });

  const ui: UIState = { tab: "clusters", clusterIdx: 0, locked: false };
  let data: DashboardData | null = null;
  let error: string | null = null;
  let nextRefreshAt = Date.now() + REFRESH_MS;
  let lastRotate = Date.now();

  function draw(): void {
    if (error && !data) {
      header.setContent(`${error}`);
      screen.render();
      return;
    }
    if (!data) {
      header.setContent("loading…");
      screen.render();
      return;
    }
    const secs = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
    header.setContent(headerContent(data, secs) + (error ? `   ${error}` : ""));
    people.setContent(peopleContent(data, ui));
    menu.setContent(menuContent());
    you.setContent(youContent(data));
    upcoming.setContent(upcomingContent(data));
    status.setContent(statusContent(ui));
    screen.render();
  }

  async function refresh(): Promise<void> {
    try {
      data = await fetchDashboard(campusOpt);
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    nextRefreshAt = Date.now() + REFRESH_MS;
    draw();
  }

  function stepCluster(dir: 1 | -1): void {
    if (!data || clusterCount(data) === 0) return;
    ui.clusterIdx = stepCarousel(ui.clusterIdx, clusterCount(data), dir);
    draw();
  }

  function cycleTab(dir: 1 | -1): void {
    const i = TABS.indexOf(ui.tab);
    const next = TABS[((i + dir) % TABS.length + TABS.length) % TABS.length];
    if (next) ui.tab = next;
    draw();
  }

  function quit(): void {
    clearInterval(ticker);
    screen.destroy();
    process.exit(0);
  }

  // Keyboard
  screen.key(["q", "C-c", "escape"], quit);
  screen.key(["tab", "right"], () => cycleTab(1));
  screen.key(["S-tab", "left"], () => cycleTab(-1));
  screen.key(["]", "l"], () => stepCluster(1));
  screen.key(["[", "h"], () => stepCluster(-1));
  screen.key(["S-l"], () => {
    ui.locked = !ui.locked;
    draw();
  });
  screen.key(["r"], () => {
    void refresh();
  });
  // Mouse: clicking the People block advances its tab (richer per-element click
  // targets — tab chips, carousel arrows, name → popup — are the next slice).
  people.on("click", () => cycleTab(1));

  // One-second tick: countdown/clock + cluster auto-rotate (unless locked).
  const ticker = setInterval(() => {
    const now = Date.now();
    if (
      data &&
      !ui.locked &&
      ui.tab === "clusters" &&
      clusterCount(data) > 1 &&
      now - lastRotate >= ROTATE_MS
    ) {
      lastRotate = now;
      ui.clusterIdx = stepCarousel(
        ui.clusterIdx,
        clusterCount(data),
        1,
        (i) => clusterIsEmpty(data as DashboardData, i),
      );
    }
    if (now >= nextRefreshAt) void refresh();
    else draw();
  }, 1000);

  draw(); // initial "loading…"
  await refresh();
}
