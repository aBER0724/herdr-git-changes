# Changes for Herdr

A git panel for the [Herdr](https://herdr.dev) desktop app, laid out like
[Zed](https://zed.dev)'s git panel. You stage files with checkboxes, then
commit, amend, stash, pull and push from the panel, and browse the history as a
commit graph. Whatever you click opens its diff in the main area, in one or two
columns. The file list is a folder tree or a flat list. It follows the
repository of the terminal you're focused on.

It's meant to take the place of the Changes panel that ships with Herdr. That
panel lists files and shows diffs; its only action is a single Commit that
stages everything first. Installing doesn't swap them by itself: each layout
picks its own Changes panel, so you point your layouts at this one
([how](#use-it-as-your-changes-panel)).

![Changes and History side by side](preview.png)

## What it does

### Changes tab

- **Files grouped like Zed's:** Conflicts, Tracked, Untracked, then your
  Stashes. Each file has a checkbox that stages it, unstages it, or shows `−`
  when only part of it is staged. Each group header has a checkbox for the
  whole group.
- **Tree or flat**, from the toolbar's first pair of icons:
  - **Tree** nests files under their folders, folders first. A folder that
    only holds one folder is merged into it (`src/ui`). Click a folder to fold
    it; its checkbox stages or unstages everything inside. Folding is
    remembered per group.
  - **Flat** lists every file, with its folder in grey beside the name.
- **Toolbar:**
  - View Diff shows every change at once in the main area.
  - Tree / Flat, then One column / Two columns (the same switch as the diff
    tab's own).
  - The ☰ menu: Stage all, Unstage all, stash everything, stash only what's
    staged, pop the latest stash, discard tracked changes, trash untracked
    files.
  - Stage All / Unstage All.
- **On a file:** click it to show its diff in the main area. Hover to get
  *Discard*. Right-click to stage, show the diff, copy its path, or discard it.
- **On a stash:** click to see its diff, new files included. Hover to Apply,
  Pop or Drop it.

### The diff, in the main area

Clicking a file, a stash, a commit or View Diff opens a tab in the main area,
next to your terminals, named after what it shows (`app.ts`, `stash@{0}`, a
short hash). Each space has one such tab: the next click reuses and renames
it, and closing it (its × or your `tab.close` key, ⌘W) just closes it until
the next click.

- **One column:** old and new line numbers side by side, `−` lines in red and
  `+` lines in green.
- **Two columns:** *Before* on the left, *After* on the right, on one shared
  vertical scroll. Removed and added lines next to each other pair up by
  position, never across a hunk or an unchanged line; a side with nothing
  opposite stays empty. Scroll sideways (trackpad or Shift+wheel) and both
  sides move together.
- The switch is in the tab's header and in the panel's toolbar; both change
  every diff tab.
- The tab follows the files: saving a shown file refreshes it.
- The row the tab shows is highlighted in the panel.

### Commit area

- **The branch row** shows `repo / branch ⌄`. Click it to switch to another
  local branch.
- **The remote button** picks what makes sense now: `↓N Pull` when you're
  behind, `↑N Push` when you're ahead, Publish for a branch with no upstream,
  else Fetch. Its ⌄ menu has Fetch, Pull, Pull (rebase), Push and
  Force push (with lease).
- **The message box** is multi-line. ⌘↩ commits. With one changed file it
  suggests a message, as Zed does (`Update store.ts`).
- **Commit or Commit Tracked:** the button commits what's staged. When nothing
  is staged it reads *Commit Tracked* and runs `git commit -a`. Its ⌄ menu has
  Amend (pre-filled with the last message), Signoff, Commit & push, Stash all
  and Uncommit.
- **The last commit** sits at the bottom with its short hash (click to copy the
  full one), ↶ Uncommit (the changes stay staged) and a jump to History.

### History tab

A commit graph drawn the way [herdr-git-graph](#credits) draws it:

- Colored lanes, with curves where branches fork and merge.
- Labels for branches (✓ on the checked-out one, a cloud when it's pushed),
  remote branches and tags.
- HEAD drawn as a ring, and your uncommitted changes as a dashed top row.

Controls:

- **All branches / Current** in the toolbar.
- **☁** shows every remote branch. Off by default: only your branch's upstream
  shows, because remote branches you don't work on each take a lane.
- **The graph's width** is capped at about a quarter of the panel. When the
  panel is narrow the lanes move closer together, down to 6px apart; past that
  the outer ones are cut off. A row shows one label and folds the rest into
  `+N`.
- **Clicking a commit** shows its diff in the main area; the uncommitted row
  shows every change. ⌘C copies the shown commit's hash.
- **Right-click a commit** to check out a branch on it, a remote branch
  (tracking it) or the commit itself, show its diff, copy its hash, short hash
  or message, revert it, or uncommit it if it's the last one.
- **Paging:** 300 commits at first, 300 more each time you scroll to the end.

### Safety

Discard, Drop, Trash and Force push are destructive. They ask once more in
place: the button turns into *Sure?*, or the menu item into *Click again*.
Nothing else asks. When git refuses, its own message appears under the list.
Push, pull and fetch failures also show as a notification.

## What it runs

The mod runs `git` in the focused terminal's repository. For a space on another
machine, it runs git on that machine. It also reads files there to preview an
untracked file. Every git call is an argument list, never a shell line. Reads
use `--no-optional-locks` and leave the index alone, so the panel's own refreshes
don't wake its file watcher.

It reaches the network only through git, when you Fetch, Pull or Push. It reads
and writes nothing outside the repository and Herdr's own state.

## Install

Ask your Herdr agent:

> add the mod at github.com/aBER0724/herdr-git-changes

It reads [RECIPE.md](RECIPE.md), copies `mods/git-changes/` into
`~/.config/herdr-app/mods/`, and runs `herdr-app check` on it.

By hand:

```sh
git clone https://github.com/aBER0724/herdr-git-changes
cp -R herdr-git-changes/mods/git-changes ~/.config/herdr-app/mods/
herdr-app check ~/.config/herdr-app/mods/git-changes
```

### Use it as your Changes panel

Installing the mod doesn't replace anything by itself. Which mod the Changes
button opens is set **in each layout file**, by the block with
`"id": "changes"`. A layout still pointing at Herdr's `changes` keeps the old
panel, and this one only opens as a separate pane or tab. Do the step below
**for every layout you switch between** (`ctrl-shift-l` cycles them).

To see which mod each of your layouts uses for Changes:

```sh
cd ~/.config/herdr-app/layouts
grep -l '"mod": *"changes"' *.json      # still on Herdr's panel
grep -l '"mod": *"git-changes"' *.json  # already on this one
```

**A layout of your own** (a clone, or one you wrote): edit it in place. Find
the block with `"id": "changes"` inside the `panel-body` stack and point it
at this mod:

```json
{ "id": "changes", "type": "block", "content": { "mod": "git-changes" } }
```

Herdr reloads the layout within a second; there's no need to restart it.

**Herdr's own `main` layout** is read-only: Herdr restores it on every start,
and an edit gets moved aside as `main-edited`. Clone it first, then edit the
clone as above. `layout.clone` switches the window to the clone.

```sh
herdr-app do layout.clone '{"name":"main","as":"my-main"}'
```

A layout cloned later starts with Herdr's panel again, so repeat the edit
there too.

The tab bar's Changes button then opens this panel. A key bound to show the
`changes` child of `panel-body` opens it too.

Keep the `panel` column around `panel-body`. The tab bar shows and hides the
panel through it, and without it every click toasts
`layout.show failed: no node "panel"`.

### Or open it as a pane or a tab

On one repository, whatever is focused:

```sh
herdr-app do pane.split '{"direction":"right","mod":"git-changes","props":{"folder":"/path/to/repo"}}'
herdr-app do tab.new '{"name":"History","mod":"git-changes","props":{"folder":"/path/to/repo","tab":"history"}}'
```

| Prop | Meaning |
|---|---|
| `folder` | Show this repository instead of the focused terminal's. |
| `on` | With `folder`: the machine it's on (a name from `hc machine ls`). |
| `tab` | Open on `"changes"` or `"history"`. Without it, the panel opens on the tab you used last. |

## Limits

- Tested on macOS with Herdr 0.1.11. Linux and Windows aren't tested.
- Whole files only: no staging of single hunks or lines yet.
- Renames show as a delete and an add (status runs with `--no-renames`).
- At most 1,000 changed files are listed. A diff shows up to 5,000 lines; an
  untracked file shows its first 3,000 lines.
- Two columns pair lines by position, not by similarity: a block of 3 removed
  and 1 added lines puts the added one next to the first removed one. There's
  no word-level highlighting.
- The diff tab belongs to its space. If you drag it into another space, the
  next click there opens a new one.
- No branch creation, merge, rebase, cherry-pick or tags from the panel; use
  [herdr-git-graph](https://github.com/rabeeh-ta/herdr-git-graph) for those.
- `herdr-app check` renders the panel once, before any git output arrives, so
  it can't catch errors in the rows. `tests/ui.test.mjs` covers that; test in
  the app too.

## Development

```sh
node tests/git.test.mjs   # git logic against real repositories
node tests/ui.test.mjs    # the panel and the diff tab, rendered
```

`git.test.mjs` builds throwaway repositories with a bare "remote". It runs
every command a button or menu item runs against real git, then checks the
parsing, the commit modes, the remote button's choice, stashes, uncommit, force
push, checkout and the history graph (lanes, labels, the remote toggle).

`ui.test.mjs` loads `panel.js` and `diff.js` under node with a small stand-in
for Herdr and GPUI, on a real repository. It draws every row, which
`herdr-app check` doesn't, and clicks through:
- the tree, folding and flat;
- a folder's checkbox;
- opening the diff tab and reusing it;
- one and two columns;
- History.

Neither needs Herdr. CI runs both on every push.

While editing, copy the folder over the installed one and check it:

```sh
rsync -a mods/git-changes/ ~/.config/herdr-app/mods/git-changes/
herdr-app check ~/.config/herdr-app/mods/git-changes
```

Files in `mods/git-changes/`:

| File | What's in it |
|---|---|
| `main.js` | Picks a role from `props.role`: the panel, a menu, or the diff tab (`"diff"`). |
| `panel.js` | The panel: reading the repository, every action, the Changes tab with its tree and flat lists, and the commit area. |
| `history.js` | The History tab's graph. |
| `lanes.js` | Lays commits out on lanes (from herdr-git-graph, unchanged). |
| `diff.js` | Loading diffs, the one diff tab per space and its one- and two-column views. |
| `menu.js` | The dropdown and right-click menus, shown as popups. |
| `git.js` | Parsing git's output, the folder tree, pairing lines for two columns, and the argv behind every action. No Herdr imports, so node can test it. |

The panel and the diff tab are separate copies of the mod. They talk through
shared state:
- `git-changes.view`: per space, what the diff tab shows, from which
  repository, and the tab's id.
- `git-changes.layout`: one or two columns.

## Credits

This mod reuses code from two projects and takes ideas from two more. Each
file that holds borrowed code says so at its top.

**[herdr-git-graph](https://github.com/rabeeh-ta/herdr-git-graph)** by
Rabeeh T A, MIT License. The History tab is built on it:

- `lanes.js` is its `mods/git-graph/lanes.js`, copied unchanged.
- `history.js` follows its `graph.js` for drawing a row's graph: one stroked
  path per color, the curve between lanes, the HEAD ring, the lane colors, the
  label look, whole-pixel rows and paging.
- `git.js` follows its `git.js` for parsing refs, the history's scope, the
  uncommitted row, pairing a branch with its remote, and trimming git's errors.
- `menu.js` follows its `menu.js` for the menu's look and keys.
- Most icons are its icons (Lucide, below).
- The panel listens to its `git-graph.changed` signal and sends the same one,
  so with both installed, an action in either refreshes the other.

Its license is in [LICENSES/MIT-herdr-git-graph.txt](LICENSES/MIT-herdr-git-graph.txt).

**Herdr's Changes panel** ([herdr.dev](https://herdr.dev)), Apache License 2.0.
This mod started as `herdr-app do mod.clone '{"name":"changes"}'` of the panel
shipped with Herdr 0.1.11 (`mod.json` still records `cloned_from`).

- Kept from it: how the panel finds the focused repository, the folder watch,
  the context-keyed refresh, the read-only git flags, and the diff row.
- Changed or added: everything else. Staging, the folder tree, the commit
  area, stashes, remotes, history, menus and the diff tab are new.

Apache 2.0 text: [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt).

**[Lucide](https://lucide.dev)**, ISC License. The icons are Lucide's, as
herdr-git-graph and Herdr draw them; `chevron-*.svg` come from Herdr's Files
panel. `columns`, `diff`, `file`, `folder`, `history`, `list`, `list-tree`,
`minus`, `rows`, `sliders`, `undo` and `x` were added here from Lucide. See
[LICENSES/ISC-Lucide.txt](LICENSES/ISC-Lucide.txt).

**[better-changes](https://github.com/munza/herdr-mods/tree/main/better-changes)**
by Tawsif Aqib, Apache License 2.0. Three ideas come from it:
- opening the diff in one reusable tab of the main area;
- the Tree/Flat and One/Two-column icon pairs;
- two columns that pair lines by position inside a block, on one shared
  vertical scroll.

Its code isn't used here.

**[Zed](https://zed.dev)**'s git panel is the model for the layout: the
Changes/History tabs, the staging checkboxes, Commit vs Commit Tracked, the
branch row's remote button and the suggested commit message. No Zed code is
used.

## License

MIT, see [LICENSE](LICENSE). The borrowed parts keep their own licenses, listed
under [Credits](#credits).
