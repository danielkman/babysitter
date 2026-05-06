# @a5c-ai/atlas

Atlas catalog graph package. It ships the generated graph index, SDK helpers for graph interaction, and the `atlas` CLI.

## Usage

```ts
import { getStats, getRecord, searchRecords } from "@a5c-ai/atlas";

console.log(getStats());
console.log(getRecord("some-node-id"));
console.log(searchRecords("codex"));
```

```sh
atlas stats
atlas kinds
atlas get <node-id>
atlas search codex --limit 10
atlas neighbors <node-id> --depth 2
```
