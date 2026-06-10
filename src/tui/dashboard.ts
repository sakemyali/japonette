// The interactive shell: builds the blessed screen with real clickable widgets
// (tabs, carousel arrows, lock, menu items, a clickable people list), owns UI
// state + the refresh loop, and projects the data through the renderers. All
// data-shaping lives in format.ts / render.ts (tested); fetching in store.ts.
//
// Refresh cadence is deliberately split to stay under the 42 API's 2 req/s + the
// hourly quota: STATIC data (profile/evals/logtime) is fetched once and only on
// manual refresh; only OCCUPANCY (who's online) is re-fetched on the timer.
import blessed from "neo-blessed";
import kleur from "kleur";

import { apiGet } from "../client.js";
import { findClusterForHost, renderCluster, styleEmpty, styleOccupied } from "../cluster-map.js";
import { loadCampuses } from "../config.js";
import { userCardLines } from "../render.js";
import { stepCarousel } from "./format.js";
import type { RosterEntry } from "./format.js";
import {
  clusterCount,
  clusterIndex,
  clusterIsEmpty,
  headerContent,
  logtimePopup,
  peopleView,
  personPopup,
  type PeopleTab,
  statusContent,
  type UIState,
  upcomingContent,
  youContent,
} from "./render.js";
import {
  type DashboardData,
  fetchOccupancy,
  fetchStatic,
  type Occupancy,
  type StaticData,
} from "./store.js";

const REFRESH_MS = 120_000; // occupancy refresh — every 2 min
const STATIC_REFRESH_MS = 600_000; // 10 min — profile/evals/logtime
const ROTATE_MS = 8_000;
const SPINNER = ["◐", "◓", "◑", "◒"];
const TABS: PeopleTab[] = ["clusters", "friends", "active"];

interface MenuItem {
  label: string;
  run: () => void;
}

export async function runDashboard(campusOpt?: string): Promise<void> {
  const screen = blessed.screen({
    smartCSR: true,
    title: "japonette",
    fullUnicode: true,
    autoPadding: true,
  });
  try {
    screen.enableMouse();
  } catch {
    /* clickable elements still enable mouse on their own */
  }

  const ui: UIState = { tab: "clusters", clusterIdx: 0, locked: false };
  let staticData: StaticData | null = null;
  let occ: Occupancy | null = null;
  let error: string | null = null;
  let nextRefreshAt = Date.now() + REFRESH_MS;
  let lastStaticAt = 0;
  let lastRotate = Date.now();
  let people: RosterEntry[] = [];
  let popup: any = null;
  let phase = "starting up";
  let busy = false;
  let spin = 0;
  let currentCampus = campusOpt; // switchable from the campus launcher

  const compose = (): DashboardData | null =>
    staticData
      ? {
          ...staticData,
          active: occ?.active ?? [],
          byHost: occ?.byHost ?? new Map(),
          fetchedAt: Date.now(),
        }
      : null;

  const frame = (opts: Record<string, unknown>) =>
    blessed.box({ tags: false, border: "line", style: { border: { fg: "gray" } }, ...opts });
  const clickable = (opts: Record<string, unknown>) =>
    blessed.box({ tags: false, clickable: true, mouse: true, height: 1, ...opts });

  const header = blessed.box({ parent: screen, top: 0, left: 0, height: 1, width: "100%" });
  const status = blessed.box({ parent: screen, bottom: 0, left: 0, height: 1, width: "100%" });
  const body = blessed.box({ parent: screen, top: 1, left: 0, width: "100%", height: "100%-2" });

  // People block ----------------------------------------------------------
  const peopleBox = frame({ parent: body, label: " People ", top: 0, left: 0, width: "60%", height: "62%" });
  const tabEls: Record<PeopleTab, any> = {
    clusters: clickable({ parent: peopleBox, top: 0, left: 0, width: 11 }),
    friends: clickable({ parent: peopleBox, top: 0, left: 11, width: 9 }),
    active: clickable({ parent: peopleBox, top: 0, left: 20, width: 8 }),
  };
  const prevBtn = clickable({ parent: peopleBox, top: 1, left: 0, width: 3, content: " < " });
  const lockBtn = clickable({ parent: peopleBox, top: 1, left: 3, width: 3 });
  const nextBtn = clickable({ parent: peopleBox, top: 1, left: 6, width: 3, content: " > " });
  const subhead = blessed.box({ parent: peopleBox, top: 1, left: 10, right: 0, height: 1, tags: false });
  const list = blessed.list({
    parent: peopleBox,
    top: 2,
    left: 0,
    right: 0,
    bottom: 0,
    tags: false,
    mouse: true,
    keys: true,
    interactive: true,
    style: { selected: { bg: "cyan", fg: "black" } },
    items: [],
  });

  // Menu block ------------------------------------------------------------
  const menuBox = frame({ parent: body, label: " Menu ", top: "62%", left: 0, width: "60%", bottom: 0 });
  const menuItems: MenuItem[] = [
    { label: "search", run: () => showSearch() },
    { label: "maps", run: () => showMaps() },
    { label: "logtime", run: () => showLogtime() },
    { label: "campus", run: () => showCampus() },
    { label: "me", run: () => openPopup(meCard()) },
    { label: "help", run: () => openPopup(helpText()) },
    { label: "quit", run: quit },
  ];
  menuItems.forEach((it, i) => {
    const row = Math.floor(i / 3);
    const col = i % 3;
    clickable({ parent: menuBox, top: row, left: col * 13, width: 13, content: it.label }).on(
      "click",
      it.run,
    );
  });

  // Right column ----------------------------------------------------------
  const you = frame({ parent: body, label: " You ", top: 0, left: "60%", width: "40%", height: "55%" });
  const upcoming = frame({ parent: body, label: " Upcoming ", top: "55%", left: "60%", width: "40%", bottom: 0 });

  const loadingBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 54,
    height: 7,
    align: "center",
    valign: "middle",
    tags: false,
    border: "line",
    style: { border: { fg: "cyan" } },
  });

  // ---- helpers ----------------------------------------------------------
  function meCard(): string {
    const me = staticData?.me;
    if (!me) return "not loaded";
    return [
      `login   ${me.login}`,
      `name    ${me.displayname ?? "-"}`,
      `campus  ${staticData?.campus.slug ?? "-"}`,
      "",
      "esc / click to close",
    ].join("\n");
  }
  function helpText(): string {
    return [
      "keys",
      "  tab / arrows   switch People tab",
      "  [ ]            step clusters",
      "  l              lock/unlock carousel",
      "  r              refresh now",
      "  q              quit  (esc closes popups)",
      "",
      "click tabs, < > arrows, names, menu items",
      "",
      "esc / click to close",
    ].join("\n");
  }

  function openPopup(content: string): void {
    closePopup();
    popup = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: "60%",
      height: "70%",
      border: "line",
      style: { border: { fg: "cyan" } },
      tags: false,
      scrollable: true,
      mouse: true,
      clickable: true,
      content,
    });
    popup.on("click", closePopup);
    popup.focus();
    screen.render();
  }
  function closePopup(): void {
    if (popup) {
      popup.destroy();
      popup = null;
      screen.grabKeys = false; // restore global hotkeys (input popups grab them)
      list.focus();
      screen.render();
    }
  }

  // A selectable list popup (campus switcher). Grabs keys so global hotkeys
  // (q/r/…) don't fire while navigating.
  function openListPopup(title: string, items: string[], onSelect: (i: number) => void): void {
    closePopup();
    screen.grabKeys = true;
    popup = blessed.list({
      parent: screen,
      label: ` ${title} `,
      top: "center",
      left: "center",
      width: "50%",
      height: "60%",
      border: "line",
      style: { border: { fg: "cyan" }, selected: { bg: "cyan", fg: "black" } },
      tags: false,
      mouse: true,
      keys: true,
      interactive: true,
      items,
    });
    popup.on("select", (_i: unknown, idx: number) => {
      closePopup();
      onSelect(idx);
    });
    popup.key(["escape", "q"], closePopup);
    popup.focus();
    screen.render();
  }

  // A single-line text input popup (search). Grabs keys so typing doesn't
  // trigger global hotkeys.
  function openInputPopup(label: string, onSubmit: (value: string) => void): void {
    closePopup();
    popup = blessed.textbox({
      parent: screen,
      label: ` ${label} `,
      top: "center",
      left: "center",
      width: "50%",
      height: 3,
      border: "line",
      style: { border: { fg: "cyan" } },
    });
    // A single readInput() = one key listener. Combining inputOnFocus + manual
    // focus + grabKeys (as before) attaches the listener twice → every char
    // doubles. readInput also handles Enter (value) and Esc (null) itself.
    popup.readInput((_err: unknown, value: string | null) => {
      closePopup();
      const v = String(value ?? "").trim();
      if (v) onSubmit(v);
    });
    screen.render();
  }

  function showMaps(): void {
    const data = compose();
    if (!data || data.clusters.length === 0) {
      openPopup("no cluster maps for this campus");
      return;
    }
    const cur = data.clusters[clusterIndex(data, ui)]!;
    const mapLines = renderCluster(cur.file, data.byHost);
    const seated = cur.file.hosts.filter((h) => data.byHost.has(h)).length;

    closePopup();
    // Size the box to the map (+ a slim right legend), clamped to the terminal —
    // not the whole screen. Strip ANSI to measure the true visual width.
    const ansi = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
    const strip = (s: string) => s.replace(ansi, "");
    const mapW = Math.max(1, ...mapLines.map((l) => strip(l).length));
    const legendW = 14;
    const w = Math.min(mapW + legendW + 4, (screen.width as number) - 2);
    const h = Math.min(mapLines.length + 2, (screen.height as number) - 2);
    popup = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: w,
      height: h,
      border: "line",
      style: { border: { fg: "cyan" } },
      label: ` ${cur.file.name} (${cur.code}) `,
      clickable: true,
      mouse: true,
      tags: false,
    });
    const mapPane = blessed.box({
      parent: popup,
      top: 0,
      bottom: 0,
      left: 0,
      right: legendW,
      scrollable: true,
      alwaysScroll: true,
      clickable: true,
      mouse: true,
      tags: false,
      content: mapLines.join("\n"),
    });
    const legendPane = blessed.box({
      parent: popup,
      top: 0,
      bottom: 0,
      right: 0,
      width: legendW,
      clickable: true,
      mouse: true,
      tags: false,
      content: [
        "",
        `${styleOccupied()} occupied`,
        "",
        `${styleEmpty()} empty`,
        "",
        kleur.dim(`${seated}/${cur.file.hosts.length} seats`),
        "",
        "",
        kleur.dim("esc/q/click"),
        kleur.dim("to close"),
      ].join("\n"),
    });
    // Close on a click anywhere (matches the person popup); esc/q handled
    // globally now that we no longer grab keys.
    for (const el of [popup, mapPane, legendPane]) el.on("click", closePopup);
    screen.render();
  }

  function showLogtime(): void {
    if (!staticData) return;
    openPopup(logtimePopup(staticData.locationsStats));
  }

  function showCampus(): void {
    const slugs = (loadCampuses() ?? [])
      .map((c: any) => String(c.name ?? "").toLowerCase().replace(/\s+/g, "-"))
      .filter(Boolean)
      .sort();
    if (slugs.length === 0) {
      openPopup("no campuses cached — run `japonette campus list` once");
      return;
    }
    openListPopup("switch campus", slugs, (i) => {
      const slug = slugs[i];
      if (!slug) return;
      currentCampus = slug;
      staticData = null;
      occ = null;
      ui.clusterIdx = 0;
      draw();
      void fullRefresh();
    });
  }

  function showSearch(): void {
    openInputPopup("search login (enter)", (login) => {
      if (!login) return;
      void (async () => {
        try {
          const u = await apiGet<any>(`/v2/users/${encodeURIComponent(login)}`);
          openPopup([...userCardLines(u), "", kleur.dim("esc / click to close")].join("\n"));
        } catch {
          openPopup(`user not found: ${login}`);
        }
      })();
    });
  }

  function clusterMapFor(host: string): string[] | null {
    if (!staticData || !occ) return null;
    const found = findClusterForHost(staticData.campus.slug, host);
    if (!found) return null;
    return renderCluster(found.file, occ.byHost, host);
  }

  function renderLoading(): void {
    const f = SPINNER[spin % SPINNER.length];
    const text = error
      ? kleur.red(error)
      : `${kleur.cyan(phase)}…\n${kleur.dim("the 42 API is paginated + rate-limited — a few seconds")}`;
    loadingBox.setContent(`\n${f}  ${kleur.bold("loading dashboard")}\n\n${text}`);
  }

  function draw(): void {
    if (!staticData) {
      loadingBox.hidden = false;
      renderLoading();
      screen.render();
      return;
    }
    loadingBox.hidden = true;
    const data = compose()!;
    const secs = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
    header.setContent(
      headerContent(data, secs, occ !== null) + (error ? `   ${kleur.red(error)}` : ""),
    );

    const labels: Record<PeopleTab, string> = {
      clusters: "Clusters",
      friends: "Friends",
      active: "Active",
    };
    for (const t of TABS) {
      const on = ui.tab === t;
      tabEls[t].style.bg = on ? "cyan" : undefined;
      tabEls[t].style.fg = on ? "black" : "white";
      tabEls[t].setContent(` ${labels[t]} `);
    }
    const showCarousel = ui.tab === "clusters" && clusterCount(data) > 0;
    for (const el of [prevBtn, nextBtn, lockBtn]) el.hidden = !showCarousel;
    lockBtn.setContent(ui.locked ? "[L]" : "[ ]");

    if (occ === null) {
      subhead.setContent(kleur.dim("…"));
      list.setItems([kleur.dim("  loading who's online…")]);
      people = [];
    } else {
      const view = peopleView(data, ui);
      people = view.people;
      subhead.setContent(view.subhead);
      list.setItems(view.items);
    }

    you.setContent(youContent(data));
    upcoming.setContent(upcomingContent(data));
    status.setContent(statusContent(ui));
    screen.render();
  }

  async function loadStatic(): Promise<void> {
    busy = true;
    try {
      staticData = await fetchStatic(currentCampus, (p) => (phase = p));
      error = null;
      lastStaticAt = Date.now();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    busy = false;
    draw();
  }

  async function loadOccupancy(): Promise<void> {
    if (!staticData) return;
    busy = true;
    try {
      occ = await fetchOccupancy(staticData.campus, (p) => (phase = p));
      error = null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    busy = false;
    nextRefreshAt = Date.now() + REFRESH_MS;
    draw();
  }

  async function fullRefresh(): Promise<void> {
    await loadStatic();
    await loadOccupancy();
  }

  function stepCluster(dir: 1 | -1): void {
    if (popup) return;
    const data = compose();
    if (!data || clusterCount(data) === 0) return;
    ui.clusterIdx = stepCarousel(clusterIndex(data, ui), clusterCount(data), dir);
    lastRotate = Date.now();
    draw();
  }

  function toggleLock(): void {
    if (popup) return;
    ui.locked = !ui.locked;
    draw();
  }

  function setTab(tab: PeopleTab): void {
    ui.tab = tab;
    draw();
  }
  function cycleTab(dir: 1 | -1): void {
    if (popup) return;
    const i = TABS.indexOf(ui.tab);
    const next = TABS[(((i + dir) % TABS.length) + TABS.length) % TABS.length];
    if (next) setTab(next);
  }

  function quit(): void {
    clearInterval(ticker);
    clearInterval(spinner);
    screen.destroy();
    process.exit(0);
  }

  // ---- wiring -----------------------------------------------------------
  for (const t of TABS) tabEls[t].on("click", () => setTab(t));
  prevBtn.on("click", () => stepCluster(-1));
  nextBtn.on("click", () => stepCluster(1));
  lockBtn.on("click", toggleLock);
  list.on("select", (_item: unknown, index: number) => {
    const entry = people[index];
    if (entry) openPopup(personPopup(entry, clusterMapFor));
  });

  // q / esc / C-c. While a (display) popup is open, q and esc close it instead
  // of quitting; C-c always quits.
  screen.key(["C-c"], quit);
  screen.key(["q"], () => (popup ? closePopup() : quit()));
  screen.key(["escape"], () => {
    if (popup) closePopup();
  });
  screen.key(["tab", "right"], () => cycleTab(1));
  screen.key(["S-tab", "left"], () => cycleTab(-1));
  screen.key(["]"], () => stepCluster(1));
  screen.key(["["], () => stepCluster(-1));
  screen.key(["l"], toggleLock);
  screen.key(["r"], () => {
    if (!popup) void fullRefresh();
  });

  // Fast tick: animate the loading spinner, or a subtle "<phase>…" in the header
  // during any background fetch. Idle otherwise.
  const spinner = setInterval(() => {
    spin++;
    if (!staticData) {
      renderLoading();
      screen.render();
    } else if (busy) {
      const secs = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
      header.setContent(
        `${headerContent(compose()!, secs, occ !== null)}   ${SPINNER[spin % SPINNER.length]} ${kleur.dim(`${phase}…`)}`,
      );
      screen.render();
    }
  }, 110);

  // One-second tick: countdown/clock, cluster auto-rotate, and the gentle
  // refresh schedule (occupancy every REFRESH_MS; static every STATIC_REFRESH_MS).
  const ticker = setInterval(() => {
    const now = Date.now();
    const data = compose();
    if (
      data &&
      occ &&
      !ui.locked &&
      ui.tab === "clusters" &&
      clusterCount(data) > 1 &&
      now - lastRotate >= ROTATE_MS
    ) {
      lastRotate = now;
      ui.clusterIdx = stepCarousel(clusterIndex(data, ui), clusterCount(data), 1, (i) =>
        clusterIsEmpty(data, i),
      );
    }
    if (busy || !staticData) {
      draw();
    } else if (now - lastStaticAt >= STATIC_REFRESH_MS) {
      void loadStatic();
    } else if (now >= nextRefreshAt) {
      void loadOccupancy();
    } else {
      draw();
    }
  }, 1000);

  list.focus();
  draw(); // loading overlay
  await loadStatic();
  await loadOccupancy();
}
