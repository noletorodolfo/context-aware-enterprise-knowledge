# ADR-006: Azure OpenAI and a deterministic mock

- **Status:** accepted

## Context

The assistant needs a governed production model integration and fast repeatable tests that do not spend
quota or require a network connection.

## Decision

Use Azure OpenAI as the primary LLM provider, authenticated with managed identity. Keep a deterministic
mock provider for unit tests and structural evaluation.

## Alternatives

- GitHub-hosted model endpoint
- Local Ollama only
- A provider-specific test double in each API test

## Consequences

The deployed runtime has Azure-native identity and the evaluation can use a separate live judge.
Throttling and content filters are modeled explicitly. Mock results validate structure, not model quality.

## Reversal

Add another implementation behind the provider contract and compare it against the golden set before
changing the default.
