# Cenmax AI for Kilo Code

Use your Cenmax AI account allowance from Kilo through OAuth device authorization. No pay-as-you-go API key is required. The browser approval page selects the personal or company account that supplies model access.

## Status and requirements

This package targets the public Kilo plugin API published in `@kilocode/plugin` **7.8.32**. It provides a server plugin, native OAuth login method, account-specific configuration, and a guarded Chat Completions transport. The CLI was qualified on 25 November 2026 using released **Kilo 7.8.32** and **Node.js 24.22.3** on Linux ARM64. Native OAuth, entitled models, a real file-read tool call, streamed output, token rotation, conversation reuse, outside-path denial, and revocation passed. See [qualification](./QUALIFICATION.md). The same server-plugin surface is documented for the VS Code extension, but that extension has not been acceptance-tested.

Requirements: Node.js 24.11 or newer, a POSIX host, and Kilo 7.8.32 with external plugins enabled. Other releases require separate compatibility checks. There are no runtime package dependencies or install scripts.

Cenmax AI must register the public OAuth client **`cenmax-kilo`** with the device-code and refresh-token grants and the **`chat`** scope before live sign-in can work. Client IDs are public identifiers, not secrets. No client secret is distributed, and this package does not register its client by being installed.

## Install and connect

From this source directory:

```sh
npm test
npm pack
```

The npm package is `@cenmax/kilo-oauth`. Once version 0.1.1 is available on npm, add it to the Kilo configuration for your chosen scope:

```json
{
  "plugin": ["@cenmax/kilo-oauth@0.1.1"]
}
```

For a reviewed source checkout or extracted release package, load the local entrypoint instead:

```json
{
  "plugin": ["file:///absolute/path/to/cenmax-ai-kilo/src/index.js"]
}
```

Start Kilo, run its interactive `kilo auth login`, select **Cenmax AI**, and choose **Sign in with Cenmax AI**. Open the printed approval URL and confirm the matching code. After sign-in, restart Kilo to rebuild the account's model catalogue, then select an available `cenmax-ai/<model-id>` entry. For example, `cenmax-ai/pro` is **Pro by Cenmax AI**, and `cenmax-ai/worker` is **Worker by Cenmax AI**, only when returned for your account.

The plugin configuration replaces only the `cenmax-ai` provider's previous model catalogue. It does not enable automatic tool approval or change other providers. A failed catalogue request offers no fallback models. Context/output limits and tool, image, and reasoning capabilities come from the account catalogue. Zero model cost fields represent subscription usage that this plugin cannot price; they do not mean unlimited usage.

The package exposes an optional connection identifier for separate local credential bindings:

```json
{
  "plugin": [["file:///absolute/path/to/cenmax-ai-kilo/src/index.js", {"connection": "work"}]]
}
```

Use the same identifier with the helper commands below. The default is `default`. This version does not integrate Kilo's multi-account switcher; use separate connection IDs/configuration scopes and restart when switching. Do not run mutually untrusted connections under the same operating-system identity.

## Models and disconnect

Invoke the helper directly from the source directory:

```sh
node src/cli.js models default
node src/cli.js logout default
```

Logout revokes the stored refresh family and access token before removing local credentials. If the service cannot be reached, local credentials are retained so revocation can be retried. Then remove the Cenmax AI connection from Kilo's own auth UI and restart it. Removing only Kilo's inert marker does not revoke the OAuth authorization held by this plugin.

## Credential and network behavior

The public authorization origin is `https://console.ai.cenmax.in`; model requests use its `/app/v1` API. The destination is fixed and redirects, query-string endpoint overrides, caller-supplied authorization headers, and unsupported paths are rejected. Service errors are replaced by neutral Cenmax AI messages, and response headers are projected to content type and cache policy.

Reusable OAuth credentials are stored under `~/.local/share/cenmax-ai-kilo/` in atomic mode-0600 files inside a mode-0700 directory. Filenames are derived from the validated connection identifier. Cross-process locks serialize refresh-token rotation. Before dispatch, a one-way grant fingerprint is durably recorded so an interrupted process cannot replay the grant after restart. Uncertain refresh results discard the local session and require sign-in again. Interrupted processes may leave a lock file. Stop all matching Kilo processes before an administrator removes a stale lock; do not remove spent-grant markers to work around sign-in failures.

Kilo receives an inert auth marker, never the reusable OAuth token. The plugin's fetch implementation supplies the current OAuth access token only to the fixed service origin. This design uses Kilo's documented `AuthOAuthResult` key-result variant and `auth.loader`, rather than assuming Kilo refreshes arbitrary OAuth grants automatically. The plugin reads no other application's auth files and adds no telemetry.

Host administrators and code running as the same OS user may access credentials or plugin memory. This package does not isolate hostile code running as that user. OAuth grants model access; Kilo separately controls file, shell, and tool permissions.

## Development and release

```sh
npm test
npm pack --dry-run
```

Tests use synthetic Cenmax AI identities and simulated service responses. They cover the published plugin shape, device polling, origin and endpoint guards, token rotation/concurrency, uncertain refresh handling, credential permissions/symlinks, catalogue replacement, tool-call streams, and redacted errors. They do not install Kilo. The separate qualification record describes real installed-harness tests against the public Cenmax AI service.

Publish only files selected by `package.json` for runtime artifacts. A source repository may also include `test/` and `.gitignore`. Exclude local credentials, caches, dependencies, environment files, and logs. This package is MIT-licensed and has not been published to npm.

For discovery preparation and the unsubmitted Marketplace draft, see [launch preparation](./launch/README.md).

Public API references: [Kilo plugins](https://kilo.ai/docs/automate/extending/plugins), [compatible providers](https://kilo.ai/docs/ai-providers/openai-compatible), and [`@kilocode/plugin` source](https://github.com/Kilo-Org/kilocode/tree/v7.8.32/packages/plugin).
