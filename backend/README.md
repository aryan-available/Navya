# GridPilot Backend (Member B)

> **API Gateway, Orchestrator, JWT Auth, MongoDB Persistence, and Real-Time WebSocket Server**

---

## 1. Responsibilities (Member B)

Member B owns the central orchestration layer and API gateway for GridPilot:

1. **API Gateway**: Clean, secure REST endpoints connecting the React Frontend with backend services.
2. **Authentication**: JWT authentication with bcrypt password hashing for operator/admin users.
3. **Public Community Display Route**: Lightweight, unauthenticated, cache-friendly `GET /signal` endpoint.
4. **Python Engine Integration (`engineClient.ts`)**: Single typed HTTP client communicating with the Python FastAPI Engine (`POST /optimize`, `POST /ladder`, `GET /runway`, `GET /signal`, `GET /state`, `GET /forecast`, `POST /events`, `POST /compare`).
5. **Operational Orchestrator (`orchestrator.ts`)**: Runs the supply-vs-demand check, decides Normal Path vs Shortfall Response Ladder stage, invokes optimization, and coordinates state.
6. **MongoDB Atlas Persistence**: Stores users, community configurations, optimization runs, what-if scenarios, override events, and signal history.
7. **Real-Time Push (Socket.IO)**: Pushes live digital twin ticks, ladder stage escalations, and what-if injection results to the UI.
8. **LLM Grounded Explanations (`llmClient.ts`)**: Bridges Claude/OpenAI to explain decisions grounded exclusively in real optimizer outputs and reason codes (never calculating math with LLM).

---

## 2. Directory Structure

```
backend/
├── src/
│   ├── index.ts               # Express app, Socket.IO server, DB connection, routes
│   │
│   ├── routes/
│   │   ├── auth.ts            # POST /auth/register, POST /auth/login, GET /auth/me
│   │   ├── microgrid.ts       # GET /api/microgrid/state, /community, /assets, PUT /parameters
│   │   ├── forecast.ts        # GET /api/forecast (24h/72h forward)
│   │   ├── optimize.ts        # POST /api/optimize, GET /api/optimize/history
│   │   ├── scenario.ts        # POST /api/scenario, GET /list, POST /compare
│   │   ├── override.ts        # POST /api/override, DELETE /clear, GET /history
│   │   ├── explain.ts         # POST /api/explain (grounded LLM decisions)
│   │   ├── ladder.ts          # GET /api/ladder, POST /recalculate (Stages 0-4)
│   │   ├── runway.ts          # GET /api/runway (fuel runway projections)
│   │   └── signal.ts          # GET /signal (Public traffic light for kiosk)
│   │
│   ├── sockets/
│   │   └── liveState.ts       # Socket.IO live-state broadcaster
│   │
│   ├── middleware/
│   │   ├── auth.ts            # JWT verification middleware
│   │   ├── validate.ts        # Zod request validation
│   │   └── errorHandler.ts    # Centralized structured error handler
│   │
│   ├── models/
│   │   ├── User.ts            # Operator authentication document
│   │   ├── Community.ts       # Community metadata, assets, operational snapshot
│   │   ├── OptimizationRun.ts # Persisted LP/MILP runs, metrics, reason codes
│   │   ├── Scenario.ts        # Injected What-If scenarios & impacts
│   │   ├── OverrideEvent.ts   # Operator overrides & quantified cost/CO2 deltas
│   │   └── SignalState.ts     # Traffic-light history
│   │
│   ├── services/
│   │   ├── engineClient.ts    # Typed HTTP wrapper for Python engine (with Mock Mode)
│   │   ├── orchestrator.ts    # Operational coordinator (supply vs demand & ladder)
│   │   └── llmClient.ts       # Claude/OpenAI wrapper with strict grounding prompt
│   │
│   ├── config/
│   │   ├── env.ts             # Typed environment configuration
│   │   └── db.ts              # Mongoose connection manager
│   │
│   └── utils/
│       ├── logger.ts          # Safe structured logger (redacts secrets)
│       └── errors.ts          # Custom AppError hierarchy
│
├── tests/                     # Jest / Supertest test suite
├── package.json
├── tsconfig.json
├── .env.example
├── Dockerfile
└── README.md
```

---

## 3. Environment Variables

Create a `.env` file in `backend/` based on `.env.example`:

```env
PORT=5000
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:5173

MONGODB_URI=mongodb://127.0.0.1:27017/gridpilot
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=24h

# Python FastAPI Optimization Engine
ENGINE_BASE_URL=http://localhost:8000

# Mock Mode: allows backend to run autonomously if Python engine is offline
USE_MOCK_ENGINE=true

# Orchestrator periodic tick interval in milliseconds
ORCHESTRATOR_TICK_MS=5000
ORCHESTRATOR_AUTO_START=true

# LLM Grounded Explainability
LLM_PROVIDER=claude
LLM_API_KEY=
```

---

## 4. Development & Running

### Install Dependencies
```bash
npm install
```

### Run in Development Mode (with hot reloading)
```bash
npm run dev
```

### Run Tests
```bash
npm test
```

### Build for Production
```bash
npm run build
npm start
```

---

## 5. Mock Engine Mode (`USE_MOCK_ENGINE=true`)

To enable rapid independent frontend and backend development when Members C and D are building the Python engine, `engineClient.ts` includes a high-fidelity deterministic simulation mode. When `USE_MOCK_ENGINE=true`:
- All route handlers function identically.
- MongoDB persistence and Socket.IO pushes operate normally.
- Realistic solar irradiance curves, wind profiles, battery state-of-charge dynamics, and LP dispatch plans are generated physically.
- When the Python engine is running, set `USE_MOCK_ENGINE=false` to switch to live HTTP calls to FastAPI.

---

## 6. Socket.IO Live Events

| Event Name | Payload | Trigger |
|---|---|---|
| `live_state_update` | `CommunityState` | Emitted every orchestrator tick with current solar/wind/battery/diesel/demand |
| `optimization_update` | `DispatchPlan` | Emitted when an optimization run finishes |
| `ladder_stage_changed` | `LadderResponse` | Emitted when the shortfall response ladder transitions |
| `scenario_injected` | `ScenarioResult` | Emitted when an operator injects a What-If disruption |
| `override_changed` | `OverrideEvent` | Emitted when manual override is applied or cleared |
| `signal_update` | `SignalState` | Emitted when grid status changes (`GREEN`, `YELLOW`, `RED`) |

---

## 7. Security & Boundaries

- **Password Hashing**: Salted bcrypt password hashing.
- **JWT Verification**: Validates expiration and signatures on all `/api/*` endpoints.
- **No Leaked Secrets**: Password hashes and API tokens are omitted from JSON outputs and sanitized from server logs.
- **No Direct Engine/DB Exposure**: The React frontend only ever talks to the Node backend.
