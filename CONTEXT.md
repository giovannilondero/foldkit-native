# Foldkit Native

Foldkit applications running on iOS and Android as real native views, with no React in the render path.

## Language

**Foldkit Native**:
The effort to run Foldkit apps (Model, Message, update, view, Commands, Subscriptions) on Expo, rendering to native views.
_Avoid_: Foldkit RN, React Native Foldkit

**Spike**:
The experiment this project is planning: a single proof that a Foldkit app can drive native views, judged against the Demo Ladder.
_Avoid_: PoC, MVP, prototype (a prototype is a throwaway artifact answering one design question)

**Demo Ladder**:
The ordered set of demos the Spike must pass: counter, controlled text input, long list, HTTP Command, Subscription; styling via classes and navigation as bonuses.

**Fabric Engine**:
The framework-agnostic retained node tree from ng-native that Foldkit Native renders into; it alone talks to React Native's Fabric.
_Avoid_: bridge, native renderer (ambiguous with Foldkit's own renderer)

**Platform**:
The set of node operations, snabbdom modules and frame clock that Foldkit renders through; Foldkit's default is the browser Platform.
_Avoid_: adapter, renderer, backend

**Fabric Platform**:
Foldkit Native's Platform: maps tags to Native Elements, supplies native modules, and commits the Fabric Engine once per frame.
_Avoid_: adapter, native renderer

**Native Element**:
A host element a Foldkit Native view is built from (a view, a text, a pressable, a scroll view), as opposed to an HTML element.
_Avoid_: component, tag

**Browser Effect**:
Any Foldkit runtime behaviour that assumes a browser: history and URL navigation, document title, scroll preservation, media queries, focus, keyboard bindings, animation-frame batching.
_Avoid_: DOM side effect, web API
