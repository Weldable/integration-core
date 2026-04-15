# @weldable/integration-core

Core types, factory, and helpers for building [Weldable](https://github.com/weldable/weldable) integrations.

## Install

```bash
npm install @weldable/integration-core
```

## Usage

```ts
import { defineIntegration, createRestHandler } from '@weldable/integration-core'

const myIntegration = defineIntegration({
  id: 'my-service',
  name: 'My Service',
  auth: { type: 'oauth2' },
  actions: [
    {
      id: 'send-message',
      name: 'Send Message',
      inputFields: [
        { id: 'channel', label: 'Channel', type: 'string', required: true },
        { id: 'text', label: 'Text', type: 'string', required: true },
      ],
      outputFields: [
        { id: 'messageId', label: 'Message ID', type: 'string' },
      ],
      execute: createRestHandler({
        method: 'POST',
        url: 'https://api.my-service.com/messages',
        body: ({ input }) => ({ channel: input.channel, text: input.text }),
        output: (data) => ({ messageId: data.id }),
      }),
    },
  ],
})

export default myIntegration
```

### Subpath exports

| Import | Contents |
|---|---|
| `@weldable/integration-core` | Types, `defineIntegration`, `createRestHandler`, error classes |
| `@weldable/integration-core/testing` | Test helpers for integration actions |
| `@weldable/integration-core/mock-helpers` | Deterministic fake-data helpers (`fakeEmail`, `fakeId`, etc.) |

## Available integrations

| Package | Description |
|---|---|
| [`@weldable/integration-anthropic`](https://github.com/weldable/integration-anthropic) | Anthropic Claude API actions |
| [`@weldable/integration-discord`](https://github.com/weldable/integration-discord) | Discord messaging and server actions |
| [`@weldable/integration-github`](https://github.com/weldable/integration-github) | GitHub issues, PRs, repos |
| [`@weldable/integration-gmail`](https://github.com/weldable/integration-gmail) | Gmail send and search |
| [`@weldable/integration-google-calendar`](https://github.com/weldable/integration-google-calendar) | Google Calendar events |
| [`@weldable/integration-google-docs`](https://github.com/weldable/integration-google-docs) | Google Docs read and write (markdown-aware) |
| [`@weldable/integration-google-drive`](https://github.com/weldable/integration-google-drive) | Google Drive files |
| [`@weldable/integration-google-sheets`](https://github.com/weldable/integration-google-sheets) | Google Sheets read and write |
| [`@weldable/integration-google-tasks`](https://github.com/weldable/integration-google-tasks) | Google Tasks |
| [`@weldable/integration-slack`](https://github.com/weldable/integration-slack) | Slack messaging and channels |
| [`@weldable/integration-web`](https://github.com/weldable/integration-web) | Web scraping |

## Contributing and releasing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow and release process.

## License

MIT
