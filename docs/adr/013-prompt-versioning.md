# ADR-013: Versioned prompts, selectable per request

- **Status:** accepted

## Context

Changing the system prompt changes the product's behaviour, and the change is invisible in the
answer itself. Phase 6 needed to test a specific hypothesis: that the assistant refuses questions
the excerpts do answer when the wording differs, and that telling it so would raise the share of
answered questions.

## Decision

Keep prompts as numbered files (`prompts/v1.md`, `prompts/v2.md`) loaded into separate providers,
and let a request pick one the same way it picks a retriever: `x-kb-prompt` for holders of the
`Evaluator` app role, a fixed default for everyone else. The version that produced an answer is
reported in the diagnostics and in every evaluation report, so no measurement is ambiguous about
which prompt it describes.

## Alternatives

- Edit the prompt in place: the comparison becomes a memory of two different runs
- A prompt registry service: nothing to configure at runtime yet, and one more thing to operate
- Environment variable per deployment: cannot compare two prompts against the same corpus in one run

## Consequences

The hypothesis was testable, and it was wrong: against the real tenant, v2 changed no case result
and no metric under either retriever — refusals, citations, groundedness and expected facts were
identical. v1 therefore remains the default, and v2 stays in the repository as the measurement that
justified not shipping it. Keeping both versions loaded costs one extra provider instance and
nothing at request time.

## Reversal

Delete a prompt version once no report references it; the default is a deployment setting, so
switching versions needs no code change.
