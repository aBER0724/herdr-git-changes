// Tests the mod's git logic against real throwaway repositories (with a bare
// "remote"): parsing, what every button and menu item runs, and the history
// graph. Nothing here needs Herdr. Run: node tests/git.test.mjs
import * as G from "../mods/git-changes/git.js";
import { layoutLanes } from "../mods/git-changes/lanes.js";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const env = { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const base = mkdtempSync(join(tmpdir(), "herdr-git-changes-"));
const run = (cwd, args) => {
  const r = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
};
const runAll = (cwd, cmds) => { for (const c of cmds) run(cwd, c); };
const write = (cwd, file, text) => writeFileSync(join(cwd, file), text);
const append = (cwd, file, text) => appendFileSync(join(cwd, file), text);
const status = (cwd) => G.parseStatus(run(cwd, [...G.READ, ...G.STATUS]));
const entry = (cwd, path) => status(cwd).entries.find((e) => e.path === path);
const repo = (name, { remote } = {}) => {
  const dir = join(base, name);
  execFileSync("git", ["init", "-q", "-b", "main", dir], { env });
  if (remote) {
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", join(base, `${name}.git`)], { env });
    run(dir, ["remote", "add", "origin", join(base, `${name}.git`)]);
  }
  return dir;
};
const commit = (cwd, msg, file = `${msg}.txt`) => { write(cwd, file, msg); run(cwd, ["add", "."]); run(cwd, ["commit", "-qm", msg]); };

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`ok   ${name}`); }
  catch (e) { console.log(`FAIL ${name}\n     ${e.message.split("\n").join("\n     ")}`); process.exitCode = 1; }
};

// --- parsing -----------------------------------------------------------------

test("status: staged all / some / none, untracked, branch", () => {
  const r = repo("status");
  write(r, "a", "a\n"); write(r, "b", "b\n"); run(r, ["add", "."]); run(r, ["commit", "-qm", "init"]);
  append(r, "a", "a2\n"); append(r, "b", "b2\n"); run(r, ["add", "b"]); append(r, "b", "b3\n");
  write(r, "c", "c\n"); run(r, ["add", "c"]); write(r, "with space.txt", "n\n");
  const s = status(r);
  assert.equal(s.branch.head, "main");
  assert.ok(s.branch.oid);
  const by = Object.fromEntries(s.entries.map((e) => [e.path, e]));
  assert.equal(by.a.staged, "none"); assert.equal(by.a.status, "M");
  assert.equal(by.b.staged, "some");
  assert.equal(by.c.staged, "all"); assert.equal(by.c.status, "A");
  assert.equal(by["with space.txt"].untracked, true);
});

test("status: unborn branch and detached HEAD", () => {
  const r = repo("unborn");
  assert.equal(status(r).branch.oid, null);
  commit(r, "one"); commit(r, "two");
  run(r, ["switch", "-q", "--detach", "HEAD~1"]);
  const b = status(r).branch;
  assert.equal(b.detached, true); assert.equal(b.head, null);
});

test("status: merge conflict", () => {
  const r = repo("conflict");
  commit(r, "base", "f");
  run(r, ["switch", "-qc", "other"]); write(r, "f", "theirs\n"); run(r, ["commit", "-qam", "theirs"]);
  run(r, ["switch", "-q", "main"]); write(r, "f", "ours\n"); run(r, ["commit", "-qam", "ours"]);
  spawnSync("git", ["merge", "other"], { cwd: r, env });
  const e = entry(r, "f");
  assert.equal(e.conflict, true); assert.equal(e.status, "U");
  assert.equal(G.commitMode(status(r).entries), "conflict");
  assert.match(G.commitArgs({ message: "x", mode: "conflict" }).error, /conflict/i);
  runAll(r, G.toggleArgs(e, true));
  assert.equal(entry(r, "f").conflict, undefined);
});

test("numstat adds staged and unstaged counts", () => {
  const stats = G.parseNumstat("1\t0\ta\0", "2\t3\ta\0-\t-\tbin\0");
  assert.deepEqual(stats.a, { add: 3, del: 3, binary: false });
  assert.equal(stats.bin.binary, true);
});

test("diffRows numbers lines and keeps file headers when asked", () => {
  const lines = ["diff --git a/x b/x", "index 1..2", "--- a/x", "+++ b/x", "@@ -3,2 +3,3 @@", " keep", "-old", "+new", "+more"];
  const rows = G.diffRows(lines);
  assert.equal(rows[0].kind, "@");
  assert.deepEqual(rows.slice(1).map((r) => [r.kind, r.number]), [[" ", 3], ["-", 4], ["+", 4], ["+", 5]]);
  assert.equal(G.diffRows(lines, { headers: true })[0].kind, "f");
});

test("suggested message for one file", () => {
  assert.equal(G.suggestMessage([{ path: "src/y.ts", status: "M" }]), "Update y.ts");
  assert.equal(G.suggestMessage([{ path: "n.md", status: "A" }]), "Create n.md");
  assert.equal(G.suggestMessage([{ path: "a", status: "M" }, { path: "b", status: "M" }]), "");
});

// --- buttons -------------------------------------------------------------------

test("checkbox stages and unstages a file, before and after the first commit", () => {
  const r = repo("toggle");
  write(r, "f", "1\n");
  runAll(r, G.toggleArgs(entry(r, "f"), false));
  assert.equal(entry(r, "f").staged, "all");
  runAll(r, G.toggleArgs(entry(r, "f"), false));
  assert.equal(entry(r, "f").untracked, true);
  run(r, ["add", "f"]); run(r, ["commit", "-qm", "one"]);
  append(r, "f", "2\n");
  runAll(r, G.toggleArgs(entry(r, "f"), true));
  assert.equal(entry(r, "f").staged, "all");
  runAll(r, G.toggleArgs(entry(r, "f"), true));
  assert.equal(entry(r, "f").staged, "none");
});

test("Commit commits what's staged; Commit Tracked is commit -a", () => {
  const r = repo("commit");
  commit(r, "init", "a"); commit(r, "init2", "b");
  append(r, "a", "x\n"); append(r, "b", "y\n"); run(r, ["add", "a"]); write(r, "new", "n\n");
  assert.equal(G.commitMode(status(r).entries), "staged");
  runAll(r, G.commitArgs({ message: "staged only", mode: "staged" }).cmds);
  assert.deepEqual(status(r).entries.map((e) => e.path).sort(), ["b", "new"]);
  assert.equal(G.commitMode(status(r).entries), "tracked");
  runAll(r, G.commitArgs({ message: "tracked", mode: "tracked", signoff: true }).cmds);
  assert.deepEqual(status(r).entries.map((e) => e.path), ["new"]);
  assert.match(run(r, ["log", "-1", "--format=%B"]), /Signed-off-by: T <t@t>/);
  assert.equal(G.commitMode(status(r).entries), "none");
  assert.ok(G.commitArgs({ message: "x", mode: "none" }).error);
  assert.ok(G.commitArgs({ message: " ", mode: "staged" }).error);
});

test("Amend with no message keeps the last one", () => {
  const r = repo("amend");
  commit(r, "first message");
  append(r, "first message.txt", "more\n"); run(r, ["add", "."]);
  runAll(r, G.commitArgs({ message: "", amend: true, mode: "staged" }).cmds);
  assert.equal(run(r, ["log", "--format=%s"]).trim(), "first message");
  assert.equal(status(r).entries.length, 0);
});

test("Discard returns a file to HEAD; a new or untracked file is removed", () => {
  const r = repo("discard");
  commit(r, "init", "a");
  append(r, "a", "x\n"); run(r, ["add", "a"]); append(r, "a", "y\n");
  write(r, "staged-new", "s\n"); run(r, ["add", "staged-new"]); write(r, "untracked", "u\n");
  for (const e of status(r).entries) runAll(r, G.discardArgs(e, true));
  assert.equal(status(r).entries.length, 0);
  assert.equal(existsSync(join(r, "staged-new")), false);
  assert.equal(existsSync(join(r, "untracked")), false);
});

test("Stash all (untracked too), stash staged only, apply, pop, drop", () => {
  const r = repo("stash");
  commit(r, "init", "a"); commit(r, "init2", "b");
  append(r, "a", "x\n"); write(r, "new", "n\n");
  runAll(r, G.stashPushArgs("wip"));
  assert.equal(status(r).entries.length, 0);
  let list = G.parseStashes(run(r, G.STASHES));
  assert.equal(list[0].subject, "wip");
  const rows = G.diffRows(run(r, G.diffArgs({ ...list[0], area: "stash" }, true)[0]).split("\n"), { headers: true });
  assert.ok(rows.some((x) => x.kind === "f" && x.text === "new"), "the stash diff shows the untracked file");
  runAll(r, G.stashArgs("apply", list[0].ref));
  assert.equal(status(r).entries.length, 2);
  assert.equal(G.parseStashes(run(r, G.STASHES)).length, 1);
  runAll(r, G.discardTrackedArgs(true)); runAll(r, G.trashUntrackedArgs());
  runAll(r, G.stashArgs("pop", "stash@{0}"));
  assert.equal(G.parseStashes(run(r, G.STASHES)).length, 0);
  run(r, ["add", "a"]); append(r, "b", "y\n");
  runAll(r, G.stashPushArgs("", { staged: true }));
  assert.deepEqual(status(r).entries.map((e) => e.path).sort(), ["b", "new"]);
  runAll(r, G.stashArgs("drop", "stash@{0}"));
  assert.equal(G.parseStashes(run(r, G.STASHES)).length, 0);
});

test("Uncommit keeps the changes staged, also for the root commit", () => {
  const r = repo("uncommit");
  commit(r, "one"); commit(r, "two");
  runAll(r, G.uncommitArgs(true));
  assert.equal(run(r, ["log", "--format=%s"]).trim(), "one");
  assert.equal(entry(r, "two.txt").staged, "all");
  runAll(r, G.uncommitArgs(false));
  assert.equal(status(r).branch.oid, null);
  assert.equal(entry(r, "one.txt").staged, "all");
});

test("Remote button: Publish, Push ↑N, Pull ↓N, else Fetch", () => {
  const r = repo("remote", { remote: true });
  commit(r, "one");
  assert.equal(G.remoteAction(status(r).branch, [], true), null);
  assert.equal(G.remoteAction(status(r).branch, ["origin"], true).label, "Publish");
  const p = G.pushArgs(status(r).branch, ["origin"]);
  assert.equal(p.remote, "origin");
  runAll(r, p.cmds);
  assert.equal(status(r).branch.upstream, "origin/main");
  assert.equal(G.remoteAction(status(r).branch, ["origin"], true).label, "Fetch");
  commit(r, "two");
  assert.equal(G.remoteAction(status(r).branch, ["origin"], true).count, "↑1");
  runAll(r, G.pushArgs(status(r).branch, ["origin"]).cmds);
  // Another clone pushes; this one falls behind.
  const other = join(base, "remote-other");
  execFileSync("git", ["clone", "-q", join(base, "remote.git"), other], { env });
  commit(other, "three"); run(other, ["push", "-q"]);
  runAll(r, G.fetchArgs());
  const behind = G.remoteAction(status(r).branch, ["origin"], true);
  assert.equal(behind.type, "pull"); assert.equal(behind.count, "↓1");
  runAll(r, G.pullArgs(status(r).branch).cmds);
  assert.equal(status(r).branch.behind, 0);
  assert.ok(G.pushArgs({ detached: true }, ["origin"]).error);
  assert.ok(G.pullArgs({ upstream: null }).error);
});

test("Force push with lease replaces an amended pushed commit", () => {
  const r = repo("force", { remote: true });
  commit(r, "one"); runAll(r, G.pushArgs(status(r).branch, ["origin"]).cmds);
  runAll(r, G.commitArgs({ message: "one, amended", amend: true, mode: "none" }).cmds);
  assert.throws(() => runAll(r, G.pushArgs(status(r).branch, ["origin"]).cmds));
  runAll(r, G.pushArgs(status(r).branch, ["origin"], { force: true }).cmds);
  assert.equal(status(r).branch.ahead, 0);
});

test("Checkout a branch, a remote branch (tracking) and a commit", () => {
  const r = repo("checkout", { remote: true });
  commit(r, "one"); run(r, ["branch", "feat"]);
  run(r, ["push", "-q", "origin", "main", "feat:remote-only"]); run(r, ["fetch", "-q"]);
  runAll(r, G.checkoutArgs("feat"));
  assert.equal(status(r).branch.head, "feat");
  runAll(r, G.checkoutRemoteArgs("origin/remote-only"));
  assert.equal(status(r).branch.upstream, "origin/remote-only");
  runAll(r, G.detachArgs(run(r, ["rev-parse", "HEAD"]).trim()));
  assert.equal(status(r).branch.detached, true);
});

// --- history -------------------------------------------------------------------

test("History: lanes for a merge and an open branch, labels, the dashed row", () => {
  const r = repo("history", { remote: true });
  commit(r, "a"); commit(r, "b");
  run(r, ["switch", "-qc", "feat"]); commit(r, "f1");
  run(r, ["switch", "-q", "main"]); commit(r, "c");
  run(r, ["merge", "-q", "--no-ff", "--no-edit", "feat"]); run(r, ["tag", "v1"]);
  run(r, ["switch", "-qc", "side", "HEAD~1"]); commit(r, "side");
  run(r, ["switch", "-q", "main"]);
  runAll(r, G.pushArgs(status(r).branch, ["origin"]).cmds);
  run(r, ["push", "-q", "origin", "side:only-remote"]); run(r, ["fetch", "-q"]);
  append(r, "a.txt", "dirty\n");
  const head = run(r, ["rev-parse", "HEAD"]).trim();
  const log = G.parseLog(run(r, G.historyArgs({ all: true, limit: 50 })));
  const commits = G.withUncommitted(log, 1, head);
  const { rows, width } = layoutLanes(commits);
  assert.equal(commits[0].uncommitted, true);
  assert.equal(rows[0].segments.at(-1)[5], true, "uncommitted joins HEAD dashed");
  assert.ok(width >= 2, `a merge needs more than one lane, got ${width}`);
  const merge = log.find((c) => c.parents.length === 2);
  assert.ok(merge.head);
  const labels = G.labelsOf(merge).map((l) => `${l.kind}:${l.text}`);
  assert.equal(labels[0], "branch:main", "the checked-out branch comes first");
  assert.ok(labels.includes("tag:v1"));
  assert.ok(G.labelsOf(merge)[0].synced, "main carries origin/main");
  const remoteOnly = log.find((c) => c.refs.some((x) => x.name === "origin/only-remote"));
  assert.ok(G.labelsOf(remoteOnly).some((l) => l.text === "origin/only-remote"));
  assert.equal(G.labelsOf(remoteOnly, () => false).some((l) => l.kind === "remote"), false);
});

test("History without remotes keeps the upstream and drops other remote lanes", () => {
  const r = join(base, "history");
  // A remote branch that forks off with commits no local branch reaches: its own lane when remotes show.
  run(r, ["switch", "-qc", "tmp", "HEAD~2"]); commit(r, "remote work");
  run(r, ["push", "-q", "origin", "tmp:far-away"]); run(r, ["fetch", "-q"]);
  run(r, ["switch", "-q", "main"]); run(r, ["branch", "-D", "tmp"]);
  const all = G.parseLog(run(r, G.historyArgs({ all: true, remotes: true, limit: 50 })));
  const own = G.parseLog(run(r, G.historyArgs({ all: true, remotes: false, upstream: "origin/main", limit: 50 })));
  assert.ok(all.some((c) => c.subject === "remote work"));
  assert.equal(own.some((c) => c.subject === "remote work"), false, "a remote-only commit is left out");
  assert.ok(layoutLanes(own).width < layoutLanes(all).width, `fewer lanes without remotes (${layoutLanes(own).width} vs ${layoutLanes(all).width})`);
  assert.ok(own.some((c) => c.refs.some((x) => x.name === "origin/main")), "the upstream still shows");
  // A remote ref on a commit a local branch reaches gets no label of its own.
  const side = own.find((c) => c.refs.some((x) => x.name === "origin/only-remote"));
  assert.equal(G.labelsOf(side, (n) => n === "origin/main").some((l) => l.kind === "remote"), false);
  const current = G.parseLog(run(r, G.historyArgs({ all: false, limit: 50 })));
  assert.equal(current.some((c) => c.subject === "side"), false);
});

test("Revert and the commit's own diff", () => {
  const r = repo("revert");
  commit(r, "one"); commit(r, "two");
  const two = G.parseLog(run(r, G.historyArgs({ all: false, limit: 1 })))[0];
  const rows = G.diffRows(run(r, G.diffArgs({ ...two, area: "commit" }, true)[0]).split("\n"), { headers: true });
  assert.ok(rows.some((x) => x.kind === "+" && x.text === "two"));
  runAll(r, G.revertArgs(two.hash));
  assert.match(run(r, ["log", "-1", "--format=%s"]), /Revert "two"/);
  assert.equal(existsSync(join(r, "two.txt")), false);
});

rmSync(base, { recursive: true, force: true });
console.log(`\n${passed} passed${process.exitCode ? ", some failed" : ""}`);
