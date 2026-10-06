# foldkit-native

Exploring [Foldkit](https://github.com/foldkit/foldkit) on native iOS/Android via Expo, rendering through [`@ng-native/fabric`](https://github.com/ng-native/ng-native) with no React in the render path.

Planning lives in the issue labelled `wayfinder:map`. Vocabulary lives in [CONTEXT.md](./CONTEXT.md). The Spike spec is [docs/spike-spec.md](./docs/spike-spec.md).

## Layout

- `vendor/foldkit/`: git submodule, the Foldkit fork at branch `platform-seam`.
- `packages/foldkit-native/`: the library package.
- `apps/spike/`: the Expo dev client. See [apps/spike/README.md](./apps/spike/README.md) for install, build and run commands.
