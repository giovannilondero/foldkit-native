# Long lists

A long list is a plain `n.scrollView` with one keyed child per row. Nothing is windowed or recycled: every row is a real native view. This is the Spike's answer to Demo Ladder rung 3 (`apps/spike/src/demos/longList.ts`), and the spec left it open until then.

## Shape

```ts
n.scrollView(
  [n.Style({ flex: 1 })],
  model.rowIds.map(id =>
    n.view([n.Key(id), n.TestID(`row.${id}`)], [n.text([], [`Row ${id}`])]),
  ),
)
```

- `n.scrollView` draws `scroll-view > view[collapsable=false] > children`, as React Native's `ScrollView` does: the inner view is the content container. It scrolls vertically only.
- The Model holds row ids, not rows. The view maps ids to rows.
- `n.Key(id)` is load-bearing. snabbdom's keyed diff uses it, so a prepend creates only the new row's nodes. Every other row keeps its Engine node (and its Fabric `reactTag`), and the Engine re-commits them by clone. Without keys, rows get relabelled in place and the wrong nodes are reused.

## Why no virtualization

The spec adds virtualization only if the plain scroll view doesn't hold up. It held up:

- 1,000 rows open in one frame: about 0.6 s on the iOS simulator and 0.9 s on the Android emulator, in dev builds with unoptimised JS. Going back to the menu takes about 0.2–0.3 s.
- Scrolling to row 1,000 and back is smooth on both. Android's `gfxinfo` showed 3.85% janky frames (p50 17 ms, p95 24 ms), mostly the emulator's GPU.
- Prepend, remove first and remove middle while scrolled mid-list each change one frame, with no flicker or remount. React Native's plain `ScrollView` does not hold the visible content on a prepend, so the content shifts down by one row, as it does in React Native.
- A drag that starts on a row, or on a pressable inside the list, scrolls. The pressable yields the gesture to the scroll view (`onResponderTerminationRequest`).

The Node tests (`apps/spike/src/demos/longList.test.ts`, on the fake Fabric) pin the identity: one commit per change, the other rows' `reactTag`s unchanged, and only a handful of `createNode` calls.

## If a list outgrows it

These are the triggers to design a window: a list that is much longer than 1,000 rows, rows that are expensive to build, or a profile showing the initial render or scrolling as the bottleneck. The open questions then are:

- **Where the window lives.** Either a builder-level `n.list` that windows on its own, or a Submodel that keeps the visible range in the Model. The first hides state from the Model; the second keeps it inspectable but needs `topScroll` and row measurements (`topLayout`) as Messages.
- **Recycling vs. keys.** Recycling native views (as `FlatList`'s successors do) changes which key a node carries, which fights snabbdom's keyed identity. A window that creates and destroys rows at its edges keeps identity simple.
