# Kilo discovery preparation

Prepared against the [official plugin guide](https://kilo.ai/docs/automate/extending/plugins) and [Marketplace contribution instructions](https://github.com/Kilo-Org/kilo-marketplace/blob/main/plugins/README.md), checked 25 November 2026.

The Marketplace offers a direct discovery surface in the VS Code extension. Listing our provider lets users find Cenmax AI while choosing Kilo plugins, then authorize their existing subscription. Listing approval and installation volume are not guaranteed.

`PLUGIN.yaml` is a draft for the self-contained git distribution. It is not a submitted or accepted listing. The draft now pins the public repository to qualified runtime commit `47b979a36d64c290162c93a1b948fcefcd186115`. Before submission, verify that exact commit is still the intended release. Copy the draft into `plugins/git/github.com/cloudcenmax/cenmax-ai-kilo/PLUGIN.yaml` in a fork of `Kilo-Org/kilo-marketplace`. From that repository's `bin/` directory, follow its pinned development setup, regenerate the plugin catalog, run its tests/typecheck, and open a pull request with the manifest and generated catalog. State that CLI qualification is complete only when the qualification record confirms it. VS Code needs separate acceptance testing.

The package already declares `exports["./server"]` and requires no runtime dependencies. Git installation therefore avoids the initial npm publishing dependency. The owned npm package name is `@cenmax/kilo-oauth`; version 0.1.1 is prepared for publication. The manual publish workflow requires an explicit version tag, verifies package metadata and requests npm provenance through GitHub OIDC. Publication and Marketplace submission remain separate steps. The pinned git draft continues to reference the qualified runtime; the package scope change does not change OAuth provider or client identifiers.

Use the package README and qualification record for installation and supported-version details. Keep the listing free of account data, prompts, credentials, and raw test logs.
