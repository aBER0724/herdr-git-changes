// Runs the panel and the diff tab under node with a stand-in for Herdr and
// GPUI, against a real throwaway repository: every render path is exercised,
// including virtual-list rows, which `herdr-app check` never draws.
// Run: node tests/ui.test.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url)), modDir = join(here, "../mods/git-changes");
// realpathSync: on macOS the temp folder is a symlink, and git reports the real path.
const base = realpathSync(mkdtempSync(join(tmpdir(), "herdr-git-changes-ui-")));

// --- the stand-in -------------------------------------------------------------

// Copy the mod with its three runtime imports pointed at one stub module.
const lib = join(base, "mod");
mkdirSync(lib);
for (const f of readdirSync(modDir).filter((f) => f.endsWith(".js")))
  writeFileSync(join(lib, f), readFileSync(join(modDir, f), "utf8").replace(/from "(gpui-kit|gpui-base|herdr)"/g, 'from "./_stub.js"'));
writeFileSync(join(lib, "_stub.js"), `
const H = globalThis.__herdr;
// Every element is a node that records its children, text and handlers; any builder call chains.
function el(kind) {
  const node = { kind, kids: [], items: null, handlers: {}, props: {} };
  const proxy = new Proxy(node, { get(t, k) {
    if (Object.prototype.hasOwnProperty.call(t, k)) return t[k];
    if (k === "then") return undefined;
    if (k === "child") return (c) => { t.kids.push(c); return proxy; };
    if (k === "children") return (cs) => { t.kids.push(...cs); return proxy; };
    if (k === "when") return (b, f) => (b ? f(proxy) ?? proxy : proxy);
    return (...a) => {
      if (k === "id") t.id = a[0];
      if (k.startsWith("on_")) t.handlers[k.slice(3) + (typeof a[0] === "string" && a.length > 1 ? ":" + a[0] : "")] = a.at(-1);
      if (k === "hover") a[0](proxy);
      t.props[k] = a;
      return proxy;
    };
  } });
  return proxy;
}
export class View {}
export const div = () => el("div"), svg = (p) => { const e = el("svg"); e.props.path = [p]; return e; };
export const v_flex = () => el("v"), h_flex = () => el("h");
export const PathBuilder = { stroke: () => { const b = { move_to: () => b, line_to: () => b, cubic_bezier_to: () => b, dash_array: () => b, build: () => ({}) }; return b; } };
globalThis.window = { paint_path: () => el("path") };
// A virtual list draws every row at once here, so every row's code runs.
export function v_virtual_list(id, count, _h, key, render) { const e = el("list"); e.id = id; e.items = render({ start: 0, end: count }, H.cx()); e.keys = Array.from({ length: count }, (_, i) => key(i)); return e; }
export const Scrollbar = { vertical: () => el("bar") };
const state = () => ({ v: "", value() { return this.v; }, set_value(v) { this.v = v; }, on() {}, focus() {}, set_auto_grow() {}, set_selected_range() {} });
export const InputState = { new: state }, TextareaState = { new: state };
export const Input = { new: () => el("input") }, Textarea = { new: () => el("textarea") };
export const spaces = () => H.spaces, panes = () => H.panes, focused = () => H.focused, layout = () => ({});
export const theme = () => new Proxy({}, { get: (_t, k) => "#" + String(k).padEnd(6, "0").slice(0, 6) });
export const settings = () => ({ zoom: 1, font_family: "Mono" });
export const props = () => H.props();
export const shared = (k) => H.shared[k];
export const setShared = (k, v) => { H.shared[k] = v; return null; };
export const run = (name, args) => { H.runs.push([name, args]); return null; };
export const notify = (n) => { H.notes.push(n); return ""; };
export const openOverlay = (spec) => { H.overlays.push(spec); return "o1"; };
export const closeOverlay = () => null;
export const exec = (cmd, args, opts) => H.exec(cmd, args, opts);
export const readTextFile = (p) => H.read(p);
export const watchFolder = () => new Promise(() => {});
export const nextCommand = () => new Promise(() => {});
`);

globalThis.localStorage = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = String(v); } };
const env = { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const tasks = [];
const H = globalThis.__herdr = {
  spaces: [], panes: [], focused: null, shared: {}, runs: [], notes: [], overlays: [], currentProps: {},
  props: () => H.currentProps,
  exec: async (cmd, args, { cwd }) => { const r = spawnSync(cmd, args, { cwd, env, encoding: "utf8" }); return { code: r.status, stdout: r.stdout, stderr: r.stderr }; },
  read: async (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } },
  cx: () => cx,
};
const timers = [];
const cx = {
  spawn: (fn) => { const p = Promise.resolve().then(() => fn(cx)); tasks.push(p); return p; },
  timer: { every: (_ms, fn) => { timers.push(fn); }, after: () => {} },
  notify() {}, stop_propagation() {}, write_to_clipboard(t) { H.clipboard = t; }, focus_handle: () => ({ focus() {} }),
};
// Waits until git has answered: every task that can finish has. Folder watches never do, so each
// task gets at most a short while, and settling stops once no new tasks appear.
const settle = async () => {
  for (let i = 0; i < 30; i++) {
    const n = tasks.length;
    await Promise.race([Promise.allSettled(tasks), new Promise((r) => setTimeout(r, 150))]);
    await new Promise((r) => setTimeout(r, 20));
    if (tasks.length === n && i > 1) break;
  }
};

// Walk a rendered tree: every node, for finding ids and text.
const walk = (node, out = []) => {
  if (node && typeof node === "object" && node.kids) { out.push(node); for (const c of node.kids) walk(c, out); for (const r of node.items ?? []) walk(r, out); }
  return out;
};
const texts = (tree) => walk(tree).flatMap((n) => n.kids.filter((c) => typeof c === "string"));
const byId = (tree, id) => walk(tree).find((n) => n.id === id);
const click = (tree, id) => { const n = byId(tree, id); assert.ok(n, `no element #${id}`); n.handlers.click({ click_count: 1 }, cx); };

// --- a repository ---------------------------------------------------------------

const repo = join(base, "repo");
const git = (...a) => execFileSync("git", a, { cwd: repo, env, encoding: "utf8" });
mkdirSync(join(repo, "src/ui"), { recursive: true });
git("init", "-q", "-b", "main");
writeFileSync(join(repo, "src/app.ts"), "a\nb\nc\nd\n"); writeFileSync(join(repo, "src/ui/list.ts"), "x\n"); writeFileSync(join(repo, "README.md"), "r\n");
git("add", "."); git("commit", "-qm", "init");
writeFileSync(join(repo, "src/app.ts"), "a\nB\nd\ne\n"); writeFileSync(join(repo, "src/ui/list.ts"), "x\ny\n"); git("add", "src/ui/list.ts");
mkdirSync(join(repo, "docs")); writeFileSync(join(repo, "docs/usage.md"), "u\n");

H.spaces = [{ id: "sp1", name: "repo", active: true, machine: null, folder: repo, tabs: [{ id: "tb1", name: "1", active: true }] }];
H.panes = [{ pane: "p1", tab: "tb1", terminal: "t1", cwd: repo, focused: true }];
H.focused = { space: "sp1", tab: "tb1", pane: "p1", terminal: "t1", cwd: repo };

const { Panel } = await import(pathToFileURL(join(lib, "panel.js")).href);
const { DiffView } = await import(pathToFileURL(join(lib, "diff.js")).href);

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`ok   ${name}`); }
  catch (e) { console.log(`FAIL ${name}\n     ${String(e.stack ?? e).split("\n").slice(0, 4).join("\n     ")}`); process.exitCode = 1; }
};

const keepAlive = setInterval(() => {}, 1000);
const panel = new Panel();
H.currentProps = {};
try { panel.init(cx); } catch (e) { console.log("init threw", e); }
await settle();

await test("the panel reads the repository and renders the tree", async () => {
  const tree = panel.render(cx);
  const all = texts(tree);
  assert.ok(all.includes("Tracked") && all.includes("Untracked"), "groups");
  assert.ok(all.includes("src"), "the src folder");
  assert.ok(all.includes("ui"), "the ui folder under src");
  assert.ok(all.includes("app.ts") && all.includes("list.ts") && all.includes("usage.md"), "files");
  assert.ok(byId(tree, "folder-tracked:src"), "a folder row with its own id");
});

await test("folding a folder hides what's in it, only in that group", async () => {
  click(panel.render(cx), "folder-tracked:src");
  let all = texts(panel.render(cx));
  assert.ok(!all.includes("app.ts") && !all.includes("list.ts"), "src's files hidden");
  assert.ok(all.includes("usage.md"), "the other group untouched");
  click(panel.render(cx), "folder-tracked:src");
  all = texts(panel.render(cx));
  assert.ok(all.includes("app.ts"), "unfolded again");
});

await test("Flat lists every file with its folder beside it", async () => {
  click(panel.render(cx), "list-flat");
  const tree = panel.render(cx), all = texts(tree);
  assert.equal(panel.listMode, "flat");
  assert.ok(!byId(tree, "folder-tracked:src"), "no folder rows");
  assert.ok(all.includes("src/ui") && all.includes("list.ts"), "folder shown beside the name");
  click(tree, "list-tree");
  assert.equal(panel.listMode, "tree");
});

await test("a folder's checkbox stages everything inside it", async () => {
  byId(panel.render(cx), "stage-dir-tracked:src").handlers.click({}, cx);
  await settle();
  const staged = git("diff", "--cached", "--name-only").trim().split("\n").sort();
  assert.deepEqual(staged, ["src/app.ts", "src/ui/list.ts"]);
  git("reset", "-q", "src/app.ts");
  panel.refresh(cx); await settle();
});

let diff;
await test("clicking a file opens one diff tab in the main area", async () => {
  H.runs = [];
  click(panel.render(cx), "row-src/app.ts");
  const opened = H.runs.find(([n]) => n === "tab.new");
  assert.ok(opened, "tab.new ran");
  assert.equal(opened[1].mod, "git-changes");
  assert.equal(opened[1].props.role, "diff");
  assert.equal(opened[1].name, "app.ts");
  // The tab appears; its copy of the mod starts and claims it.
  H.spaces[0].tabs.push({ id: "tb2", name: "app.ts", active: true }); H.spaces[0].tabs[0].active = false;
  H.panes.push({ pane: "p2", tab: "tb2", terminal: null, mod: "git-changes", focused: true });
  H.focused = { space: "sp1", tab: "tb2", pane: "p2", terminal: null, cwd: null };
  H.currentProps = opened[1].props;
  diff = new DiffView(); diff.init(cx); await settle();
  assert.equal(H.shared["git-changes.view"].sp1.tab, "tb2", "the tab claimed its entry");
});

await test("the diff tab shows the file, one column, with both line numbers", async () => {
  const tree = diff.render(cx), all = texts(tree);
  assert.ok(all.includes("src/app.ts"), "title");
  assert.ok(all.includes("B") && all.includes("b"), "added and removed lines");
  assert.ok(texts(tree).includes("Before") === false, "no column headers in one column");
});

await test("two columns pair removed and added lines, the panel's toggle and the tab's both switch", async () => {
  click(panel.render(cx), "layout-split");
  assert.equal(H.shared["git-changes.layout"], "split");
  const tree = diff.render(cx), all = texts(tree);
  assert.ok(all.includes("Before") && all.includes("After"));
  const list = walk(tree).find((n) => n.kind === "list");
  // b|B is a pair; c has nothing opposite; e is added after d.
  assert.ok(list.items.length >= 5);
  click(tree, "gc-diff-unified");
  assert.equal(H.shared["git-changes.layout"], "unified");
});

await test("the panel keeps its repository while the diff tab has the focus", async () => {
  panel.refresh(cx); await settle();
  assert.equal(panel.root, repo);
  assert.ok(texts(panel.render(cx)).includes("app.ts"));
});

await test("picking another file reuses the tab and renames it", async () => {
  H.runs = [];
  click(panel.render(cx), "row-docs/usage.md");
  assert.ok(!H.runs.some(([n]) => n === "tab.new"), "no second tab");
  assert.deepEqual(H.runs.filter(([n]) => n !== "layout.select").map(([n, a]) => [n, a.id, a.name ?? null]), [["tab.rename", "tb2", "usage.md"], ["tab.select", "tb2", null]]);
  diff.render(cx); // the tab re-renders when shared state changes; that's when it sees the pick
  await settle();
  const all = texts(diff.render(cx));
  assert.ok(all.includes("docs/usage.md"), "retitled");
  assert.ok(all.includes("u"), "the untracked file's text");
});

await test("closing the tab, then picking again, makes a new one", async () => {
  H.spaces[0].tabs = H.spaces[0].tabs.filter((t) => t.id !== "tb2"); H.panes = H.panes.filter((p) => p.tab !== "tb2");
  H.focused = { space: "sp1", tab: "tb1", pane: "p1", terminal: "t1", cwd: repo };
  H.runs = [];
  click(panel.render(cx), "row-src/app.ts");
  assert.ok(H.runs.some(([n]) => n === "tab.new"));
});

await test("History renders the graph and a commit opens in the diff tab", async () => {
  click(panel.render(cx), "tab-history");
  await settle();
  const tree = panel.render(cx);
  assert.ok(texts(tree).includes("init"), "the commit row");
  const list = walk(tree).find((n) => n.kind === "list" && n.id.startsWith("gc-history"));
  H.runs = []; H.shared["git-changes.view"] = {};
  list.handlers.item_click(list.keys[1], cx);
  const opened = H.runs.find(([n]) => n === "tab.new");
  assert.equal(H.shared["git-changes.view"].sp1.item.area, "commit");
  assert.ok(opened && /^[0-9a-f]{7}$/.test(opened[1].name), "named after the short hash");
});

rmSync(base, { recursive: true, force: true });
console.log(`\n${passed} passed${process.exitCode ? ", some failed" : ""}`);
clearInterval(keepAlive);
process.exit(process.exitCode ?? 0);
