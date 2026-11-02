// Diffs: loading one for a file, a stash, a commit or every change, drawing it
// as a virtual list, and the diff pane (a tab of its own, opened with
// props { role: "diff", root, on, item }) that keeps itself live.
// diffRow() and the virtual-list layout come from Herdr's shipped `changes`
// mod (Apache-2.0).
import { div } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, v_virtual_list } from "gpui-base";
import { exec, readTextFile, watchFolder, theme, settings, props } from "herdr";
import * as G from "./git.js";

const MAX = 5000;
const clip = (line) => (line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line);

async function untrackedLines(root, on, path) {
  const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
  if (text === null) return ["Cannot preview this file (binary, too large, or unreadable)"];
  if (text.includes("\0")) return ["Binary file · no text diff"];
  const n = G.countLines(text);
  return [`@@ -0,0 +1,${n} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 3000).map((l) => `+${l}`)];
}

// The diff's lines, ready for G.diffRows. `untracked` lists the untracked paths an "all" diff shows too.
export async function loadDiff(item, { root, on, hasHead, untracked = [] }) {
  if (item.untracked) return untrackedLines(root, on, item.path);
  let lines = [];
  for (const args of G.diffArgs(item, hasHead)) {
    const r = await exec("git", [...G.READ, ...args], { cwd: root, on });
    if (r.code !== 0) throw new Error(G.gitError(r));
    lines.push(...r.stdout.replace(/\n$/, "").split("\n").filter((l, i, a) => l || i < a.length - 1));
  }
  if (item.area === "all") {
    for (const path of untracked.slice(0, 50)) lines.push(`diff --git a/${path} b/${path}`, ...(await untrackedLines(root, on, path)));
  }
  if (item.area === "file" && !lines.some((l) => l.startsWith("@@") || l.startsWith("Binary") || /^[-+ ]?Subproject/.test(l)))
    lines = [item.submodule ? `Submodule: ${item.submodule}` : item.binary ? "Binary file changed" : "No text diff available"];
  if (!lines.length) lines = ["No changes"];
  return lines.slice(0, MAX).map(clip);
}

export const diffWidth = (rows) => Math.max(300, ...rows.map((r) => r.text.length * 7 + 50));

function diffRow({ kind, number, text }, t) {
  if (kind === "f") return div().w_full().px(12).h(24).flex_none().flex().items_center().truncate().bg(t.raised).border_t(1).border_color(t.border).font_semibold().text_color(t.foreground).child(text);
  if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
  return h_flex().w_full().h(20).flex_none().gap(10).when(kind === "+", (e) => e.bg(t.ansi2 + "18")).when(kind === "-", (e) => e.bg(t.ansi1 + "18"))
    .child(div().w(34).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
    .child(div().w(10).flex_none().text_color(kind === "+" ? t.ansi2 : kind === "-" ? t.ansi1 : t.dim).child(kind === "+" || kind === "-" ? kind : ""))
    .child(div().flex_1().min_w(0).truncate().child(text));
}

export function diffView(id, rows, width, t) {
  return div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(11).text_color(t.foreground)
    .child(div().id(`${id}-x`).size_full().overflow_x_scrollbar()
      .child(div().w_full().min_w(width).h_full().child(v_virtual_list(id, rows.length, rows.map((r) => (r.kind === "f" ? 24 : 20)), (i) => String(i),
        (range) => rows.slice(range.start, range.end).map((row) => diffRow(row, t))).size_full())))
    .child(Scrollbar.vertical(id).viewport_from_layout().absolute().inset_0());
}

export const itemTitle = (item) => item.area === "all" ? "All changes" : item.area === "stash" ? `${item.ref} · ${item.subject}`
  : item.area === "commit" ? `${item.short} · ${item.subject}` : item.path;

// A diff as a tab of its own, live while files change.
export class DiffPane {
  init(cx) {
    const p = props();
    this.item = p.item; this.root = p.root; this.on = p.on ?? null; this.rows = []; this.width = 300;
    this.reload(cx);
    if (!this.on && this.item.area !== "commit") cx.spawn(async (cx) => {
      try { for (;;) { await watchFolder(this.root); this.reload(cx); } } catch {}
    });
    else if (this.item.area !== "commit") cx.timer.every(10000, (cx) => this.reload(cx));
  }

  reload(cx) {
    if (this.loading) { this.again = true; return; }
    this.loading = true; this.again = false;
    cx.spawn(async (cx) => {
      try {
        const git = (args) => exec("git", [...G.READ, ...args], { cwd: this.root, on: this.on });
        const head = await git(["rev-parse", "--verify", "-q", "HEAD"]);
        let untracked = [];
        if (this.item.area === "all") {
          const r = await git(["ls-files", "--others", "--exclude-standard", "-z"]);
          untracked = r.code === 0 ? r.stdout.split("\0").filter(Boolean) : [];
        }
        this.rows = G.diffRows(await loadDiff(this.item, { root: this.root, on: this.on, hasHead: head.code === 0, untracked }), { headers: this.item.area !== "file" });
        this.width = diffWidth(this.rows); this.error = null;
      } catch (e) { this.error = String(e?.message ?? e); }
      finally { this.loading = false; cx.notify(); if (this.again) this.reload(cx); }
    });
  }

  render() {
    const t = theme();
    return v_flex().id("git-diff-pane").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(12)
      .child(h_flex().h(30).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().font_semibold().child(itemTitle(this.item)))
        .child(div().text_size(11).text_color(t.dim).child(this.loading ? "Loading…" : this.root.split("/").pop())))
      .when(Boolean(this.error), (e) => e.child(div().p(12).text_color(t.ansi1).child(this.error)))
      .child(diffView("git-diff-pane-list", this.rows, this.width, t));
  }
}
