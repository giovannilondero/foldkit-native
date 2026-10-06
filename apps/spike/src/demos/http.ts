import { Duration, Effect, Schema } from 'effect'
import { HttpClient } from 'effect/http'
import * as AsyncData from 'foldkit/asyncData'
import { define } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import type { Html, NativeBuilder } from 'foldkit-native/view'

import { defineDemo } from '../demo'

// Rung 4: a GET of JSON through Effect's HttpClient (Foldkit's `Http.layer`,
// Fetch-backed, provided by the app's `resources`), with loading, success and
// error states, and a button that forces a network error.

const TODO_URL = 'https://jsonplaceholder.typicode.com/todos/1'
// NOTE: `.invalid` is reserved (RFC 2606), so DNS fails fast on every network.
const UNREACHABLE_URL = 'https://foldkit-native.invalid/todos/1'

const Todo = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  completed: Schema.Boolean,
})
type Todo = typeof Todo.Type

const RemoteTodo = AsyncData.Schema(Todo, Schema.String)

export const Model = Schema.Struct({ todo: RemoteTodo.schema })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedReload: {},
  ClickedForceError: {},
  SucceededFetchTodo: { todo: Todo },
  FailedFetchTodo: { error: Schema.String },
})
export type Message = typeof Message.Type

const FetchTodo = define('FetchTodo', {
  args: { url: Schema.String },
  messages: [Message.SucceededFetchTodo, Message.FailedFetchTodo],
  execute: ({ url }) =>
    Effect.gen(function* () {
      const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
      const response = yield* client.get(url)
      // NOTE: `.json` reads the body through `arrayBuffer()` + `TextDecoder`,
      // both installed by `import 'expo'` in `main.ts`.
      const todo = yield* Schema.decodeUnknownEffect(Todo)(yield* response.json)
      return Message.SucceededFetchTodo({ todo })
    }).pipe(
      Effect.timeout(Duration.seconds(15)),
      Effect.catchTags({
        HttpClientError: error =>
          Effect.succeed(
            Message.FailedFetchTodo({
              error:
                error.reason._tag === 'TransportError'
                  ? `Network error: ${String(error.reason.cause)}`
                  : error.message,
            }),
          ),
        SchemaError: error =>
          Effect.succeed(Message.FailedFetchTodo({ error: `Unexpected JSON: ${error.message}` })),
        TimeoutError: () => Effect.succeed(Message.FailedFetchTodo({ error: 'Timed out' })),
      }),
    ),
})

const load = (url: string) => ({
  model: { todo: RemoteTodo.Loading() },
  commands: [FetchTodo({ url })],
})

const button = (
  n: NativeBuilder<Message>,
  testID: string,
  message: Message,
  label: string,
  isDisabled: boolean,
): Html =>
  n.pressable(
    [
      n.TestID(testID),
      n.AccessibilityLabel(label),
      n.OnPress(message),
      n.Disabled(isDisabled),
      n.Style({
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: '#111827',
        opacity: isDisabled ? 0.4 : 1,
        alignItems: 'center',
      }),
    ],
    [n.text([n.Style({ color: 'white', fontSize: 18, fontWeight: '600' })], [label])],
  )

const statusView = (model: Model, n: NativeBuilder<Message>): Html => {
  const line = (text: string, color: string): Html =>
    n.text([n.TestID('http.status'), n.Style({ fontSize: 18, color })], [text])
  return AsyncData.match(model.todo, {
    onIdle: () => line('Idle', '#6b7280'),
    onLoading: () => line('Loading…', '#6b7280'),
    onRefreshing: () => line('Loading…', '#6b7280'),
    onFailure: error => line(error, '#dc2626'),
    onStale: ({ error }) => line(error, '#dc2626'),
    onSuccess: (todo: Todo) =>
      n.view(
        [n.TestID('http.status'), n.Style({ gap: 8 })],
        [
          n.text([n.Style({ fontSize: 14, color: '#6b7280' })], [`Todo #${todo.id}`]),
          n.text([n.Style({ fontSize: 22, fontWeight: '600' })], [todo.title]),
          n.text([n.Style({ fontSize: 16 })], [todo.completed ? 'Completed' : 'Not completed']),
        ],
      ),
  })
}

const view = (model: Model, n: NativeBuilder<Message>): Html => {
  const isLoading = model.todo._tag === 'Loading'
  return n.view(
    [n.Style({ flex: 1, padding: 24, gap: 24 })],
    [
      n.text([n.Style({ fontSize: 14, color: '#6b7280' })], [`GET ${TODO_URL}`]),
      statusView(model, n),
      n.view(
        [n.Style({ flexDirection: 'row', gap: 12 })],
        [
          button(n, 'http.reload', Message.ClickedReload(), 'Reload', isLoading),
          button(
            n,
            'http.forceError',
            Message.ClickedForceError(),
            'Force network error',
            isLoading,
          ),
        ],
      ),
    ],
  )
}

export const demo = defineDemo<Model, Message>({
  title: 'HTTP',
  init: () => load(TODO_URL),
  update: (_model, message) =>
    Message.match(message, {
      ClickedReload: () => load(TODO_URL),
      ClickedForceError: () => load(UNREACHABLE_URL),
      SucceededFetchTodo: ({ todo }) => ({ model: { todo: RemoteTodo.Success({ data: todo }) } }),
      FailedFetchTodo: ({ error }) => ({ model: { todo: RemoteTodo.Failure({ error }) } }),
    }),
  view,
})
