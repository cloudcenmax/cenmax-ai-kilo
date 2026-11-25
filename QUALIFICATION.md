# Kilo CLI qualification

Tested on 25 November 2026 using the official released `@kilocode/cli@7.8.32`, Node.js `24.22.3`, and Linux ARM64 in a disposable container. Kilo reported version `7.8.32`. No harness source modifications or substitute inference service were used.

| Check | Result |
| --- | --- |
| Load the local server-plugin module in the real CLI | Passed |
| Native `kilo auth login` using the Cenmax AI OAuth method | Passed |
| List the entitled public models through `kilo models cenmax-ai` | Passed; three public models |
| Run `kilo run --format json --model cenmax-ai/worker` | Passed; exit 0, streamed tool and text events, no error events |
| Read a synthetic workspace file with the native `read` tool | Completed once; final response included the expected content |
| Force temporary credential expiry before a subsequent real run | Refresh token rotated and expiry renewed |
| Continue the original native Kilo conversation | Same session; expected prior content, no additional tool calls |
| Attempt a native read of a synthetic outside-workspace file | Rejected; no completed read, other tool calls, or secret-content disclosure |
| Disconnect with the integration's CLI helper | Exit 0, credential removed, no reusable token in output |
| Request models with the old access token after disconnect | HTTP 401 |

The synthetic file tests used an explicit test-workspace policy: all tools required approval except native workspace reads. Environment-file patterns and external-directory reads still required approval. No `--auto` flag or blanket tool approval was enabled. The plugin itself does not configure tool permissions. Permission controls are the host's tool policy, not an operating-system sandbox.

The test authorization was revoked and the container removed afterward. The harness installation occupied about 382 MB, with its temporary installation cache removed. No global host installation, host filesystem mount, published container port, account identifier, credential, or raw session export is included.

Qualification covers the CLI version and platform above. The VS Code extension, other releases/platforms, remote execution, concurrent interactive account switching, and npm/git installation paths require separate acceptance testing. The native Kilo auth record contains an inert plugin marker; removing that record alone does not revoke the plugin's OAuth authorization. Follow the README's disconnect steps.
