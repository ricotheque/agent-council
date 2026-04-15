Forked from [team-attention/agent-council](https://github.com/team-attention/agent-council)

# Agent Council

A skill for AI coding CLIs (Claude Code, Codex CLI) that gathers independent opinions from multiple LLMs, runs an adversarial critique round, and synthesizes a final recommendation — with no additional API costs.

Inspired by [Karpathy's LLM Council](https://github.com/karpathy/llm-council).

## Why No Additional API Costs?

Agent Council runs your already-installed AI CLIs (Claude Code, Codex CLI, Gemini CLI) rather than calling LLM APIs directly. If you're already subscribed to these tools, running the council costs nothing extra.

## What This Fork Adds

| Feature | Description |
|---|---|
| **Adversarial review** | Two-round deliberation where agents critique each other before synthesis |
| **Code generation mode** | Each agent implements in an isolated git worktree, then reviews each other's diffs |
| **Rotating random chairman** | A different member chairs each session — no model goes unchallenged |
| **All members as peers** | The chairman also participates as a regular council member |
| **Stdin-based prompts** | Prompts passed via stdin, handling large inputs without `ARG_MAX` limits |

## How It Works

### Review Mode (default)

1. **Round 1 — Initial Opinions**: All agents receive the prompt simultaneously and respond independently.
2. **Round 2 — Adversarial Critique** *(enabled by default)*: Each agent reads and critiques the other agents' Round 1 responses. Agents do not see their own response by default (`critique_include_self: false`).
3. **Chairman Synthesis**: The host agent (or a randomly selected member) synthesizes all opinions and critiques into a final recommendation.

### Code Generation Mode

1. **Round 1 — Isolated Implementations**: Each agent works in its own git worktree and produces a diff. Code-mode commands use autonomous flags (`--dangerously-skip-permissions`, `--full-auto`, `--yolo`) — run only in trusted repos.
2. **Round 2 — Adversarial Code Review**: Each agent reviews the other agents' diffs using standard (non-autonomous) review commands.
3. **Chairman Synthesis**: The host agent compares implementations, diffs, and critiques, then recommends the best path forward.

## Setup

### 1. Prerequisites

Agent Council requires **Node.js**. Install it if you don't have it:

```bash
# macOS
brew install node

# Or download from https://nodejs.org/
```

### 2. Install the Skill

```bash
npx github:ricotheque/agent-council
```

This copies the skill files into your project. Re-run after upgrades if you see a `Missing runtime dependency` error.

Target options:

```bash
npx github:ricotheque/agent-council --target claude   # Claude Code only
npx github:ricotheque/agent-council --target codex    # Codex CLI only
npx github:ricotheque/agent-council --target both     # Both
```

Installed paths:
- `.claude/skills/agent-council/` (Claude Code)
- `.codex/skills/agent-council/` (Codex CLI)

**Manual install**: copy the `skills/agent-council/` directory and `council.config.yaml` into your host tool's skill folder (e.g. `.claude/skills/agent-council/`).

### 3. Install Member CLIs

Install the CLIs listed under `council.members` in your `council.config.yaml`:

- [Claude Code](https://claude.ai/code)
- [Codex CLI](https://github.com/openai/codex)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli)

Verify each is on your PATH:

```bash
command -v claude && command -v codex && command -v gemini
```

Each CLI should be authenticated before use. Missing CLIs will report `missing_cli` at runtime rather than failing the entire council.

### 4. Configure (Optional)

Edit the config in your installed skill directory (e.g. `.claude/skills/agent-council/council.config.yaml`):

```yaml
council:
  # Each member needs a name and command. Prompts are passed via stdin.
  # code_command is used in code generation mode — these use autonomous flags
  # that are inappropriate for review mode, which is why they're separate.
  members:
    - name: claude
      command: "claude -p --output-format text --model sonnet"
      code_command: "claude --dangerously-skip-permissions -p --output-format text --model sonnet"
      emoji: "🧠"
      color: "CYAN"

    - name: codex
      command: "codex exec --skip-git-repo-check"
      code_command: "codex exec --full-auto --skip-git-repo-check"
      emoji: "🤖"
      color: "BLUE"

    - name: gemini
      command: "gemini -p . -m gemini-2.5-flash"
      code_command: "gemini -p . -m gemini-2.5-flash --yolo"
      emoji: "💎"
      color: "GREEN"

  chairman:
    # random: a different member chairs each session
    # auto: infer from host tool (Claude Code => claude, Codex CLI => codex)
    # Or specify a member name directly: claude, codex, gemini, ...
    role: "random"
    description: "Synthesizes all opinions and provides final recommendation"
    # Optional: run synthesis inside council.sh via CLI (otherwise the host agent synthesizes)
    # command: "codex exec"

  settings:
    mode: review            # review (text responses) | code (worktree implementations)
    timeout: 600            # Seconds per agent in review mode (0 to disable)
    code_timeout: 600       # Seconds per agent in code mode
    exclude_chairman_from_members: false  # Chairman also participates as a peer

    # Adversarial review
    adversarial_review: true
    critique_timeout: 600
    critique_include_self: false  # Agents do not see their own Round 1 response

    # Code mode worktree management
    cleanup_worktrees: true       # Auto-remove worktrees on clean
    keep_worktrees_on_error: false  # Set to true to inspect failed worktrees
```

## Usage

### Via Host Agent (Claude Code / Codex CLI)

Ask naturally — the skill triggers on phrases like:

```
"Summon the council"
"Ask the other AIs about this"
"Review this from multiple perspectives"
```

### Direct Script — Review Mode

```bash
# Multi-stage (pollable)
JOB_DIR=$(./skills/agent-council/scripts/council.sh start "your question")
./skills/agent-council/scripts/council.sh wait "$JOB_DIR"       # Round 1
./skills/agent-council/scripts/council.sh advance "$JOB_DIR"    # Start Round 2
./skills/agent-council/scripts/council.sh wait "$JOB_DIR"       # Round 2
./skills/agent-council/scripts/council.sh results "$JOB_DIR"
./skills/agent-council/scripts/council.sh clean "$JOB_DIR"

# One-shot (handles both rounds automatically in a real terminal)
./skills/agent-council/scripts/council.sh "your question"
```

### Direct Script — Code Generation Mode

```bash
JOB_DIR=$(./skills/agent-council/scripts/council.sh start --mode code "implement feature X")
./skills/agent-council/scripts/council.sh wait "$JOB_DIR"       # Round 1: implementations
./skills/agent-council/scripts/council.sh advance "$JOB_DIR"    # Start Round 2
./skills/agent-council/scripts/council.sh wait "$JOB_DIR"       # Round 2: code reviews
./skills/agent-council/scripts/council.sh results "$JOB_DIR"    # Diffs + critiques
./skills/agent-council/scripts/council.sh clean "$JOB_DIR"
```

### Useful Flags

| Flag | Description |
|---|---|
| `status --text` | Human-readable progress |
| `status --text --verbose` | Per-member detail lines |
| `status --checklist` | Compact checkbox view (handy in host-agent tool cells) |
| `wait --bucket 1` | Notify on every member completion |

> **Host-agent UIs**: In Claude Code / Codex CLI tool UIs, one-shot returns a `wait` JSON payload instead of blocking. The host drives progress with: `wait` -> `advance` -> `wait` -> `results` -> `clean`.

### Without Adversarial Review

Set `adversarial_review: false` in config, then the flow is simpler — no `advance` step needed:

```bash
JOB_DIR=$(./skills/agent-council/scripts/council.sh start "your question")
./skills/agent-council/scripts/council.sh wait "$JOB_DIR"
./skills/agent-council/scripts/council.sh results "$JOB_DIR"
./skills/agent-council/scripts/council.sh clean "$JOB_DIR"
```

## Example

```
User: "React vs Vue for a new dashboard — summon the council"

Round 1: Claude, Codex, and Gemini each give independent recommendations.

Round 2 (adversarial): Each agent critiques the others' reasoning.

Chairman (randomly selected this session — Gemini):
  "After weighing the council's arguments and critiques,
   given your data-visualization focus and team's existing
   React experience, I recommend React with..."
```

## Project Structure

```
agent-council/
├── bin/
│   └── install.js                    # npx installer
├── skills/
│   └── agent-council/
│       ├── SKILL.md                  # Skill trigger docs
│       ├── references/               # Detailed reference docs
│       └── scripts/
│           ├── council.sh            # Main entry point
│           ├── council-job.sh        # Background job runner
│           ├── council-job.js        # Job orchestration
│           └── council-job-worker.js # Per-member worker
├── council.config.yaml               # Default configuration
├── README.md
└── LICENSE
```

## Notes

- Agents run in parallel — total time is bounded by the slowest agent per round
- Prompts are passed via stdin, so large inputs (full diffs, specs) work without shell argument limits
- Do not share sensitive or confidential information with the council
- You are responsible for access/subscription for each member CLI
- Adjust script paths in examples to match your install target (`.claude/...` or `.codex/...`)

## License

MIT — see [LICENSE](./LICENSE)

## Credits

- Forked from [team-attention/agent-council](https://github.com/team-attention/agent-council)
- Inspired by [Karpathy's LLM Council](https://github.com/karpathy/llm-council)
- Built for [Claude Code](https://claude.ai/code) and [Codex CLI](https://github.com/openai/codex)
