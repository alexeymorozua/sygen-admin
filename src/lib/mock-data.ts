export interface Agent {
  id: string;
  name: string;
  displayName: string;
  model: string;
  provider: string;
  status: "online" | "offline" | "error";
  sessions: number;
  lastActive: string;
  description: string;
  allowedUsers: string[];
  hasAvatar?: boolean;
  additionalDirectories: string[];
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  agent: string;
  status: "active" | "paused" | "error";
  lastRun: string;
  nextRun: string;
  description: string;
  executionCount: number;
  avgDuration: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  method: string;
  agent: string;
  status: "active" | "paused" | "error";
  lastTriggered: string;
  triggerCount: number;
  description: string;
  secret?: string;
}

export interface Task {
  id: string;
  name: string;
  status: "running" | "completed" | "failed" | "cancelled";
  agent: string;
  provider: string;
  startedAt: string;
  duration: string;
  description: string;
  result?: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  agentId?: string;
  content: string;
  timestamp: string;
}

export interface MemoryModule {
  id: string;
  name: string;
  filename: string;
  type: "main" | "shared" | "agent";
  lastModified: string;
  size: string;
  lines?: number;
  content: string;
}

export interface ActivityEvent {
  id: string;
  type: "agent" | "cron" | "webhook" | "task" | "system" | "login";
  message: string;
  timestamp: string;
  agent?: string;
  details?: string;
}

export interface SystemHealth {
  instanceName?: string;
  cpu: number;
  ram: number;
  disk: number;
  uptime: string;
}

// --- Mock Data ---

export const mockAgents: Agent[] = [
  {
    id: "main",
    name: "main",
    displayName: "Sygen Main",
    model: "claude-opus-4-6",
    provider: "anthropic",
    status: "online",
    sessions: 3,
    lastActive: "2026-04-14T10:30:00Z",
    description: "Primary coordinator agent. Handles user interactions and delegates tasks.",
    allowedUsers: ["alexeymorozua"],
    additionalDirectories: [],
  },
  {
    id: "prism",
    name: "prism",
    displayName: "Prism",
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    status: "online",
    sessions: 1,
    lastActive: "2026-04-14T09:15:00Z",
    description: "Code analysis and refactoring specialist.",
    allowedUsers: ["alexeymorozua"],
    additionalDirectories: [],
  },
  {
    id: "nexus",
    name: "nexus",
    displayName: "Nexus",
    model: "gemini-2.5-pro",
    provider: "google",
    status: "online",
    sessions: 2,
    lastActive: "2026-04-14T10:00:00Z",
    description: "Research and deep analysis agent with web access.",
    allowedUsers: ["alexeymorozua"],
    additionalDirectories: [],
  },
  {
    id: "canvas",
    name: "canvas",
    displayName: "Canvas",
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    status: "offline",
    sessions: 0,
    lastActive: "2026-04-13T18:45:00Z",
    description: "Creative content generation and design assistant.",
    allowedUsers: ["alexeymorozua"],
    additionalDirectories: [],
  },
  {
    id: "clowder",
    name: "clowder",
    displayName: "Clowder",
    model: "gpt-4o",
    provider: "openai",
    status: "online",
    sessions: 1,
    lastActive: "2026-04-14T08:30:00Z",
    description: "Multi-model orchestration and comparison agent.",
    allowedUsers: ["alexeymorozua"],
    additionalDirectories: [],
  },
  {
    id: "sonic",
    name: "sonic",
    displayName: "Sonic",
    model: "claude-haiku-4-5",
    provider: "anthropic",
    status: "error",
    sessions: 0,
    lastActive: "2026-04-14T07:00:00Z",
    description: "Fast response agent for quick lookups and simple tasks.",
    allowedUsers: ["alexeymorozua"],
    additionalDirectories: [],
  },
];

export const mockCronJobs: CronJob[] = [
  {
    id: "cron-001",
    name: "Daily News Digest",
    schedule: "0 8 * * *",
    agent: "nexus",
    status: "active",
    lastRun: "2026-04-14T08:00:00Z",
    nextRun: "2026-04-15T08:00:00Z",
    description: "Fetches and summarizes top tech news every morning.",
    executionCount: 142,
    avgDuration: "45s",
  },
  {
    id: "cron-002",
    name: "System Health Check",
    schedule: "*/30 * * * *",
    agent: "main",
    status: "active",
    lastRun: "2026-04-14T10:30:00Z",
    nextRun: "2026-04-14T11:00:00Z",
    description: "Monitors system resources and alerts on anomalies.",
    executionCount: 1024,
    avgDuration: "12s",
  },
  {
    id: "cron-003",
    name: "Memory Cleanup",
    schedule: "0 3 * * 0",
    agent: "main",
    status: "active",
    lastRun: "2026-04-13T03:00:00Z",
    nextRun: "2026-04-20T03:00:00Z",
    description: "Removes stale memory entries and optimizes storage.",
    executionCount: 28,
    avgDuration: "2m 15s",
  },
  {
    id: "cron-004",
    name: "Backup Workspace",
    schedule: "0 2 * * *",
    agent: "main",
    status: "paused",
    lastRun: "2026-04-12T02:00:00Z",
    nextRun: "-",
    description: "Creates incremental backups of the workspace directory.",
    executionCount: 89,
    avgDuration: "3m 40s",
  },
  {
    id: "cron-005",
    name: "GitHub PR Monitor",
    schedule: "*/15 * * * *",
    agent: "prism",
    status: "active",
    lastRun: "2026-04-14T10:15:00Z",
    nextRun: "2026-04-14T10:30:00Z",
    description: "Checks for new PRs and runs automated review.",
    executionCount: 567,
    avgDuration: "30s",
  },
  {
    id: "cron-006",
    name: "API Rate Limiter Reset",
    schedule: "0 0 * * *",
    agent: "clowder",
    status: "error",
    lastRun: "2026-04-14T00:00:00Z",
    nextRun: "2026-04-15T00:00:00Z",
    description: "Resets daily API rate limit counters for all providers.",
    executionCount: 104,
    avgDuration: "5s",
  },
];

export const mockWebhooks: Webhook[] = [
  {
    id: "wh-001",
    name: "GitHub Push Handler",
    url: "/webhooks/github-push",
    method: "POST",
    agent: "prism",
    status: "active",
    lastTriggered: "2026-04-14T09:45:00Z",
    triggerCount: 234,
    description: "Triggers code review on push to monitored repositories.",
  },
  {
    id: "wh-002",
    name: "Telegram File Upload",
    url: "/webhooks/telegram-file",
    method: "POST",
    agent: "main",
    status: "active",
    lastTriggered: "2026-04-14T10:20:00Z",
    triggerCount: 89,
    description: "Processes files uploaded via Telegram.",
  },
  {
    id: "wh-003",
    name: "Stripe Payment Notification",
    url: "/webhooks/stripe",
    method: "POST",
    agent: "nexus",
    status: "paused",
    lastTriggered: "2026-04-10T14:30:00Z",
    triggerCount: 12,
    description: "Handles payment and subscription events from Stripe.",
  },
  {
    id: "wh-004",
    name: "Health Ping",
    url: "/webhooks/health",
    method: "GET",
    agent: "main",
    status: "active",
    lastTriggered: "2026-04-14T10:35:00Z",
    triggerCount: 8640,
    description: "External uptime monitoring endpoint.",
  },
];

export const mockTasks: Task[] = [
  {
    id: "task-815a2014",
    name: "Sygen Admin Panel Frontend",
    status: "running",
    agent: "main",
    provider: "anthropic",
    startedAt: "2026-04-14T10:00:00Z",
    duration: "35m",
    description: "Build the complete Next.js admin panel for Sygen.",
  },
  {
    id: "task-a1b2c3d4",
    name: "Flight Search Paris",
    status: "completed",
    agent: "nexus",
    provider: "google",
    startedAt: "2026-04-14T08:15:00Z",
    duration: "2m 30s",
    description: "Search for flights to Paris in June from Frankfurt.",
    result: "Found 12 flights. Best: Lufthansa LH1054, EUR 189, 1h 15m direct.",
  },
  {
    id: "task-e5f6g7h8",
    name: "Code Review PR #42",
    status: "completed",
    agent: "prism",
    provider: "anthropic",
    startedAt: "2026-04-14T09:00:00Z",
    duration: "1m 45s",
    description: "Review pull request #42 for security issues and code quality.",
    result: "2 issues found: SQL injection risk in query builder, missing input validation.",
  },
  {
    id: "task-i9j0k1l2",
    name: "Market Research Report",
    status: "failed",
    agent: "nexus",
    provider: "google",
    startedAt: "2026-04-13T16:00:00Z",
    duration: "5m 12s",
    description: "Generate comprehensive market research report for AI assistants.",
    result: "Error: Perplexity API rate limit exceeded. Retry after 2026-04-14T00:00:00Z.",
  },
  {
    id: "task-m3n4o5p6",
    name: "Image Generation Batch",
    status: "cancelled",
    agent: "canvas",
    provider: "anthropic",
    startedAt: "2026-04-13T14:30:00Z",
    duration: "0s",
    description: "Generate 10 social media banners for product launch.",
  },
];

export const mockChatMessages: ChatMessage[] = [
  {
    id: "msg-001",
    sender: "user",
    content: "Can you search for flights to Paris in June?",
    timestamp: "2026-04-14T08:10:00Z",
  },
  {
    id: "msg-002",
    sender: "agent",
    agentId: "main",
    content: "I'll delegate this to Nexus for a thorough search. Creating a background task now.",
    timestamp: "2026-04-14T08:10:05Z",
  },
  {
    id: "msg-003",
    sender: "agent",
    agentId: "main",
    content:
      "Task created. Nexus is searching for flights to Paris in June. I'll let you know when results are ready.",
    timestamp: "2026-04-14T08:10:10Z",
  },
  {
    id: "msg-004",
    sender: "agent",
    agentId: "nexus",
    content:
      "Found 12 flights from Frankfurt to Paris in June.\n\n**Best options:**\n1. Lufthansa LH1054 — EUR 189, 1h 15m direct\n2. Air France AF1115 — EUR 165, 1h 20m direct\n3. Eurowings EW9876 — EUR 129, 1h 25m direct\n\nWould you like me to check specific dates?",
    timestamp: "2026-04-14T08:12:30Z",
  },
  {
    id: "msg-005",
    sender: "user",
    content: "Great, check June 15-20 for the Eurowings option.",
    timestamp: "2026-04-14T08:13:00Z",
  },
];

export const mockActivityEvents: ActivityEvent[] = [
  {
    id: "evt-001",
    type: "task",
    message: "Task 'Sygen Admin Panel Frontend' started",
    timestamp: "2026-04-14T10:00:00Z",
    agent: "main",
  },
  {
    id: "evt-002",
    type: "cron",
    message: "Cron 'System Health Check' executed successfully",
    timestamp: "2026-04-14T10:30:00Z",
    agent: "main",
  },
  {
    id: "evt-003",
    type: "webhook",
    message: "Webhook 'Telegram File Upload' triggered",
    timestamp: "2026-04-14T10:20:00Z",
    agent: "main",
  },
  {
    id: "evt-004",
    type: "agent",
    message: "Agent 'sonic' entered error state",
    timestamp: "2026-04-14T07:00:00Z",
    agent: "sonic",
  },
  {
    id: "evt-005",
    type: "cron",
    message: "Cron 'GitHub PR Monitor' executed successfully",
    timestamp: "2026-04-14T10:15:00Z",
    agent: "prism",
  },
  {
    id: "evt-006",
    type: "task",
    message: "Task 'Code Review PR #42' completed",
    timestamp: "2026-04-14T09:01:45Z",
    agent: "prism",
  },
  {
    id: "evt-007",
    type: "system",
    message: "System backup completed (2.3 GB)",
    timestamp: "2026-04-14T02:03:40Z",
  },
  {
    id: "evt-008",
    type: "agent",
    message: "Agent 'nexus' session started",
    timestamp: "2026-04-14T10:00:00Z",
    agent: "nexus",
  },
  {
    id: "evt-009",
    type: "cron",
    message: "Cron 'API Rate Limiter Reset' failed — connection timeout",
    timestamp: "2026-04-14T00:00:00Z",
    agent: "clowder",
  },
  {
    id: "evt-010",
    type: "task",
    message: "Task 'Market Research Report' failed — rate limit exceeded",
    timestamp: "2026-04-13T16:05:12Z",
    agent: "nexus",
  },
];

export const mockSystemHealth: SystemHealth = {
  cpu: 34,
  ram: 62,
  disk: 45,
  uptime: "14d 7h 23m",
};

export const mockMemoryModules: MemoryModule[] = [
  {
    id: "mem-main",
    name: "Main Memory",
    filename: "MAINMEMORY.md",
    type: "main",
    lastModified: "2026-04-14T10:30:00Z",
    size: "4.2 KB",
    content: `# Main Memory

## User Profile
- Name: Alexey
- Role: Developer & System Administrator
- Timezone: Europe/Berlin
- Primary language: Russian, English

## Preferences
- Prefers direct, concise responses
- Likes structured output with headers
- Wants proactive suggestions
- Dark theme everywhere

## Active Projects
- Sygen multi-agent system
- Admin panel development
- Telegram bot integrations

## Important Dates
- Server renewal: 2026-06-01
- API key rotation: monthly, 1st
`,
  },
  {
    id: "mem-shared",
    name: "Shared Memory",
    filename: "SHAREDMEMORY.md",
    type: "shared",
    lastModified: "2026-04-14T09:00:00Z",
    size: "2.8 KB",
    content: `# Shared Memory

## Server Info
- Host: Hetzner VPS (CX31)
- OS: Debian 12
- IP: 10.0.0.1 (internal)
- Docker: 24.0.7

## Infrastructure
- Telegram Bot API: polling mode
- Matrix: not configured
- Database: SQLite (workspace/data/)

## Conventions
- All agents use workspace/ as working directory
- Cron tasks stored in workspace/cron_tasks/
- Output files in workspace/output_to_user/
`,
  },
  {
    id: "mem-prism",
    name: "Prism Agent Memory",
    filename: "prism/MAINMEMORY.md",
    type: "agent",
    lastModified: "2026-04-14T09:15:00Z",
    size: "1.5 KB",
    content: `# Prism Memory

## Specialization
- Code review and analysis
- Refactoring suggestions
- Security auditing

## Reviewed Repos
- sygen-workspace: 12 reviews
- sygen-admin: 0 reviews (new)
- user-api: 5 reviews

## Patterns to Watch
- SQL injection in query builders
- Missing input validation
- Hardcoded credentials
`,
  },
  {
    id: "mem-nexus",
    name: "Nexus Agent Memory",
    filename: "nexus/MAINMEMORY.md",
    type: "agent",
    lastModified: "2026-04-14T10:00:00Z",
    size: "1.8 KB",
    content: `# Nexus Memory

## Specialization
- Deep research with web access
- Data analysis and synthesis
- Multi-source fact checking

## Search Preferences
- Primary: Perplexity API
- Fallback: DuckDuckGo
- Deep mode for complex topics

## Recent Research
- AI assistant market analysis (2026-04-13)
- Flight search optimization (2026-04-14)
- Next.js 14 best practices (2026-04-12)
`,
  },
];

export interface SygenServerMock {
  id: string;
  name: string;
  url: string;
  token: string;
  color: string;
  isDefault: boolean;
}

export const mockServers: SygenServerMock[] = [
  {
    id: "server-1",
    name: "Production",
    url: "http://prod-server:8799",
    token: "prod-token",
    color: "#e94560",
    isDefault: true,
  },
  {
    id: "server-2",
    name: "Dev Server",
    url: "http://dev-server:8799",
    token: "dev-token",
    color: "#4ecdc4",
    isDefault: false,
  },
];

export const mockConfig = {
  core: {
    version: "2.4.1",
    environment: "production",
    logLevel: "info",
    dataDir: "/home/alexeymorozua/.sygen/workspace/data",
  },
  telegram: {
    pollingMode: true,
    webhookUrl: "",
    parseMode: "HTML",
    maxMessageLength: 4096,
  },
  agents: {
    maxConcurrentSessions: 5,
    sessionTimeout: "30m",
    defaultModel: "claude-sonnet-4-6",
    defaultProvider: "anthropic",
  },
  tasks: {
    maxConcurrent: 3,
    timeout: "10m",
    retryOnFailure: true,
    maxRetries: 2,
  },
  cron: {
    timezone: "Europe/Berlin",
    maxConcurrent: 2,
    retryOnFailure: true,
  },
  api: {
    port: 8080,
    host: "0.0.0.0",
    corsOrigins: ["http://localhost:3000"],
    rateLimit: "100/min",
  },
};
