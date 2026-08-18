---
title: "AI Agent Design Patterns: ReAct, Routing, Planning, and More"
date: 2026-08-17
topic: ai
tags: [AI Agents, LLM Patterns, MCP, Agentic AI]
excerpt: "An examination of nine core AI agent design patterns — Prompt Chaining, Routing, Parallelization, Reflection, Tool Use (MCP), Planning, ReAct, Orchestrator, and Evaluator-Optimizer — each explained with a worked example, code sketch, and animated diagram."
---

## Introduction

Most systems described as "AI agents" are built from a small set of recurring control-flow patterns layered around a large language model: chaining steps together, routing to a specialist, fanning work out and back in, having the model critique its own output, invoking a tool, decomposing a goal into sub-goals, or looping until a check passes. Recognizing which pattern a problem calls for makes it possible to choose the simplest effective design, rather than defaulting to a heavyweight "autonomous agent" architecture for every task.

This article examines nine patterns that recur throughout agentic system design:

1. [Prompt Chaining](#1-prompt-chaining)
2. [Routing](#2-routing)
3. [Parallelization](#3-parallelization)
4. [Reflection](#4-reflection)
5. [Tool Use (MCP)](#5-tool-use-mcp)
6. [Planning (Goal Decomposition)](#6-planning-goal-decomposition)
7. [ReAct (Reason + Act)](#7-react-reason--act)
8. [Orchestrator-Workers](#8-orchestrator-workers)
9. [Evaluator-Optimizer](#9-evaluator-optimizer)

A note on the code samples: each snippet is written as framework-agnostic, pseudocode-style Python — plain functions that call an `llm(prompt)` helper and, where relevant, a `call_tool(name, args)` helper. The intent is to illustrate the shape of the control flow rather than to provide a production-ready integration with any particular SDK.

## 1. Prompt Chaining

**How it works:** The task is decomposed into an ordered sequence of smaller LLM calls, where each step's output becomes the next step's input. Because each step has a narrow, well-defined objective, it is easier to prompt accurately, validate, and debug than a single prompt attempting to handle the entire task. A programmatic check can optionally be inserted between steps — a schema check, a regular expression, a length limit — to fail fast before an unnecessary downstream call is made.

![Prompt chaining diagram: a request flows through Extract, Summarize, and Draft stages to produce an output](/assets/images/patterns/prompt-chaining.svg)

**Example:** Converting a long customer email into a reply. The first step extracts the key facts (order number, complaint, sentiment); the second summarizes those facts into a one-paragraph brief; the third drafts a reply from that brief. Each step is a small, focused prompt rather than a single prompt attempting to read, reason, and write in one pass.

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

**When to use it:** Apply this pattern when a task naturally decomposes into sequential sub-steps, each step benefits from a focused prompt, and validation gates between steps are valuable. Avoid it when a single well-crafted prompt already performs reliably — each additional link in the chain adds latency and cost.

## 2. Routing

**How it works:** A lightweight classification step — often a small, low-cost LLM call, sometimes a rules-based engine — examines the incoming request and determines which specialized downstream path (a specific prompt, tool, or agent) should handle it. Routing keeps each downstream path simple and focused, rather than requiring a single prompt to handle every possible request type.

![Routing diagram: a router node classifies each request and sends it to one of three specialist agents, alternating between them over time](/assets/images/patterns/routing.svg)

**Example:** In a support inbox, a router reads each incoming ticket and directs billing questions to a "billing specialist" prompt equipped with billing FAQs and account-lookup tools, technical questions to a "technical specialist" prompt equipped with documentation and diagnostic tools, and all other requests to a general-purpose assistant.

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

**When to use it:** Apply this pattern when requests fall into a small number of distinct categories, each best served by a different prompt, tool set, or model — for example, a lower-cost model for simple cases and a stronger model for complex ones. Avoid it when requests are largely homogeneous, since routing then adds a classification call without a corresponding benefit.

## 3. Parallelization

**How it works:** A task is split into independent sub-tasks, which are run concurrently against the LLM (or across different models or prompts) and then merged into a single result. Two common variants are *sectioning*, where each sub-task addresses a different part of the problem (such as reviewing different files), and *voting*, where the same sub-task is run multiple times to produce an ensemble of independent judgments. Because the sub-tasks do not depend on one another, running them in parallel reduces overall latency compared to executing them sequentially.

![Parallelization diagram: a task fans out to three workers running at the same time, whose results are merged by an aggregator](/assets/images/patterns/parallelization.svg)

**Example:** Reviewing a pull request by running three independent LLM calls concurrently — one focused on security, one on performance, and one on style and readability — then merging the three sets of findings into a single review comment.

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

**When to use it:** Apply this pattern when sub-tasks are genuinely independent — none requires another's output — and either latency is a concern or multiple independent perspectives on the same input are valuable. Avoid it when steps depend on one another's output; that scenario calls for prompt chaining, not parallelization.

## 4. Reflection

**How it works:** After a generator produces a draft, a separate critic step — which may use the same model with a different prompt, or an entirely different model — reviews the draft against a rubric and returns feedback. The generator then revises based on that feedback, and the cycle repeats, typically for a fixed number of rounds or until the critic reports no further issues. Separating the writing step from the review step tends to catch errors that a single generation pass misses, since critiquing existing output is generally an easier task than producing it from scratch.

![Reflection diagram: a generator drafts an answer, a critic reviews it and sends feedback back, and the cycle repeats until the answer is good enough](/assets/images/patterns/reflection.svg)

**Example:** Generating a SQL query from a natural-language question, then having a critic step verify the query against the schema and the original question for correctness, looping back to correct it whenever the critic identifies an issue.

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

**When to use it:** Apply this pattern when output quality matters more than latency or cost, and a clear rubric exists for the critic to evaluate against — correctness, tone, completeness. Avoid it for simple, low-stakes generations where a first draft is sufficient, since every reflection round adds an additional LLM call.

## 5. Tool Use (MCP)

**How it works:** Rather than generating text alone, the agent can call external tools — a database, a search API, a calendar, an internal service — to retrieve current data or perform real actions, then incorporate the result into its next response. The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) standardizes this interaction: an **MCP server** exposes a set of tools and resources over a common protocol, and any **MCP client** embedded in the agent can discover and invoke those tools without custom integration code for each one. This is what distinguishes an agent that merely discusses an organization's data from one that can actually inspect and act on it.

![Tool use via MCP diagram: an agent asks an MCP client, which forwards the request to an MCP server that invokes a tool, and the result flows back to the agent](/assets/images/patterns/tool-use-mcp.svg)

**Example:** An agent answering "What is the status of order #4821?" has no way to know the answer from its training data. It calls a `lookup_order` tool exposed by an MCP server connected to the orders database, receives the current record, and uses that data to compose its answer.

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

**When to use it:** Apply this pattern when the agent needs current, private, or actionable data that is not present in the model's training data — records, live metrics, or the ability to send an email or open a ticket. Avoid it for tasks that are pure reasoning or writing over information already present in the prompt; unnecessary tools add latency and failure surface without a corresponding benefit.

## 6. Planning (Goal Decomposition)

**How it works:** Before any work begins, the agent first decomposes a high-level goal into an explicit plan — a tree or list of sub-goals, with at least one level further broken down into concrete, executable steps. This planning step may occur once at the outset, or be revisited as sub-goals are completed and new information changes what remains necessary. The distinction from ReAct, which determines its next step reactively, is that planning lays out the full approach before execution begins.

![Planning diagram: a top-level goal decomposes into three subgoals, and one subgoal further decomposes into two concrete leaf actions](/assets/images/patterns/planning-decomposition.svg)

**Example:** Given the goal "plan a product launch," the agent first decomposes it into subgoals — research the market, build the campaign, prepare launch day — and then further decomposes "build the campaign" into concrete actions, such as writing copy and designing assets, before any action is executed.

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

**When to use it:** Apply this pattern when a task is complex enough that proceeding directly to execution risks missing dependencies or performing steps out of order — multi-step projects, research tasks, or any scenario where understanding the full scope before beginning is important. Avoid it for simple, single-step, or highly reactive tasks, where the planning step is pure overhead.

## 7. ReAct (Reason + Act)

**How it works:** ReAct interleaves reasoning and acting in a tight loop: the agent produces a **Thought** (a determination of what to do next and why), takes an **Action** (typically a tool call), receives an **Observation** (the tool's result), and feeds that observation into the next Thought — repeating until it has sufficient information to produce a final answer. Unlike Planning, which lays out steps in advance, ReAct determines its next move one step at a time based on what it has just learned, making it well-suited to tasks where the correct next step cannot be known until the previous result is observed.

![ReAct diagram: an agent cycles continuously through Thought, Action, and Observation steps, using each observation to inform the next thought](/assets/images/patterns/react.svg)

**Example:** Answering "How much did we spend on cloud infrastructure last quarter, and is that up or down from the prior quarter?" The agent first reasons that it needs the current quarter's spend, calls a `get_spend` tool, and observes the result; it then reasons that it needs the prior quarter's figure for comparison, calls the tool again, and observes that result — only then reasoning about the comparison and producing an answer.

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

**When to use it:** Apply this pattern when a task requires multiple tool calls where each step genuinely depends on the previous result, such that it cannot be fully planned in advance. Avoid it for single-tool-call tasks (a plain Tool Use pattern suffices) or fully known step sequences (Prompt Chaining or Planning is more appropriate) — ReAct's flexibility comes at the cost of additional LLM calls per step.

## 8. Orchestrator-Workers

**How it works:** A central orchestrator agent analyzes the incoming task, determines how to divide it into subtasks, dynamically dispatches those subtasks to worker agents (which may run in parallel), and synthesizes their results into a final answer. This resembles Parallelization, but the key distinction is *who determines the division of work*: in Parallelization, sub-tasks are typically fixed in advance (for example, "always run these three reviewers"), whereas in Orchestrator-Workers, the orchestrator itself decides at runtime — based on the specific input — how many workers to instantiate and what each should do.

![Orchestrator diagram: a central orchestrator dispatches subtasks to three workers and collects their results back](/assets/images/patterns/orchestrator.svg)

**Example:** A research agent in which the orchestrator reads the topic, determines that three angles of research are needed — for example, market size, competitors, and regulatory risk, with a different division for a different topic — instantiates a worker for each, and combines their findings into a single report.

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

**When to use it:** Apply this pattern when the required subtasks cannot be known in advance — they depend on the specific input — such that a fixed pipeline will not fit every case, while the parallelism and isolation benefits of dividing the work are still desired. Avoid it when the same fixed decomposition works for every input; in that case, hardcode the split as plain Parallelization rather than paying for an additional LLM call to determine it each time.

## 9. Evaluator-Optimizer

**How it works:** A generator produces a candidate solution, an evaluator scores it against explicit criteria and returns structured feedback — a pass/fail determination with reasons, or a numeric score — and, if the candidate does not meet the bar, the generator revises it using that feedback. This repeats until the evaluator accepts the result or a retry budget is exhausted. The pattern resembles Reflection, but is typically more structured: the evaluator applies a fixed, checkable rubric — tests pass, length under a specified limit, format compliance — rather than open-ended critique, making it well-suited to tasks with a clear, verifiable definition of success.

![Evaluator-Optimizer diagram: a generator produces a candidate, an evaluator scores it and sends it back for revision, and the score improves each pass until the candidate is accepted](/assets/images/patterns/evaluator-optimizer.svg)

**Example:** Generating code to pass a given unit test suite: the generator writes an implementation, the evaluator runs the tests — a deterministic, verifiable check rather than a further LLM judgment — and reports which ones failed, and the generator revises the implementation until all tests pass or a retry limit is reached.

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

**When to use it:** Apply this pattern when a clear, checkable success criterion exists — tests, a validator, a scoring rubric — and the cost of additional generate-evaluate rounds is justified by the reliability gained. Avoid it when "good enough" is subjective and no candidate can be scored objectively; Reflection's open-ended critique is better suited to that case.

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

Most production agentic systems combine several of these patterns rather than relying on a single one — for example, a Router might direct a request to an Orchestrator, whose workers each run a ReAct loop incorporating Tool Use, with an Evaluator-Optimizer pass applied at the end to check the final answer against a rubric. The recommended approach is to begin with the simplest pattern that solves the problem, adding further layers only when a specific, identifiable failure justifies the added complexity.

## Sources

- [ReAct: Synergizing Reasoning and Acting in Language Models (Yao et al., 2022)](https://arxiv.org/abs/2210.03629)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/research/building-effective-agents)
- [Model Context Protocol — specification](https://modelcontextprotocol.io/)
- [Agentic Design Patterns (Google Cloud / Vertex AI blog)](https://cloud.google.com/discover/what-are-ai-agents)
- [Reflexion: Language Agents with Verbal Reinforcement Learning (Shinn et al., 2023)](https://arxiv.org/abs/2303.11366)
