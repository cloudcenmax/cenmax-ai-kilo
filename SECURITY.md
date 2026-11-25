# Security

Do not include live tokens, approval codes, prompts, account exports, or personal information in public issues. Report suspected credential disclosure privately through the Cenmax AI service's official support channel, and revoke the affected authorization.

Protect `~/.local/share/cenmax-ai-kilo/` as account credentials. Do not copy rotating refresh tokens across running instances. Use separate operating-system identities for mutually untrusted users; mode-0600 files do not isolate processes running as their owner.

Use the helper's logout command to revoke remote grants before removing Kilo's inert auth marker. Do not enable automatic tool approval to resolve authentication errors. Model access and tool permissions are separate decisions.
