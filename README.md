# Sygen Admin Panel

Web-based administration interface for the [Sygen](https://github.com/alexeymorozua/sygen) multi-agent AI system. Monitor agents, manage scheduled tasks, chat in real-time, and control your entire Sygen infrastructure from a single dashboard.

## Features

- **Dashboard** — real CPU, RAM, and disk metrics from `/proc` with sparkline history charts (last 30 readings), auto-refresh every 10 seconds, and manual refresh
- **Real-time Chat** — WebSocket-based streaming chat with any agent, multi-session support (create/switch/delete sessions per agent with server-side persistence), voice messages with inline audio player, per-session provider/model override via header switcher (Claude/Gemini/Codex, override persists for that chat session only)
- **Cron Jobs** — full CRUD with modal forms, client-side cron expression validation with real-time hints, human-readable schedule descriptions, preset schedule picker, and enabled/disabled toggle
- **Webhooks** — full CRUD management via modal forms with test button (sends POST, shows status/response in toast)
- **Background Tasks** — monitor running tasks with auto-refresh every 5 seconds, create tasks from UI, expandable result/output view, running task count indicator with pulse animation
- **Memory Editor** — view and edit all memory modules with content loading on selection and path traversal protection. Root files (MAINMEMORY/SHAREDMEMORY) show a plain line count; nested modules under `modules/` show a colored `N / 80` pill (green → yellow → orange → red) so you can see at a glance which modules are near the cron cleanup threshold
- **RAG Management** — dedicated block in Settings showing enable toggle, memory-fact count (primary — drives 200/500 recommendation thresholds) alongside the raw indexed chunk count (technical counter), vector DB size, embedding model, top-K values, and sub-toggles for memory/workspace indexing and reranker (changes take effect after bot restart). Thresholds match the monthly-memory-review cron task and Telegram recommendations so all three surfaces agree on what "large knowledge base" means
- **Agents** — detail panel on card click (model, provider, sessions, allowed users), logs viewer tab (last 200 lines), online/total count in header, and "Open Chat" quick action. Provider is shown for every agent even if the field is missing from `agents.json` — it's derived from the model via `ModelRegistry.provider_for()` on the backend
- **Skills** — per-agent skill management (list / create / edit / delete Markdown skills inside `workspace/skills/`). Agent selector at the top, list in the left pane, editor on the right, responsive drawer on mobile
- **Files** — file browser with breadcrumb navigation (URL-driven via `?path=…`), upload / download / delete / mkdir
- **URL-based Detail Selection** — notifications, memory modules, cron jobs, webhooks, tasks, agents, files, and skills all use `?id=…` / `?module=…` / `?skill=…` / `?path=…` query params, so selected items survive page reloads and are linkable/shareable
- **Settings** — configuration viewer with sanitized secrets (masked as `***`)
- **Users & RBAC** — user management (create/edit/delete), three roles (admin/operator/viewer), per-agent access control (`allowed_agents`), audit log with action history
- **i18n** — full internationalization with English, Ukrainian, and Russian translations, language switcher in sidebar
- **User Avatar** — upload a custom avatar via `/upload`, save the path with `PUT /api/profile`, displayed in chat and profile page
- **Agent Avatar** — agent avatars displayed in chat, fetched via `GET /api/agents/{name}/avatar`
- **Persistent WebSocket Chat** — `ChatContext.tsx` in root layout keeps the WebSocket connection alive across page navigation
- **Notifications** — real-time notifications from cron, webhook, and task events via WebSocket push, with bell indicator and read/unread tracking
- **Dark/Light Theme** — toggle in sidebar with localStorage persistence
- **Global Search (Ctrl+K)** — command palette with fuzzy matching across agents, cron jobs, webhooks, tasks, and pages
- **Keyboard Shortcuts** — `G+D/A/C/R/W/T/M` for navigation, `?` shows help modal
- **Toast Notifications** — global notifications (success/error/warning/info) with auto-dismiss, slide-in animation, and stacking (up to 5), integrated across all CRUD operations
- **Multi-Server** — connect and switch between multiple Sygen instances from one panel
- **Authentication** — JWT-based auth with username+password login, token refresh flow, and legacy API token support
- **Mock Mode** — develop and demo without a running Sygen Core

## Quick Start

### Prerequisites

- **Node.js 20+** (for manual build)
- **Sygen Core** with API server enabled (port 8799)

### Option 1: Sygen CLI (Recommended)

If you have [Sygen](https://github.com/alexeymorozua/sygen) installed, use the built-in CLI:

```bash
sygen admin setup      # Clone repo, install deps, build
sygen admin start      # Start (auto-detects API URL and token from config)
```

Other commands: `sygen admin stop`, `sygen admin status`, `sygen admin update`, `sygen admin open`.

### Option 2: Docker

```bash
docker run -d \
  --name sygen-admin \
  -p 3000:3000 \
  -e NEXT_PUBLIC_SYGEN_API_URL=http://your-sygen-server:8799 \
  -e SYGEN_API_URL=http://your-sygen-server:8799 \
  -e SYGEN_API_TOKEN=your-api-token \
  -e NEXT_PUBLIC_USE_MOCK=false \
  ghcr.io/alexeymorozua/sygen-admin:latest
```

Open `http://localhost:3000` in your browser.

### Option 3: Docker Compose

```bash
cp .env.example .env
# Edit .env with your Sygen Core URL and API token
docker compose up -d
```

### Option 4: Manual Build

```bash
git clone https://github.com/alexeymorozua/sygen-admin.git
cd sygen-admin
cp .env.example .env
# Edit .env with your settings

npm install
npm run build
npm start
```

The app starts on `http://localhost:3000`.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_SYGEN_API_URL` | Yes | `http://localhost:8080` | Base URL of your Sygen Core API server (used by client-side code) |
| `SYGEN_API_URL` | No | same as `NEXT_PUBLIC_SYGEN_API_URL` | Server-side API URL (used by the token-login proxy; keeps internal topology private) |
| `SYGEN_API_TOKEN` | No | — | Static API token for server-side auth (never exposed to the browser) |
| `NEXT_PUBLIC_USE_MOCK` | No | `false` | Set to `true` for development/demo. When `true`, the UI uses built-in mock data |

> **Note:** Variables prefixed with `NEXT_PUBLIC_` are embedded at build time in Docker. `SYGEN_API_URL` and `SYGEN_API_TOKEN` are server-side only and never reach the client bundle.

### Sygen Core Setup

To enable the API server in Sygen Core:

1. Open your Sygen `config/config.json`
2. Set the API configuration:

```json
{
  "api": {
    "enabled": true,
    "host": "0.0.0.0",
    "port": 8799,
    "token": "your-secure-api-token"
  }
}
```

3. (Optional) Set a JWT secret for token-based authentication:

```json
{
  "api": {
    "jwt_secret": "your-jwt-secret-key"
  }
}
```

4. Restart Sygen Core for changes to take effect.

## Multi-Server Setup

Sygen Admin supports managing multiple Sygen Core instances from a single panel.

### Adding Servers

1. Navigate to **Settings > Servers** in the admin panel
2. Click **Add Server**
3. Fill in:
   - **Name** — display label (e.g., "Production", "Staging")
   - **URL** — Sygen Core API URL (e.g., `https://prod.example.com:8799`)
   - **Token** — API token for that server
   - **Color** — visual identifier in the UI
4. Click **Test Connection** to verify, then **Save**

### Switching Servers

- Use the server selector in the dashboard header to switch between configured servers
- Each server maintains its own connection state and health status
- The active server indicator shows which instance you're currently managing

### Default Server

The server configured via `NEXT_PUBLIC_SYGEN_API_URL` is automatically added as the default server. Additional servers are stored in the browser's local storage.

## Authentication

### Login Flow

1. User opens the admin panel and is redirected to `/login`
2. User enters username and password (or switches to API token mode)
3. Credentials are sent to `POST /api/auth/login` on Sygen Core
4. Sygen Core returns `access_token`, `refresh_token`, and `user` info (JWT)
5. Tokens and user profile are stored in the browser's local storage
6. All subsequent API calls include `Authorization: Bearer <access_token>`
7. On 401 responses, the client automatically refreshes the token via `POST /api/auth/refresh`
8. If refresh fails, the user is redirected back to the login page

### Roles & Permissions

| Role | Permissions |
|------|-------------|
| **admin** | Full access — manage users, servers, all CRUD operations |
| **operator** | Read + run tasks, manage cron jobs, webhooks, memory |
| **viewer** | Read-only access to dashboard, agents, tasks |

Admins can restrict users to specific agents via the `allowed_agents` field. Users with restrictions only see their assigned agents.

### Default User

On first startup, a default admin user is created automatically:
- **Username:** `admin`
- **Password:** `admin`

> **Important:** Change the default password after first login.

### Token Storage

Tokens are stored in `localStorage` under:
- `sygen_access_token` — short-lived access token
- `sygen_refresh_token` — long-lived refresh token
- `sygen_user` — user profile (username, role, allowed_agents)

## Architecture

```
                           ┌─────────────────────────┐
                           │      Browser Client      │
                           └────────┬────────┬────────┘
                                    │        │
                              HTTP  │        │ WebSocket
                                    │        │
                           ┌────────▼────────▼────────┐
                           │  Sygen Admin (Next.js)    │
                           │       :3000               │
                           └────────┬────────┬────────┘
                                    │        │
                         REST API   │        │ WS
                                    │        │
                           ┌────────▼────────▼────────┐
                           │  Sygen Core API Server    │
                           │       :8799               │
                           │  ┌──────────────────┐     │
                           │  │ Agents / Cron /   │    │
                           │  │ Memory / Tasks    │    │
                           │  └──────────────────┘     │
                           └──────────────────────────┘
```

**Key connections:**
- `HTTP REST` — all CRUD operations, authentication, system status
- `WebSocket /ws/admin` — real-time chat streaming, tool activity events, system status updates

## Development

### Dev Server

```bash
npm run dev
```

Opens at `http://localhost:3000` with hot reload.

### Mock Mode

Set `NEXT_PUBLIC_USE_MOCK=true` in `.env` to work without a running Sygen Core. The UI will use built-in mock data for all API responses. Mock mode is disabled by default.

### Testing

```bash
npm test          # Run all tests
npm run build     # Verify production build
```

### Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Dashboard
│   ├── login/              # Login page (username+password / token)
│   ├── agents/             # Agent management
│   ├── chat/               # Real-time chat (WebSocket)
│   ├── cron/               # Cron job management
│   ├── webhooks/           # Webhook management
│   ├── tasks/              # Background task monitoring
│   ├── memory/             # Memory editor
│   ├── users/              # User management & audit log
│   ├── servers/            # Multi-server management
│   ├── settings/           # System settings
│   └── layout.tsx          # Root layout with providers
├── components/             # Reusable UI components
│   ├── Sidebar.tsx         # Navigation with role-based filtering
│   ├── CommandPalette.tsx  # Global search (Ctrl+K)
│   ├── LanguageSwitcher.tsx # i18n language picker
│   ├── KeyboardShortcuts.tsx # Shortcut handler
│   └── Toast.tsx           # Notification system
├── context/                # React contexts
│   ├── AuthContext.tsx      # Authentication, roles, agent access
│   ├── NotificationContext.tsx # Server-backed notifications with real-time WS push
│   ├── ServerContext.tsx    # Multi-server state
│   └── ThemeContext.tsx     # Dark/light theme
└── lib/                    # Utilities
    ├── api.ts              # API client with JWT handling
    ├── i18n.tsx            # Internationalization
    ├── translations/       # EN, UK, RU translations
    ├── websocket.ts        # WebSocket client with auto-reconnect
    ├── servers.ts          # Server management & health checks
    ├── cron.ts             # Cron expression validation
    ├── fuzzySearch.ts      # Fuzzy matching for search
    ├── mock-data.ts        # Mock data & type definitions
    └── utils.ts            # Helpers
```

### Linting

```bash
npm run lint
```

## API Reference

All endpoints require `Authorization: Bearer <token>` header unless noted.

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Authenticate with username+password or API token |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/logout` | Logout (revokes refresh token) |
| `GET` | `/api/auth/me` | Get current user info |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Basic health check (200 OK) |
| `GET` | `/api/system/status` | CPU, RAM, disk (real metrics via `/proc`), uptime, counts |
| `GET` | `/api/config` | System configuration (secrets masked as `***`) |
| `GET` | `/api/logs?lines=100&agent=main` | Fetch logs (optional filters) |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents` | List agents (filtered by user's `allowed_agents`; `provider` is derived from `model` when missing from `agents.json`) |
| `GET` | `/api/agents/{name}` | Get agent details (same provider-derivation fallback) |
| `GET` | `/api/agents/{name}/avatar` | Get agent avatar image |
| `GET` | `/api/agents/{agent}/skills` | List skills available to an agent |
| `POST` | `/api/agents/{agent}/skills` | Create a new skill (`{name, content}`) |
| `GET` | `/api/agents/{agent}/skills/{skill}` | Read a skill's main doc |
| `PUT` | `/api/agents/{agent}/skills/{skill}` | Update a skill's main doc |
| `DELETE` | `/api/agents/{agent}/skills/{skill}` | Delete a skill |

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/chat?agent={id}` | Get chat history (legacy) |
| `POST` | `/api/chat/{agentId}` | Send message to agent (legacy) |
| `WS` | `/ws/admin` | Real-time streaming (auth required) |

### Chat Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/chat/sessions?agent={id}` | List chat sessions (optional agent filter) |
| `POST` | `/api/chat/sessions` | Create chat session (`{agent, title?}`) |
| `PUT` | `/api/chat/sessions/{id}` | Rename chat session (`{title: string}`) |
| `DELETE` | `/api/chat/sessions/{id}` | Delete chat session and its history |
| `POST` | `/api/chat/sessions/{id}/provider` | Set or clear per-session provider/model override (`{provider, model}` or `{provider: null, model: null}`) |
| `GET` | `/api/chat/sessions/{id}/messages` | Get session message history |
| `PUT` | `/api/chat/sessions/{id}/messages` | Save session messages (`{messages: [...]}`) |

### Providers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/providers/available` | List authenticated CLI providers (Claude/Gemini/Codex), their models, and the main agent default |

The per-session override is applied only for messages sent on that specific chat session — it is not written back to the agent's config. Sending a message with an active override transparently prepends an `@<model>` directive, so the directive parser in the orchestrator picks it up and routes the message to the selected provider.

### Audio

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/transcribe` | Transcribe audio file (`{file_path: string}`), uses whisper pipeline |

### User Profile

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PUT` | `/api/profile` | Update user profile (supports `avatar` field with uploaded file path) |

### Cron Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cron` | List all cron jobs |
| `POST` | `/api/cron` | Create cron job |
| `PUT` | `/api/cron/{id}` | Update cron job |
| `DELETE` | `/api/cron/{id}` | Delete cron job |
| `POST` | `/api/cron/{id}/run` | Trigger manual run |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/webhooks` | List all webhooks |
| `POST` | `/api/webhooks` | Create webhook |
| `PUT` | `/api/webhooks/{id}` | Update webhook |
| `DELETE` | `/api/webhooks/{id}` | Delete webhook |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks?status=running&limit=50` | List tasks (optional filters) |
| `GET` | `/api/tasks/{id}` | Get task details |
| `POST` | `/api/tasks` | Create new task |
| `POST` | `/api/tasks/{id}/cancel` | Cancel running task |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions` | List active sessions |
| `DELETE` | `/api/sessions/{id}` | Terminate session |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/files/list?path=…` | List files and directories inside the user-files area |
| `POST` | `/api/files/mkdir` | Create a new directory |
| `DELETE` | `/api/files` | Delete a file or directory |

### Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/memory` | Get main memory content |
| `PUT` | `/api/memory` | Update memory content |
| `GET` | `/api/memory/modules` | List memory modules. Each module includes `lines` (number) and `size` (human-readable), so the admin panel can render the N/80 pill against the cron cleanup limit |
| `GET` | `/api/memory/modules/{filename}` | Read a specific memory module |
| `PUT` | `/api/memory/modules/{filename}` | Update a specific memory module |

### RAG

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/rag/status` | Read RAG state: `enabled`, `embedding_model`, `reranker_enabled`, `reranker_model`, `index_workspace`, `index_memory`, `top_k_retrieval`, `top_k_final`, vector DB path/size/existence, indexed `chunk_count` (counted directly from `chroma.sqlite3`), and `memory_fact_count` (non-empty, non-comment lines across `memory_system/*.md` — UI applies 200/500 recommendation thresholds to this) |
| `PUT` | `/api/rag/config` | Update RAG config (admin only). Accepts any subset of `enabled`, `reranker_enabled`, `index_workspace`, `index_memory`, `top_k_retrieval`, `top_k_final`. Unknown fields are rejected. Response includes `restart_required: true` — bot must be restarted for changes to apply |

### Users (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users` | List all users (passwords excluded) |
| `POST` | `/api/users` | Create user |
| `PUT` | `/api/users/{username}` | Update user (role, agents, password, active) |
| `DELETE` | `/api/users/{username}` | Delete user |

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/notifications?limit=50&unread_only=false` | List notifications (optional filters) |
| `GET` | `/api/notifications/unread-count` | Get unread notification count |
| `PUT` | `/api/notifications/{id}/read` | Mark a notification as read |
| `POST` | `/api/notifications/read-all` | Mark all notifications as read |

### Audit Log (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/audit?limit=200` | Get recent audit log entries |

### WebSocket Events

**Client sends:**
```json
{ "type": "auth", "token": "your-jwt-token" }
{ "type": "message", "agent": "main", "text": "Hello" }
{ "type": "abort", "agent": "main" }
```

**Server sends:**
```json
{ "type": "auth_ok", "agents": ["main", "assistant"] }
{ "type": "text_delta", "content": "partial response..." }
{ "type": "tool_activity", "tool": "Bash", "status": "running" }
{ "type": "result", "content": "final answer", "files": [] }
{ "type": "notification", "notification": { "id": "...", "title": "...", "body": "...", "read": false } }
{ "type": "error", "message": "description" }
```

## License

MIT
