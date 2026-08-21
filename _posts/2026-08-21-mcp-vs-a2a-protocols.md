---
title: "MCP vs A2A: Model Context Protocol and Agent2Agent Protocol Explained"
date: 2026-08-21
topic: ai
tags: [MCP, A2A, AI Agents, Protocols, Agentic AI, Observability]
excerpt: "A practical guide to the Model Context Protocol (MCP) and Agent2Agent (A2A) protocol — how each works, their pros and cons, and how to secure them, add observability, and capture usage metrics in production."
---

## Introduction

Two open protocols have emerged as the plumbing for production agentic systems, and they solve different problems. The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) standardizes how an agent talks *down* to tools, data sources, and services. The [Agent2Agent Protocol (A2A)](https://a2a-protocol.org/) standardizes how an agent talks *across* to other, independently built agents. Confusing the two — or trying to make one do the other's job — is a common source of over-engineered agent architectures.

This article covers:

1. [What is MCP](#what-is-mcp)
2. [What is A2A](#what-is-a2a)
3. [MCP vs A2A at a Glance](#mcp-vs-a2a-at-a-glance)
4. [Securing MCP and A2A](#securing-mcp-and-a2a)
5. [Adding Observability](#adding-observability)
6. [Capturing Usage Metrics](#capturing-usage-metrics)
7. [Choosing Between Them](#choosing-between-them)

## What is MCP

**How it works:** MCP follows a client-host-server architecture. The **host** is the AI application itself — an IDE, a desktop assistant, an orchestration service — and it creates one **MCP client** for each **MCP server** it wants to talk to. Each client maintains exactly one connection to its server. A server is a focused program that exposes **tools** (actions the agent can invoke), **resources** (data the agent can read), and **prompts** (reusable prompt templates) — it can run locally as a subprocess over STDIO, or remotely over Streamable HTTP with Server-Sent Events for streaming. Every request carries its own protocol version and declared capabilities, so clients and servers negotiate what they support before doing anything else, rather than assuming a fixed feature set.

![MCP architecture diagram: a host manages two MCP clients, each holding one connection to its own MCP server, which exposes tools, resources, and prompts back to the host](/assets/images/patterns/mcp-architecture.svg)

**Example:** An IDE assistant (the host) opens one MCP client connected to a local filesystem server over STDIO, and a second MCP client connected to a remote Jira server over HTTP. When the user asks "what's blocking ticket ENG-412," the host's LLM decides it needs the `get_issue` tool, and the appropriate client forwards that call to the Jira server without the host needing any Jira-specific integration code.

```python
def agent_step(user_message: str, mcp_client) -> str:
    available_tools = mcp_client.list_tools()  # discovered via MCP, not hardcoded
    decision = llm_with_tools(user_message, tools=available_tools)

    if decision.tool_call is None:
        return decision.text

    result = mcp_client.call_tool(decision.tool_call.name, decision.tool_call.args)
    return llm(f"User asked: {user_message}\nTool result: {result}\nAnswer using this data.")
```

**Pros:**
- Removes N×M integration pain — a server is written once and any MCP-compatible host can use it, rather than every host writing a bespoke connector per tool.
- Capability negotiation and a stateless core keep the protocol simple to implement and easy to scale behind ordinary HTTP infrastructure.
- A large, fast-growing ecosystem of ready-made servers (filesystem, databases, SaaS APIs) means many integrations require no custom server code at all.
- The host retains a single point of policy enforcement — consent, permissions, and connection lifecycle — across every server it connects to.

**Cons:**
- MCP describes agent-to-tool access, not agent-to-agent collaboration; using it to wire independent agents together requires bolting on conventions the spec doesn't define.
- A malicious or careless server can return crafted tool descriptions or results that attempt to manipulate the host's LLM (`tool poisoning` / indirect prompt injection) — the protocol does not police the content servers return.
- Remote, multi-server deployments add real operational surface: OAuth flows per server, token scoping, and transport choice all need deliberate setup rather than working out of the box.
- Being new and still evolving (the spec has shipped several backward-incompatible authorization revisions), client and server implementations can drift out of sync on optional features.

## What is A2A

**How it works:** A2A defines communication between a **client agent**, which formulates and sends work, and a **remote agent**, which acts on it. Discovery happens through an **Agent Card** — a JSON manifest, conventionally served at `/.well-known/agent.json`, that advertises the remote agent's skills, supported input/output modes, and required security schemes, the same way an OpenAPI document describes a REST API. Once a client agent has fetched the card, it communicates over JSON-RPC 2.0 (typically over HTTPS), submitting a **Task** — a stateful unit of work identified by a unique ID that progresses through states such as `submitted`, `working`, `input-required`, and a terminal state (`completed`, `failed`, `canceled`, or `rejected`). Long-running tasks can be tracked via polling, Server-Sent Events streaming, or push notifications, and a completed task's output is returned as one or more **artifacts**. Crucially, A2A treats each agent as opaque: a remote agent's internal memory, prompts, and tools are never exposed — only its declared skills and the task's inputs and outputs cross the wire.

![A2A diagram: a client agent fetches a remote agent's Agent Card to discover its skills and auth requirements, sends it a task, and the remote agent runs the task and returns an artifact](/assets/images/patterns/a2a-architecture.svg)

**Example:** A procurement agent (client) needs a vendor risk check performed by a separate, third-party-hosted compliance agent. It fetches the compliance agent's Agent Card, confirms it supports a `vendor-risk-check` skill and OAuth2 authentication, then submits a task with the vendor's details. The compliance agent may take minutes to run its checks; the client polls the task's status until it reaches `completed` and reads the resulting risk report as the returned artifact — without ever knowing what model, tools, or logic the compliance agent used internally.

```python
def run_remote_check(client_agent, agent_card_url: str, payload: dict) -> dict:
    agent_card = client_agent.fetch_agent_card(agent_card_url)  # capabilities + auth scheme
    task = client_agent.send_task(agent_card, skill="vendor-risk-check", input=payload)

    while task.status not in ("completed", "failed", "canceled", "rejected"):
        task = client_agent.get_task(task.id)  # poll, or subscribe via SSE/push instead

    if task.status != "completed":
        raise RuntimeError(f"remote task ended in {task.status}")
    return task.artifacts[0]
```

**Pros:**
- Purpose-built for cross-vendor, cross-framework agent collaboration — two agents built on entirely different stacks can interoperate as long as both speak A2A.
- The Task/Artifact model natively supports long-running, asynchronous work with status polling, streaming, and push notifications, rather than forcing everything into a synchronous request/response call.
- Opacity is a deliberate design goal: a remote agent's internal reasoning, tools, and data never need to be exposed, which protects intellectual property and reduces the vendor's attack surface.
- Security is designed in from the start via the Agent Card's declared `securitySchemes` (OAuth2, OIDC, API keys, mTLS), reusing standard web-security patterns rather than inventing new ones.

**Cons:**
- Overhead is wasted when agents don't have a genuine trust/organizational boundary between them — calling a function in the same process doesn't need a Task lifecycle and JSON-RPC round trip.
- A2A is a communication protocol, not a security architecture; identity, delegation tracking, and audit trails have to be designed and operated around it, not assumed from adopting it.
- As a newer, evolving standard, tooling, SDKs, and production operational experience are less mature than for long-established RPC or messaging protocols.
- Opacity cuts both ways — the client agent has no visibility into *why* a remote agent produced a given artifact, which complicates debugging and root-cause analysis across agent boundaries.

## MCP vs A2A at a Glance

| | MCP | A2A |
|---|---|---|
| **Purpose** | Agent-to-tool / agent-to-data access | Agent-to-agent collaboration |
| **Relationship** | Host with clients, each bound to one server | Client agent and one or more remote agents |
| **Transport** | STDIO (local) or Streamable HTTP + SSE (remote) | JSON-RPC 2.0 over HTTPS; SSE or push for async updates |
| **State model** | Stateless core; capability negotiation per request | Stateful `Task` with an explicit lifecycle |
| **Discovery** | Server capability declaration on connect | Agent Card at a well-known URL |
| **Best fit** | Giving one agent structured access to tools/data | Letting independent agents delegate work to each other |

![MCP and A2A used together diagram: an orchestrator agent talks to two peer agents over A2A, and each peer agent calls its own MCP server to use tools](/assets/images/patterns/mcp-a2a-together.svg)

The two protocols are complementary rather than competing. A common production shape is an orchestrator agent that uses A2A to delegate subtasks to peer agents — potentially built by different teams or vendors — while each of those peer agents independently uses MCP to reach the tools and data it personally needs to do its job.

## Securing MCP and A2A

### Securing MCP

- **Use OAuth 2.1 with mandatory PKCE for any remote server.** MCP servers act only as OAuth *resource servers* — they validate bearer tokens but delegate authentication and token issuance to a separate authorization server, discovered via Protected Resource Metadata (RFC 9728).
- **Scope tokens to the specific server with resource indicators (RFC 8707)**, and reject any token whose audience claim doesn't name your server. Never pass a token you received from a client through unmodified to an upstream API — if your server calls an upstream service, obtain a separate token for that call.
- **Treat STDIO servers as locally trusted, not unauthenticated.** A local server still runs with the host's privileges, so scope its filesystem/process access as narrowly as the task requires.
- **Defend against tool poisoning and indirect prompt injection.** Treat tool descriptions and tool results returned by any server — especially third-party ones — as untrusted input to the LLM, the same way you'd treat any other unvalidated text reaching a prompt.
- **Apply least privilege per tool**, not per server: a server that exposes ten tools shouldn't grant blanket access to all ten just because the connection was authorized.

### Securing A2A

- **Declare and enforce the Agent Card's `securitySchemes`** — OAuth2, OpenID Connect, API keys, or mutual TLS — and reject any task submission that doesn't satisfy the scheme the card advertises.
- **Scope authorization to individual skills**, not to the agent as a whole, so a credential that can invoke one skill can't silently invoke every skill the agent exposes.
- **Treat every inbound message as potentially hostile**, including from agents you've previously trusted — a compromised or misconfigured peer agent can submit malformed or malicious task payloads.
- **Track delegation chains and keep task-level audit logs.** When agent A delegates to agent B, which delegates to agent C, you need to be able to reconstruct that chain after the fact, particularly for any action with real-world side effects.
- **Require human approval for high-risk actions** initiated through a task, and validate artifact provenance before an artifact from a remote agent is acted on downstream.

### Shared best practices

| Practice | Applies to |
|---|---|
| Allowlist which tools/skills/servers/agents a given deployment may reach | Both |
| Store credentials and tokens in a secrets manager, never in prompts or logs | Both |
| Validate and sanitize both inputs sent out and outputs received back | Both |
| Rate-limit per caller/tool/skill to contain a runaway or compromised agent | Both |
| Use short-lived, narrowly scoped tokens over long-lived static credentials | Both |

## Adding Observability

Both protocols cross a process (and often an organizational) boundary on every call, which makes them exactly the kind of hop that disappears from view without deliberate instrumentation.

- **Propagate a correlation ID / trace context on every hop.** For MCP, that means the host's trace ID should flow through the client into the server and back; for A2A, the client agent's trace context should travel with the Task so that every status update and artifact can be tied back to the originating request.
- **Emit an OpenTelemetry span per MCP tool call and per A2A task.** A span boundary at "one tool invocation" or "one task from submission to terminal state" maps cleanly onto how failures and latency actually show up in production.
- **Record span events for state transitions**, not just start/end — an A2A task moving into `input-required` or an MCP server returning a partial/streamed result are meaningful events worth capturing individually rather than only measuring total duration.
- **Centralize logs and traces from every server/agent you don't own** alongside your own, even if that means running a lightweight collector next to each one — visibility into a third-party MCP server or remote A2A agent is where blind spots are most common.

| Span attribute | MCP example | A2A example |
|---|---|---|
| Operation | `tool.call` | `task.lifecycle` |
| Target identity | `mcp.server.name`, `mcp.tool.name` | `a2a.agent.card_url`, `a2a.skill` |
| Correlation | `trace_id` propagated from host | `trace_id` propagated with task |
| Outcome | tool result status / error code | terminal task state (`completed`/`failed`/...) |
| Duration | single call latency | full task duration + per-status-update latency |

## Capturing Usage Metrics

Usage metrics answer a different question than traces do: not "what happened on this one call" but "how is this integration behaving in aggregate, and what is it costing." At minimum, capture:

| Metric | Why it matters |
|---|---|
| Call/task volume (per tool, per server, per skill, per agent) | Baseline for capacity planning and anomaly detection |
| Latency (p50/p95/p99) | Catches slow tools/agents before they degrade the overall agent experience |
| Success / error rate | Surfaces flaky servers, misconfigured auth, or a remote agent that's silently failing tasks |
| Token usage and cost per call/task | Attributes spend to the specific tool, server, skill, or agent driving it |
| Task-state distribution (A2A) | Shows how often tasks land in `input-required` or fail vs. complete cleanly |
| Retry / timeout counts | Early warning of an unreliable dependency before users notice |

Two practical ways to collect these:

- **Emit OpenTelemetry metrics from the host/client agent** at each MCP call or A2A task boundary, and ship them to a backend such as Prometheus + Grafana or your existing observability stack — this keeps metrics next to the traces described above and uses the same instrumentation investment.
- **Meter at a gateway layer** in front of your MCP servers and A2A agents, the same way an [AI gateway](/2026/08/04/ai-gateway-landscape-comparison.html) already meters LLM calls — a gateway gives you a single point to enforce rate limits, capture per-caller usage, and aggregate cost without instrumenting every server or agent individually.

## Choosing Between Them

Use MCP when an agent needs structured access to tools, files, databases, or SaaS APIs — anything where the relationship is "agent uses a resource." Use A2A when independent agents, potentially built by different teams or vendors, need to discover each other and delegate real work — anything where the relationship is "agent asks another agent to do something." Most non-trivial production systems end up using both: A2A at the boundary between agents, and MCP at the boundary between each individual agent and the tools it personally relies on. Start with whichever boundary your system actually has today, and avoid introducing the other protocol until a second, genuinely distinct boundary appears.

## Sources

- [Model Context Protocol — Architecture](https://modelcontextprotocol.io/specification/2026-07-28/architecture)
- [Model Context Protocol — Authorization](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/authorization)
- [Model Context Protocol — Authorization Security Considerations](https://modelcontextprotocol.io/specification/draft/basic/authorization/security-considerations)
- [The 2026-07-28 MCP Specification Release Candidate (MCP Blog)](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
- [Announcing the Agent2Agent Protocol (Google Developers Blog)](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
- [A2A Protocol — Specification Overview](https://a2a-protocol.org/latest/specification/)
- [a2aproject/A2A (GitHub)](https://github.com/a2aproject/A2A)
- [Build a Cross-Language Multi-Agent Team with ADK and A2A (Google Developers Blog)](https://developers.googleblog.com/build-cross-language-multi-agent-team-with-google-agent-development-kit-and-a2a/)
