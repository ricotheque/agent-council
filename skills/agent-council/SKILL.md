---
name: agent-council
description: Collect and synthesize opinions from multiple AI agents with adversarial review. Use when users say "summon the council", "ask other AIs", or want multiple AI perspectives on a question.
---

# Agent Council

Collect multiple AI opinions, have them challenge each other, and synthesize one answer.

## Usage

### With adversarial review (default when `adversarial_review: true` in config)

```bash
JOB_DIR=$(./skills/agent-council/scripts/council.sh start "your question here")
# Wait for Round 1 (initial responses)
./skills/agent-council/scripts/council.sh wait "$JOB_DIR"
# Advance to Round 2 (adversarial critique)
./skills/agent-council/scripts/council.sh advance "$JOB_DIR"
# Wait for Round 2
./skills/agent-council/scripts/council.sh wait "$JOB_DIR"
# Get results from both rounds
./skills/agent-council/scripts/council.sh results "$JOB_DIR"
./skills/agent-council/scripts/council.sh clean "$JOB_DIR"
```

### One-shot (handles both rounds automatically)

```bash
./skills/agent-council/scripts/council.sh "your question here"
```

### Code generation mode (each agent implements in an isolated git worktree)

```bash
JOB_DIR=$(./skills/agent-council/scripts/council.sh start --mode code "implement feature X")
# Wait for Round 1 (implementations)
./skills/agent-council/scripts/council.sh wait "$JOB_DIR"
# Advance to Round 2 (adversarial code review of each other's diffs)
./skills/agent-council/scripts/council.sh advance "$JOB_DIR"
# Wait for Round 2
./skills/agent-council/scripts/council.sh wait "$JOB_DIR"
# Get results (diffs + critiques)
./skills/agent-council/scripts/council.sh results "$JOB_DIR"
./skills/agent-council/scripts/council.sh clean "$JOB_DIR"
```

### Without adversarial review (set `adversarial_review: false` in config)

```bash
JOB_DIR=$(./skills/agent-council/scripts/council.sh start "your question here")
./skills/agent-council/scripts/council.sh wait "$JOB_DIR"
./skills/agent-council/scripts/council.sh results "$JOB_DIR"
./skills/agent-council/scripts/council.sh clean "$JOB_DIR"
```

## References

- `references/overview.md` — workflow and background.
- `references/examples.md` — usage examples.
- `references/config.md` — member configuration.
- `references/requirements.md` — dependencies and CLI checks.
- `references/host-ui.md` — host UI checklist guidance.
- `references/safety.md` — safety notes.
