# PROTOTYPE — throwaway: what does a Foldkit Native view look like?

Answers [What does a Foldkit Native view look like?](https://github.com/giovannilondero/foldkit-native/issues/6).
Not production code; it lives only on the `prototype/native-view-api` branch.

```sh
pnpm install
pnpm start            # all three variants, counter + long list
pnpm start b list     # one variant, one demo
pnpm typecheck        # also proves variant B's compile-time guarantees
```

Each variant writes the same counter and long-list views. `main.ts` prints the
native tree the Fabric Engine would receive, fires press/changeText events
through a Foldkit-style dispatch loop, and re-renders. Model/Message/update are
shared (`src/app.ts`), so only the view differs.

| | Builder | Text | Events | Long list |
|---|---|---|---|---|
| **A** `src/variantA.ts` | Foldkit's HTML `h`, Platform maps tags | raw strings auto-wrapped in a hidden Text | `OnClick` reinterpreted as press | keyed ScrollView, all 10k rows built |
| **B** `src/variantB.ts` | NativeBuilder `n`, attribute arrays, per-element attribute types | typed: strings only inside `n.Text` | `OnPress`, `OnChangeText` | `n.List` builds only a window |
| **C** `src/variantC.ts` | NativeBuilder `n`, props records | `n.text(props, 'string')` | `onPress` / `onChangeText` props | keyed ScrollView |

Stand-ins: `vnode.ts` fakes snabbdom's VNode and the Engine; the HTML builder
in A is a slice of Foldkit's real one; nothing runs on a device.
