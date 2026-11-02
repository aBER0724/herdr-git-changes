# Changes

A git panel for the focused terminal's repository, laid out like Zed's git
panel. It has a Changes tab and a History tab. In Changes you stage files with
checkboxes, preview their diffs, and work with stashes. In History you browse a
commit graph drawn like herdr-git-graph's. A commit area sits at the bottom
of both: the branch, a remote button that pulls, pushes, publishes or fetches,
a multi-line message, a split Commit button, and the last commit with a
copyable hash. It replaces Herdr's `changes` block in a layout, and also opens
as a pane or a tab on one repository.

![Changes](preview.png)

## What you see

One column on `background`, radius 10, 1px `border`, base text 13px, top to
bottom:

- **Tabs**, 34px, bottom border: `Changes (N)` and `History`, each half the
  width, 13px. The current one is `foreground` with a 2px `accent` underline,
  the other `muted`.
- **Toolbar**, 32px, 8px side padding, bottom border, 22px icon buttons in
  `muted`.
  - On Changes: `± View Diff`, the `+N −N` totals in `ansi2` and `ansi1` 11px,
    a gap, a ☰ (sliders icon) menu button, then `+ Stage All`. That last button
    reads `− Unstage All` when everything is staged.
  - On History: a segmented control `All branches | Current` (20px segments,
    11.5px, the chosen one `raised` with a border), a ☁ toggle (`selected`
    background and `accent` icon when on), the commit count in 11px `dim` on
    the right (`300+` when there are more), and Refresh.
- **The list.**
  - On Changes, rows are 26px, radius 6, 6px padding around the list. Group
    headers show a chevron, the title at 12px `muted`, a 14px checkbox and a
    count chip (`raised`, 10.5px). The groups are Conflicts, Tracked,
    Untracked and Stashes, and empty ones are left out.
  - A file row shows: a 14px checkbox (3px radius, `input` border; `accent`
    filled with ✓ when staged, `accent` `−` when partly staged); the status
    letter 11px (`blocked` for M, `ansi2` for A and U, `ansi1` for D and
    conflicts); the file name; the folder in 11px `dim`; and `+N −N` on the
    right.
  - Hovering a file swaps the counts for two 22px buttons: open diff in a tab,
    and discard (`ansi1`).
  - The selected row is `selected` with a 1px `accent` border.
  - A stash row shows a stash icon, its message, and its age in 11px `dim`.
    Hovering it shows Apply, Pop and Drop.
  - With no changes: "No changes to commit", centered, `dim`, and
    "N commits to push" under it when the branch is ahead.
- **History rows**, 24px each, a virtual list.
  - The graph cell: lanes 5px in from the left and up to 12px apart. The cell
    is at most 26% of the panel width, between 28 and 110px. When the lanes
    don't fit, they get closer (down to 6px apart) and the dots shrink from
    8px to 6px. Past that, the outer lanes are cut off.
  - Lines are 1.5px (1.25px when lanes are tight), in lane colors
    `ansi4, ansi2, ansi5, ansi3, ansi6, ansi1, ansi12, ansi10, ansi13, ansi11, ansi14, ansi9`.
    A change of lane is a cubic curve with vertical tangents.
  - HEAD's dot is a ring, and its row is tinted with its lane color at 8%.
  - The top row is "Uncommitted changes (N)", in `muted`, with a gray ring and
    a dashed line to HEAD.
  - Labels are 18px tall, radius 5, monospace 11px, at most 36% of the text
    width. The checked-out branch is filled with its lane color and has a ✓.
    Other branches have a lane-color border and a branch icon, plus a cloud
    when their remote twin exists. Remote branches are `muted` with a cloud;
    tags are `ansi3` with a tag icon.
  - Only the first label shows. The rest fold into a `+N` chip (`raised`) whose
    tooltip lists them.
  - The subject follows the labels; merge commits are `dim`. The date is 11px
    `dim` on the right: `now`, `5m`, `3h` or `2d`, else `Sep 7`, with the year
    once it isn't this year.
- **The preview** fills the rest when something is picked.
  - A 28px `raised` title bar: for a commit, a hash chip and its subject;
    otherwise the file path, the stash, or "All changes". On the right, open in
    a tab and close.
  - Then the diff: monospace 11px, 20px rows. The line number is `dim`, `+`/`−`
    in `ansi2`/`ansi1`. Added lines have an `ansi2` background at 9%, removed
    ones `ansi1` at 9%.
  - Hunk headers are `raised` and `dim`. When a diff covers several files,
    each file starts with a 24px header in bold on `raised`.
- **A note**, 11px `ansi1`, above the commit area when git refuses something.
  Click it to dismiss.
- **The commit area**, on `chrome` with a top border:
  - The branch row, 34px: a branch icon, the repository name in `muted`, a
    `/`, the branch name, and a ⌄. On the right, the remote button: a 26px
    split button, `raised` with a border, whose main half reads `↓3 Pull`,
    `↑15 Push`, `Publish` or `↻ Fetch`.
  - The message box: multi-line, monospace 12px, 3 to 10 rows, radius 8, its
    border `accent` while typing. The placeholder is the suggested message, or
    "Enter commit message".
  - Then `amend` and `signoff` chips when they're on, and the Commit split
    button on the right: `solid` with `solid_foreground`, reading `Commit`,
    `Commit Tracked` or `Amend`.
  - The last commit, 30px, top border: a hash chip (monospace 11px `dim`, the
    7-character hash and a copy icon; ✓ in `ansi2` for 1.5s after a copy), the
    subject in `muted`, then 22px Uncommit (↶) and History (🕘) buttons.

Menus are popups on `popover` with 28px rows: an icon or a ✓, the label, and a
hint in 11px `dim`. Danger items are `ansi1`.

## How it behaves

- **Where it looks.** The focused pane's live folder, else the focused block's
  terminal, else the space's folder. With `props.folder` (and `props.on`), only
  that repository. Each read starts with `git rev-parse --show-toplevel`; when
  that fails, the panel shows "Not a git repository".
- **Staying current.**
  - It refreshes whenever its folder changes (`watchFolder`), every 10s, when
    the focus moves to another folder, and after every action.
  - Folders on other machines are polled instead of watched.
  - It sets and listens to `shared("git-graph.changed")`, so herdr-git-graph
    refreshes after this panel acts, and the other way round.
  - Reads use `--no-optional-locks -c core.fsmonitor=false -c
    diff.autoRefreshIndex=false`, so they don't wake the watch.
- **Agent status** isn't shown; this panel is about one repository.
- **Clicks.**
  - Clicking a file, stash or commit previews it; clicking the same one closes
    the preview. Double-clicking opens it in a tab.
  - A checkbox stages or unstages without selecting the row.
  - A group's checkbox stages the whole group, or unstages it when all of it is
    staged.
  - Right-click menus:
    - File: stage or unstage, open in a tab, copy path, copy full path, and
      Discard (danger).
    - Stash: Apply, Pop, open in a tab, and Drop (danger).
    - Commit: checkout each local branch on it, checkout each remote-only
      branch with tracking, checkout this commit (detached), open in a tab,
      copy hash (⌘C), copy short hash, copy message, Uncommit (last commit
      only), and Revert.
  - In History, right-clicking the uncommitted row opens the ☰ menu.
- **Keys.** ⌘↩ (or ctrl-↩) commits. ⌘C (or ctrl-shift-c) copies the selected
  commit's hash, except while the message box has the keyboard. Esc leaves the
  message box. In menus: ↑/↓, ↩ or space, Esc.
- **The Commit button.**
  - With anything staged it reads `Commit` and runs `git commit -m`. With
    nothing staged but tracked changes, it reads `Commit Tracked` and runs
    `git commit -a`. With only untracked files, it's disabled. Conflicts
    disable it too, and the note says to stage each file once it's resolved.
  - An empty message uses the suggestion. With one file, that's
    `Update|Create|Delete <name>`.
  - Amend pre-fills the whole last message; an empty amend keeps the last
    message (`--no-edit`).
  - Commit & push adds `--force-with-lease` when amending a commit that's
    already pushed.
- **The remote button.**
  - With no remote it's hidden.
  - It reads `↓N Pull` when behind (`git pull --ff-only`), `↑N Push` when ahead
    (`git push`), `Publish` with no upstream (`git push --set-upstream origin`,
    or the only remote, then the branch), else `Fetch` (`git fetch --prune`).
  - Its menu adds Pull (rebase) and Force push (with lease).
  - Remote work shows a toast when done or failed.
- **Danger.** Discard, Drop, Trash untracked, Discard tracked and Force push
  ask again. Inline buttons turn red and read "Sure?" for 3s; menu items turn
  red and read "Click again: …". Nothing else asks.
- **Busy.** One action runs at a time; the buttons read `Committing…`,
  `Push…` and so on. The refresh after an action waits for it to finish.
- **History.**
  - It's read only while the tab shows. All branches runs
    `--all --exclude=refs/stash`. With ☁ off it adds
    `--exclude=refs/remotes/*` and then the upstream's own ref; Current reads
    `HEAD`.
  - 300 commits are read first, and 300 more when the list scrolls to its end.
  - Each panel copy remembers (in its `localStorage`): the last tab, All or
    Current, ☁, Signoff, and which groups are folded.
- **Motion.** None; nothing animates.

## Built from

- **Layout.** A block with `{ "mod": "git-changes" }`. In Herdr's `main`
  layout, that's the `changes` child of the `panel-body` stack, inside the
  `panel` column the tab bar shows and hides.
- **Roles** (`props.role`):
  - none: the panel.
  - `"menu"`: a popup with `{ owner, items }`.
  - `"diff"`: a tab with `{ root, on, item }`, opened by
    `tab.new {mod: "git-changes", props}`.
- **Panel props:** `folder`, `on`, and `tab` (`"changes"` or `"history"`).
- **Files:**
  - `main.js`: picks the role.
  - `panel.js`: state, refresh, actions, the Changes tab and the commit area.
  - `history.js`: the graph.
  - `lanes.js`: lane layout, copied unchanged from herdr-git-graph.
  - `diff.js`: loading and drawing diffs, and the diff tab.
  - `menu.js`: menus.
  - `git.js`: parsing and argv, with no Herdr imports, so `node` can test it.
- **Menus.** A menu can't run git itself: a popup's tasks end when it closes.
  It posts `setShared("git-changes.pick", { owner, id, at })`, and the panel
  whose `owner` id matches runs the action it remembered under that id.
  Clipboard items copy in the popup.
- **Git:**
  - status: `status --porcelain=v2 --branch -z --no-renames --untracked-files=all`
  - counts: `diff HEAD --numstat -z` (before the first commit, `--cached` and
    the worktree, added up)
  - stashes: `stash list --format=%gd%x1f%s%x1f%cr`
  - history: `log --date-order --decorate=full -n<limit>`
  - previews: `diff HEAD -- <path>`, `stash show -p --include-untracked <ref>`,
    `show --format= -p --diff-merges=first-parent <hash>`
  - Every action is an argv list in `git.js`.
- **Herdr:** `spaces`, `panes`, `focused`, `exec`, `readTextFile`,
  `watchFolder`, `theme`, `settings`, `notify`, `shared`, `setShared`,
  `openOverlay`, `closeOverlay`, `props`, `run("tab.new")`.
- **gpui:** `TextareaState` and `Textarea`, `v_virtual_list`, `Scrollbar`,
  `PathBuilder` with `window.paint_path`, and `write_to_clipboard`.
- **Art:** Lucide icons in `icons/` (ISC). Most come from herdr-git-graph;
  `chevron-*` come from Herdr's Files panel.

## Watch out

- **A method and a field must never share a name.** `this.labels = new Map()`
  replaced a `labels()` method, and every History row threw. `herdr-app check`
  passed, because it renders once before git answers, with no rows.
- **Popup tasks are cancelled on close**, so actions run in the panel, not the
  menu.
- **Virtual-list rows can't hold their own handlers.** Use `on_item_click` and
  `on_item_secondary_click` on the list. Take the click count from an
  `on_mouse_down` on a wrapper.
- **`paint_path` takes raw pixels** while elements are zoomed. Multiply the
  path's coordinates by `settings().zoom`.
- **Rows must be a whole number of screen pixels.** Round `24 × zoom` and
  divide back; 21.6px rows leave hairlines between them.
- **The tab bar runs `layout.show {id: "panel"}`.** A layout whose
  `panel-body` stack isn't wrapped in a `panel` column toasts on every click
  and every space switch.
- **Remote branches each take a lane.** In one repository, 300 commits needed
  16 lanes with them and 7 without. That's why ☁ is off by default.
- **Submodules** have no hunks: their preview is the `Subproject commit` lines
  or "Submodule: untracked content".
- **Limits:**
  - 1,000 changed files.
  - 5,000 preview lines; an untracked file's preview stops at 3,000 lines.
  - Lines past 4,000 characters are cut.
  - Whole-file staging only; renames show as a delete and an add.
- **Assumptions:** git 2.35 or newer (`git stash push --staged`), and Herdr
  0.1.11. Tested only on macOS.

## Done when

- `herdr-app check mods/git-changes` passes.
- `node tests/git.test.mjs` passes. It runs every action against throwaway
  repositories with a bare remote.
- In a repository with a staged file, a partly staged file and an untracked
  file:
  - the checkboxes read ✓, `−` and empty;
  - the button reads `Commit`;
  - committing leaves the other two.
- With nothing staged, the button reads `Commit Tracked`, and committing leaves
  only untracked files.
- Stash with a message, then Pop: the files come back, and the stash's preview
  showed the untracked file too.
- On a branch with no upstream, the remote button reads `Publish`. After it,
  one commit later, it reads `↑1 Push`.
- History draws a merge as two lanes joined by a curve, puts `✓ main` first on
  HEAD's row, and has a dashed line from the uncommitted row to HEAD.
- Turning ☁ on or off adds or removes a remote-only branch's lane.
- ⌘C on a selected commit puts its 40-character hash on the clipboard.
