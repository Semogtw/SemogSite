# Security models

This directory contains focused threat models that complement the repository-wide `SECURITY.md` controls.

## Current models

- [`MCP_THREAT_MODEL.md`](./MCP_THREAT_MODEL.md) — internal read adapter, output confidentiality, package/transport boundaries and the blocked authenticated remote phase.

## Usage

Read the relevant threat model before:

- introducing a new trust boundary;
- exposing a private adapter remotely;
- adding authentication/authorization behavior;
- adding provider or imported-content ingestion;
- expanding tool/resource capabilities;
- adding background execution or webhooks;
- weakening a guardrail or output allowlist.

A threat-model document does not authorize deployment. Implementation, tests, host evidence, rollback and explicit owner approval remain separate gates.
