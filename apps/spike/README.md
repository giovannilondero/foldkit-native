# apps/spike

The Expo SDK 57 **dev client** (New Architecture and Hermes, both unconditional in SDK 57) that hosts the Demo Ladder. It does not run in Expo Go.

`src/main.ts` registers `main` with `AppRegistry.registerRunnable` and draws through `@ng-native/fabric`'s Engine. There is no `registerRootComponent` and no React in the render path.

## Setup (from the repo root)

Tested with Node 26 and pnpm 12.3.

```sh
git submodule update --init          # vendor/foldkit @ platform-seam
pnpm install
pnpm build                           # builds the fork (tsc -b) and type-checks foldkit-native
pnpm test                            # foldkit-native's Node tests (vitest)
```

Run pnpm commands from the repo root with `-F <name>` (for example `pnpm -F foldkit build`). Running `pnpm` inside `vendor/foldkit` picks up the fork's own `pnpm-workspace.yaml` and installs the whole Foldkit monorepo into the submodule, which then shadows this workspace's links.

The fork is a workspace member, consumed from its `dist/`. Rebuild it (`pnpm build:foldkit`) after pulling a new `platform-seam` commit (`git submodule update --remote vendor/foldkit`).

## Run on a device

`ios/` and `android/` are generated (CNG) and gitignored.

```sh
cd apps/spike
pnpm prebuild                        # expo prebuild --clean
pnpm ios                             # expo run:ios: builds, installs, starts Metro
pnpm android                         # expo run:android: same for the emulator
pnpm start                           # Metro only, for an already installed dev client
```

`expo run:ios --device <udid>` / `expo run:android --device <avd>` pick a target, and `--port <n>` moves Metro off 8081.
