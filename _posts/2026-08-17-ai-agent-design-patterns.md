---
title: "AI Agent Design Patterns: ReAct, Routing, Planning, and More"
date: 2026-08-17
topic: ai
tags: [AI Agents, LLM Patterns, MCP, Agentic AI]
excerpt: "A field guide to nine core AI agent design patterns — Prompt Chaining, Routing, Parallelization, Reflection, Tool Use (MCP), Planning, ReAct, Orchestrator, and Evaluator-Optimizer — each explained with a worked example, code sketch, and animated diagram."
---

## Introduction

Most "AI agents" are really just a handful of recurring control-flow shapes wrapped around an LLM: chain steps together, branch to a specialist, fan work out and back in, let the model critique itself, call a tool, break a goal into sub-goals, loop until a check passes. Once you can name the shape, you can pick the simplest one that solves the problem instead of reaching for a heavyweight "autonomous agent" every time.

This is a field guide to nine patterns that show up again and again in agentic systems:

1. [Prompt Chaining](#1-prompt-chaining)
2. [Routing](#2-routing)
3. [Parallelization](#3-parallelization)
4. [Reflection](#4-reflection)
5. [Tool Use (MCP)](#5-tool-use-mcp)
6. [Planning (Goal Decomposition)](#6-planning-goal-decomposition)
7. [ReAct (Reason + Act)](#7-react-reason--act)
8. [Orchestrator-Workers](#8-orchestrator-workers)
9. [Evaluator-Optimizer](#9-evaluator-optimizer)

Each section below explains how the pattern works, walks through a concrete example, includes a short illustrative code sketch, and has a self-contained animated diagram — the diagrams are plain SVG with CSS animation (no video, no JS), so they loop automatically wherever they're embedded.

A note on the code: every snippet is deliberately framework-agnostic pseudocode-ish Python — plain functions calling a `llm(prompt)` and, where relevant, a `call_tool(name, args)` helper. The point is to show the *shape* of the control flow, not to hand you a production-ready integration with a specific SDK.

## 1. Prompt Chaining

**How it works:** Break a task into an ordered sequence of smaller LLM calls, where each step's output becomes the next step's input. Because each step has a narrow, well-defined job, each one is easier to prompt well, easier to validate, and easier to debug than one giant "do everything" prompt. Optionally, you insert a programmatic check between steps (a schema check, a regex, a length limit) to fail fast before wasting a downstream call.

![Prompt chaining diagram: a request flows through Extract, Summarize, and Draft stages to produce an output](/assets/images/patterns/prompt-chaining.svg)

**Example:** Turning a long customer email into a reply. Step 1 extracts the key facts (order number, complaint, sentiment). Step 2 summarizes those facts into a one-paragraph brief. Step 3 drafts a reply using that brief. Each step is a small, focused prompt rather than one prompt trying to read, reason, and write all at once.

```python
def extract_facts(email: str) -> str:
    return llm(f"Extract the order number, issue, and sentiment from this email:\n{email}")

def summarize(facts: str) -> str:
    return llm(f"Summarize these facts in one paragraph:\n{facts}")

def draft_reply(brief: str) -> str:
    return llm(f"Write a courteous support reply based on this brief:\n{brief}")

def handle_email(email: str) -> str:
    facts = extract_facts(email)
    brief = summarize(facts)
    return draft_reply(brief)
```

**When to use it:** The task naturally decomposes into sequential sub-steps, each step benefits from a focused prompt, and you want an easy place to add validation gates between steps. Skip it when a single well-crafted prompt already does the job reliably — chaining adds latency and cost for every extra call.

## 2. Routing

**How it works:** A lightweight classifier step (often just a small/cheap LLM call, sometimes a plain rules engine) looks at the incoming request and decides which specialized downstream path — a specific prompt, tool, or agent — should handle it. Routing keeps each downstream path simple and focused instead of forcing one prompt to handle every possible request type.

![Routing diagram: a router node classifies each request and sends it to one of three specialist agents, alternating between them over time](/assets/images/patterns/routing.svg)

**Example:** A support inbox where a router reads each incoming ticket and sends billing questions to a "billing specialist" prompt (with billing FAQs and account-lookup tools), technical questions to a "technical specialist" prompt (with docs and diagnostics tools), and everything else to a general-purpose assistant.

```python
SPECIALISTS = {
    "billing": handle_billing,
    "technical": handle_technical,
    "general": handle_general,
}

def route(request: str) -> str:
    category = llm(
        f"Classify this request as billing, technical, or general. "
        f"Reply with one word.\n{request}"
    ).strip().lower()
    handler = SPECIALISTS.get(category, handle_general)
    return handler(request)
```

**When to use it:** Requests fall into a small number of distinct categories, each best served by a different prompt, tool set, or model (e.g. a cheap model for simple cases, a stronger model for complex ones). Skip it when there's really only one kind of request — routing adds an extra classification call for no benefit.

## 3. Parallelization

**How it works:** Split a task into independent sub-tasks, run them concurrently against the LLM (or across different models/prompts), then merge the results. Two common flavors: *sectioning* (each sub-task is a different piece of the problem, like reviewing different files) and *voting* (the same sub-task run multiple times to get an ensemble of independent judgments). Because the sub-tasks don't depend on each other, running them in parallel cuts wall-clock latency compared to doing them one after another.

![Parallelization diagram: a task fans out to three workers running at the same time, whose results are merged by an aggregator](/assets/images/patterns/parallelization.svg)

**Example:** Reviewing a pull request by running three independent LLM calls at once — one focused on security issues, one on performance, one on style/readability — then merging the three findings lists into a single review comment.

```python
import concurrent.futures

def review_security(diff: str) -> str:
    return llm(f"Review this diff for security issues only:\n{diff}")

def review_performance(diff: str) -> str:
    return llm(f"Review this diff for performance issues only:\n{diff}")

def review_style(diff: str) -> str:
    return llm(f"Review this diff for style/readability issues only:\n{diff}")

def review_pr(diff: str) -> str:
    with concurrent.futures.ThreadPoolExecutor() as pool:
        futures = [
            pool.submit(review_security, diff),
            pool.submit(review_performance, diff),
            pool.submit(review_style, diff),
        ]
        findings = [f.result() for f in futures]
    return merge_findings(findings)
```

**When to use it:** Sub-tasks are genuinely independent (no sub-task needs another's output) and either latency matters or you want multiple independent perspectives on the same input. Skip it when steps depend on each other's output — that's prompt chaining, not parallelization.

## 4. Reflection

**How it works:** After a generator produces a draft, a separate critic step (which can be the same model with a different prompt, or a different model entirely) reviews it against a rubric and returns feedback. The generator revises based on that feedback, and the cycle repeats — usually for a fixed number of rounds or until the critic reports no further issues. Separating "write" from "review" tends to catch mistakes that a single generation pass misses, because critique is an easier task than generation.

![Reflection diagram: a generator drafts an answer, a critic reviews it and sends feedback back, and the cycle repeats until the answer is good enough](/assets/images/patterns/reflection.svg)

**Example:** Generating a SQL query from a natural-language question, then having a critic step check the query against the schema and the original question for correctness, and looping back to fix it if the critic finds an issue.

```python
def generate_sql(question: str, schema: str) -> str:
    return llm(f"Write a SQL query for: {question}\nSchema:\n{schema}")

def critique_sql(question: str, schema: str, sql: str) -> str:
    return llm(
        f"Does this SQL correctly answer the question given the schema? "
        f"Reply 'OK' or explain the problem.\n"
        f"Question: {question}\nSchema:\n{schema}\nSQL:\n{sql}"
    )

def generate_with_reflection(question: str, schema: str, max_rounds: int = 3) -> str:
    sql = generate_sql(question, schema)
    for _ in range(max_rounds):
        feedback = critique_sql(question, schema, sql)
        if feedback.strip().upper().startswith("OK"):
            break
        sql = llm(f"Fix this SQL based on the feedback.\nSQL:\n{sql}\nFeedback:\n{feedback}")
    return sql
```

**When to use it:** Output quality matters more than latency/cost, and there's a clear rubric a critic can check against (correctness, tone, completeness). Skip it for simple, low-stakes generations where a first draft is good enough — every reflection round is an extra LLM call.

## 5. Tool Use (MCP)

**How it works:** The agent doesn't just generate text — it can call external tools (a database, a search API, a calendar, an internal service) to fetch real data or take real actions, then incorporate the result into its next response. The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) standardizes this: an **MCP server** exposes a set of tools/resources over a common protocol, and any **MCP client** (embedded in the agent) can discover and call those tools without custom integration code per tool. This is what turns an agent from "a chatbot that talks about your data" into "a chatbot that can actually look at and act on your data."

![Tool use via MCP diagram: an agent asks an MCP client, which forwards the request to an MCP server that invokes a tool, and the result flows back to the agent](/assets/images/patterns/tool-use-mcp.svg)

**Example:** An agent answering "What's the status of order #4821?" doesn't know the answer from training data — it calls a `lookup_order` tool exposed by an MCP server connected to the orders database, gets back the real record, and uses that to compose its answer.

```python
# The agent asks the model which tool (if any) it wants to call.
def agent_step(user_message: str, mcp_client) -> str:
    available_tools = mcp_client.list_tools()  # discovered via MCP, not hardcoded
    decision = llm_with_tools(user_message, tools=available_tools)

    if decision.tool_call is None:
        return decision.text

    # MCP client forwards the call to whichever MCP server hosts that tool.
    result = mcp_client.call_tool(decision.tool_call.name, decision.tool_call.args)
    return llm(f"User asked: {user_message}\nTool result: {result}\nAnswer using this data.")
```

**When to use it:** The agent needs current, private, or actionable data that isn't in the model's training data — records, live metrics, the ability to send an email or create a ticket. Skip it for tasks that are pure reasoning/writing over information already in the prompt; adding tools you don't need adds latency and failure surface for no benefit.

## 6. Planning (Goal Decomposition)

**How it works:** Before doing any work, the agent first breaks a high-level goal into an explicit plan — a tree or list of sub-goals, and for at least one level, further decomposes those into concrete, executable steps. This planning step can happen once up front, or be revisited as sub-goals complete and new information changes what's needed. It's the difference between "figure it out step by step as you go" (which ReAct does reactively) and "lay out the whole approach before starting."

![Planning diagram: a top-level goal decomposes into three subgoals, and one subgoal further decomposes into two concrete leaf actions](/assets/images/patterns/planning-decomposition.svg)

**Example:** Given the goal "plan a product launch," the agent first decomposes it into subgoals (research the market, build the campaign, prepare launch day), and then decomposes "build the campaign" further into concrete actions (write copy, design assets) before any of those actions are actually executed.

```python
def make_plan(goal: str) -> list[str]:
    raw = llm(f"Break this goal into 3-5 ordered subgoals, one per line:\n{goal}")
    return [line.strip("- ") for line in raw.splitlines() if line.strip()]

def decompose_further(subgoal: str) -> list[str]:
    raw = llm(f"Break this subgoal into concrete, executable steps, one per line:\n{subgoal}")
    return [line.strip("- ") for line in raw.splitlines() if line.strip()]

def plan_goal(goal: str) -> dict[str, list[str]]:
    subgoals = make_plan(goal)
    return {sg: decompose_further(sg) for sg in subgoals}
```

**When to use it:** The task is complex enough that jumping straight into execution risks missing dependencies or doing things out of order — multi-step projects, research tasks, anything where "know the whole shape before you start" matters. Skip it for simple, single-step or highly reactive tasks, where planning is pure overhead.

## 7. ReAct (Reason + Act)

**How it works:** ReAct interleaves reasoning and acting in a tight loop: the agent produces a **Thought** (what should I do next, and why), takes an **Action** (usually a tool call), receives an **Observation** (the tool's result), and feeds that observation into the next Thought — repeating until it has enough information to give a final answer. Unlike Planning, which lays out steps up front, ReAct decides its next move one step at a time based on what it just learned, which makes it well-suited to tasks where you can't know the right next step until you see the previous result.

![ReAct diagram: an agent cycles continuously through Thought, Action, and Observation steps, using each observation to inform the next thought](/assets/images/patterns/react.svg)

**Example:** Answering "How much did we spend on cloud infra last quarter, and is that up or down from the prior quarter?" The agent thinks "I need this quarter's spend first," calls a `get_spend` tool, observes the number, thinks "now I need last quarter's number to compare," calls the tool again, observes that number, and only then reasons about the comparison and answers.

```python
def react_loop(question: str, tools: dict, max_steps: int = 6) -> str:
    scratchpad = f"Question: {question}\n"
    for _ in range(max_steps):
        step = llm(
            f"{scratchpad}\nThought: reason about the next step. "
            f"Then either call a tool as Action: <tool>(<args>) "
            f"or give Final Answer: <answer>."
        )
        if "Final Answer:" in step:
            return step.split("Final Answer:")[-1].strip()

        tool_name, tool_args = parse_action(step)
        observation = tools[tool_name](tool_args)
        scratchpad += f"{step}\nObservation: {observation}\n"
    return "Could not reach a final answer within the step budget."
```

**When to use it:** The task requires multiple tool calls where each next step genuinely depends on the previous result, and you can't fully plan it in advance. Skip it for single-tool-call tasks (that's just Tool Use) or fully known step sequences (that's Prompt Chaining or Planning) — ReAct's flexibility costs extra LLM calls per step.

## 8. Orchestrator-Workers

**How it works:** A central orchestrator agent analyzes the incoming task, decides how to break it into subtasks, dynamically dispatches those subtasks to worker agents (which may run in parallel), and synthesizes their results into a final answer. It looks similar to Parallelization, but the key difference is *who decides the split*: in Parallelization the sub-tasks are usually fixed ahead of time (e.g. "always run these three reviewers"), while in Orchestrator-Workers the orchestrator itself decides — at runtime, based on the specific input — how many workers to spin up and what each one should do.

![Orchestrator diagram: a central orchestrator dispatches subtasks to three workers and collects their results back](/assets/images/patterns/orchestrator.svg)

**Example:** A "research this topic" agent where the orchestrator reads the topic, decides it needs three angles of research (say, market size, competitors, and regulatory risk — a different split for a different topic), spins up a worker for each, and combines their findings into one report.

```python
def orchestrate(task: str) -> str:
    subtasks = llm(
        f"Break this research task into 2-4 independent subtasks a worker "
        f"could each research separately, one per line:\n{task}"
    ).splitlines()

    with concurrent.futures.ThreadPoolExecutor() as pool:
        results = list(pool.map(run_worker, subtasks))

    return llm(f"Synthesize these findings into one report:\n{results}")

def run_worker(subtask: str) -> str:
    return llm(f"Research and answer this subtask thoroughly:\n{subtask}")
```

**When to use it:** The subtasks aren't knowable in advance — they depend on the specific input — so a fixed pipeline won't fit every case, but you still want the parallelism/isolation benefits of dividing the work. Skip it when the same fixed decomposition works for every input; hardcode that split (plain Parallelization) instead of paying for an extra LLM call to "discover" it every time.

## 9. Evaluator-Optimizer

**How it works:** A generator produces a candidate solution, an evaluator scores it against explicit criteria and returns structured feedback (pass/fail plus reasons, or a numeric score), and — if it doesn't meet the bar — the generator revises using that feedback. This repeats until the evaluator accepts the result or a retry budget is exhausted. It looks like Reflection, but Evaluator-Optimizer is typically more structured: the evaluator applies a fixed, checkable rubric (tests pass, length under N words, matches required format) rather than open-ended critique, which makes it a good fit for tasks with a clear, verifiable definition of "good enough."

![Evaluator-Optimizer diagram: a generator produces a candidate, an evaluator scores it and sends it back for revision, and the score improves each pass until the candidate is accepted](/assets/images/patterns/evaluator-optimizer.svg)

**Example:** Generating a piece of code to pass a given unit test suite: the generator writes an implementation, the evaluator actually *runs the tests* (a deterministic, verifiable check — not another LLM opinion) and reports which ones failed, and the generator revises the implementation until all tests pass or a retry limit is hit.

```python
def generate_optimize(spec: str, tests: list[callable], max_attempts: int = 4) -> str:
    code = llm(f"Write a Python function that satisfies this spec:\n{spec}")

    for attempt in range(max_attempts):
        failures = run_tests(code, tests)
        if not failures:
            return code
        code = llm(
            f"This implementation failed these tests:\n{failures}\n"
            f"Fix the implementation:\n{code}"
        )
    return code  # return best-effort after exhausting the retry budget
```

**When to use it:** There's a clear, checkable success criterion (tests, a validator, a scoring rubric) and the cost of a few extra generate-evaluate rounds is worth the reliability gain. Skip it when "good enough" is subjective and there's no way to score a candidate objectively — that's a better fit for Reflection's open-ended critique.

## Choosing Between Them

| Pattern | Best-fit scenario | Key trade-off |
|---|---|---|
| Prompt Chaining | Task decomposes into a fixed sequence of steps | Extra latency/cost per chained call |
| Routing | A small number of distinct request categories | Misclassification sends requests down the wrong path |
| Parallelization | Independent sub-tasks, latency-sensitive or want ensemble views | Only helps when sub-tasks truly don't depend on each other |
| Reflection | Quality matters more than speed; a critic can meaningfully judge | Each round is another full LLM call; can loop without converging |
| Tool Use (MCP) | Needs live/private data or the ability to take real actions | Added latency and a new failure surface (tool errors, auth) |
| Planning (Goal Decomposition) | Complex, multi-step goals where order/dependencies matter | Planning overhead is wasted on simple, single-step tasks |
| ReAct | Multi-step tool use where each step depends on the last result | More LLM calls than a pre-planned sequence; can loop or stall |
| Orchestrator-Workers | Subtask split can't be known until you see the specific input | Extra LLM call just to decide how to decompose the task |
| Evaluator-Optimizer | A clear, checkable success criterion exists | Doesn't help when "good enough" can't be scored objectively |

Most real agentic systems combine several of these rather than picking exactly one — a Router might send a request to an Orchestrator, whose workers each run a ReAct loop with Tool Use, with an Evaluator-Optimizer pass at the end to check the final answer against a rubric. Start from the simplest pattern that solves the problem, and only add another layer when you can point to the specific failure it fixes.

## Sources

- [ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al., 2022)](https://arxiv.org/abs/2210.03629)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/research/building-effective-agents)
- [Model Context Protocol — specification](https://modelcontextprotocol.io/)
- [Agentic Design Patterns (Google Cloud / Vertex AI blog)](https://cloud.google.com/discover/what-are-ai-agents)
- [Reflexion: Language Agents with Verbal Reinforcement Learning (Shinn et al., 2023)](https://arxiv.org/abs/2303.11366)
