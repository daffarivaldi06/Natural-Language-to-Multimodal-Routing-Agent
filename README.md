<div align="center">

#  Natural Language to Multimodal Routing Agent
**Next-Generation Multi-Operator Urban Transit Orchestration via Agentic AI & Spatial PostGIS**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-5.0-black?logo=express)](https://expressjs.com/)
[![LangChain](https://img.shields.io/badge/LangChain-LangGraph-1C3C3C?logo=chainlink&logoColor=white)](https://js.langchain.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_PostGIS_3.4-336791?logo=postgresql&logoColor=white)](https://postgis.net/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

<p align="center">
  Transform vague, human-style travel queries into mathematically precise, multi-leg door-to-door itineraries spanning <b>Buses</b>, <b>Metros</b>, <b>Regional Trains (SNCF TER)</b>, <b>Trams</b>, and <b>Shared Micro-Mobility (Bikes)</b>.
</p>

</div>

---

##  Executive Summary

Traditional journey planners (Google Maps, Citymapper, OpenRouteService) expect strict, structured inputs: origin and destination GPS coordinates or exact station identifiers. They fail when travelers formulate natural, context-rich requests such as:

> *"Find the best transit route from Stadium Lille Métropole to the UPHF campus in Valenciennes using a regional train and then a tram for the last mile."*

This repository implements a production-grade **Autonomous Multimodal Routing Agent**. Powered by **LangChain / LangGraph** and **Google Gemini**, the agent treats routing not as a single query, but as an **iterative plan-and-solve constraint problem**. It chains discrete spatial tools, queries a spatial PostGIS transit network, checks real-time dock availability, and delivers structured JSON itineraries.

---

##  Architecture & How It Works

```mermaid
flowchart TD
    subgraph Client ["Client Layer"]
        User(["Client / Postman / Mobile App"])
    end

    subgraph Gateway ["API Gateway (Express.js)"]
        Auth["JWT Authentication & RBAC"]
        Limiter["HTTP Rate Limiter (express-rate-limit)"]
        CacheCheck{"Redis / PostgreSQL<br/>Route Cache Hit?"}
    end

    subgraph AgentCore ["Agentic Orchestration Layer (LangGraph + Gemini)"]
        LLM["Gemini LLM (ReAct Engine)"]
        RPM["Sliding-Window RPM Limiter (Free-Tier Safe)"]
        Memory["LangGraph Execution Graph"]
    end

    subgraph ToolBelt ["Agent Tool Registry"]
        T_Geo["Geocoding Tool<br/>(Alias & Coordinate Resolver)"]
        T_Transit["Transit Connections Tool<br/>(Bus, Metro, TER, Tram)"]
        T_ORS["Transit & Micro-Mobility Router<br/>(Walk, Bike, Distance, Duration)"]
        T_Bike["Bike Availability Tool<br/>(Live Docks & Fleet Status)"]
    end

    subgraph DataLayer ["Data & Storage Layer"]
        PG[("PostgreSQL 16 + PostGIS 3.4<br/>(Mock GTFS Lines & Geospatial Queries)")]
        RD[("Redis 7<br/>(Fast Session & Transient Cache)")]
    end

    User -->|POST /api/v1/route| Auth
    Auth --> Limiter
    Limiter --> CacheCheck

    CacheCheck -- Hit --> User
    CacheCheck -- Miss --> RPM
    RPM --> LLM

    LLM <--> Memory
    LLM -->|Step 1: Resolve Stop Names| T_Geo
    LLM -->|Step 2: PostGIS Hop-by-Hop| T_Transit
    LLM -->|Step 3: First/Last Mile & Bike| T_Bike
    LLM -->|Step 4: Micro Routing| T_ORS

    T_Transit --> PG
    T_Bike --> RD
    T_Geo --> PG

    LLM -->|Synthesized Structured Itinerary| CacheCheck
    CacheCheck -->|Cache & Return Response| User
```

### The 4-Stage Agent Execution Cycle
1. **Natural Language Parsing & Geocoding**: The agent maps conversational landmarks (*"Stadium Lille Métropole"*, *"UPHF"*) into validated stop names and geographic coordinates.
2. **Dynamic Tool Chaining**: If the destination spans cross-regional transit, the agent autonomously executes a multi-hop traversal:
   - **Leg 1 (Bus)**: *Stadium Lille Métropole* ➔ *Pont de Bois* (Line L6)
   - **Leg 2 (Metro)**: *Pont de Bois* ➔ *Lille Flandres* (Metro Line 2)
   - **Leg 3 (Regional Train)**: *Lille Flandres* ➔ *Valenciennes* (SNCF TER)
   - **Leg 4 (Tram)**: *Valenciennes Station* ➔ *Université UPHF* (Tram T1)
3. **Database Lookups via PostGIS**: Spatial and text-matching queries run against indexed `transit_lines` tables with millisecond execution.
4. **Resilient JSON Output**: Formats the final chain into typed transit legs with operator names, line codes, durations, distances, and live transfer points.

---

##  Technical Highlights

### 1. Agentic Tool Chaining & Loop Prevention
- Built with **LangGraph ReAct Pattern** (`createReactAgent`), enforcing deterministic stop conditions and recursion limits (`recursionLimit: 25`).
- Strictly configured system instructions prevent LLM hallucination: every transit leg **must** originate from a real tool observation.

### 2. Multi-Operator Transit in PostGIS
- Overcomes the limitation of standard pedestrian/car routing engines by maintaining an indexed transit database representing regional public transportation (Ilévia buses/metros, SNCF regional trains, and Keolis trams).
- Safe parameterized queries using `prisma.$queryRaw` prevent PostGIS native geometry parsing collisions while leveraging spatial indexes.

### 3. Dual-Tier Caching & Rate Limit Optimization
- **HTTP Layer**: Enforces endpoint protection via `express-rate-limit`.
- **Agent Layer**: Custom sliding-window `RpmLimiter` guarantees API compliance with Gemini free-tier restrictions (15 RPM hard ceiling).
- **Storage Layer**: SHA-256 hashed queries cache full structured itineraries in PostgreSQL (`route_cache`) and Redis with TTL invalidation, reducing LLM costs to zero for identical requests.

### 4. High-Fidelity Observability
- Rich terminal logging prints real-time LLM thoughts, tool calls, PostGIS connection matches, and database latency markers for total visibility during development and auditing.

---

##  Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Runtime** | Node.js 20+ & TypeScript 5.9 | Type-safe enterprise JavaScript runtime |
| **Framework** | Express.js 5 | Fast, minimalist HTTP web framework |
| **Orchestrator** | LangChain & LangGraph | Agentic ReAct flow and structured tool execution |
| **LLM Engine** | Google Gemini 2.5 / 2.0 Flash | Ultra-low latency reasoning and function calling |
| **Database** | PostgreSQL 16 + PostGIS 3.4 | Geospatial database for stations, lines, and geometries |
| **ORM** | Prisma ORM 5.22 | Schema migrations, type-safe queries, and raw spatial SQL |
| **Cache & Store** | Redis 7 & In-Memory Sliding Window | Transient bike cache, route cache, and rate limiter |
| **Containerization** | Docker & Docker Compose | One-command local environment virtualization |
| **Testing** | Jest 30 & Supertest 7 | Full integration and unit test coverage |

---

##  Getting Started

### Prerequisites
- [Docker](https://www.docker.com/) & Docker Compose installed
- [Node.js](https://nodejs.org/) v20.x or higher
- A free [Google AI Studio Gemini API Key](https://aistudio.google.com/app/apikey)

---

### Step-by-Step Installation

#### 1. Clone the Repository
```bash
git clone https://github.com/your-username/natural-language-to-multimodal-routing-agent.git
cd natural-language-to-multimodal-routing-agent
```

#### 2. Configure Environment Variables
Create your local `.env` configuration:
```bash
cp .env.example .env
```
Ensure `.env` contains your Gemini API key:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://routing_user:secret@localhost:5433/routing_db"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="super_secure_jwt_secret_key_at_least_32_characters_long"
JWT_EXPIRES_IN="1h"
GOOGLE_API_KEY="AIzaSyYourGoogleApiKeyHere"
```

#### 3. Spin Up Infrastructure (Docker)
Start PostgreSQL with PostGIS and Redis:
```bash
npm run docker:up
```
*(Verify health with `docker compose ps`)*

#### 4. Run Migrations & Seed Data
Initialize PostGIS tables and seed the multi-modal transit network:
```bash
# Run database schema migrations
npm run migrate

# Seed users, POIs, bike stations, and transit lines (Bus, Metro, TER, Tram)
npm run seed
```

#### 5. Launch the Server
```bash
npm run dev
```
The server will boot up at `http://localhost:3000`.

---

##  API Usage & Verification

### 1. Authentication (Login)
Obtain a Bearer JWT using the pre-seeded credentials:

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@routing.local",
    "password": "User1234!"
  }'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "c1f728...",
    "email": "user@routing.local",
    "role": "USER"
  }
}
```

---

### 2. Multi-Hop Natural Language Route Query

**Endpoint:** `POST /api/v1/route`  
**Header:** `Authorization: Bearer <YOUR_TOKEN>`

```bash
curl -X POST http://localhost:3000/api/v1/route \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Find the best transit route from Stadium Lille Métropole to the UPHF campus in Valenciennes."
  }'
```

#### Expected Agent Output (Door-to-Door Itinerary):
```json
{
  "success": true,
  "query": "Find the best transit route from Stadium Lille Métropole to the UPHF campus in Valenciennes.",
  "result": {
    "origin": "Stadium Lille Métropole",
    "destination": "Université (UPHF)",
    "totalDurationMinutes": 98,
    "legs": [
      {
        "sequence": 1,
        "mode": "bus",
        "operator": "Ilévia",
        "line": "Line L6",
        "from": "Stadium Lille Métropole",
        "to": "Pont de Bois",
        "durationSeconds": 900,
        "distanceMeters": 4500
      },
      {
        "sequence": 2,
        "mode": "metro",
        "operator": "Ilévia",
        "line": "Metro Line 2",
        "from": "Pont de Bois",
        "to": "Lille Flandres",
        "durationSeconds": 720,
        "distanceMeters": 6200
      },
      {
        "sequence": 3,
        "mode": "train",
        "operator": "SNCF",
        "line": "TER Hauts-de-France",
        "from": "Lille Flandres",
        "to": "Valenciennes",
        "durationSeconds": 2700,
        "distanceMeters": 51000
      },
      {
        "sequence": 4,
        "mode": "tram",
        "operator": "Keolis Valenciennes",
        "line": "Tram T1",
        "from": "Valenciennes",
        "to": "Université (UPHF)",
        "durationSeconds": 1080,
        "distanceMeters": 5200
      }
    ],
    "summary": "Take Bus L6 from Stadium Lille Métropole to Pont de Bois, transfer to Metro Line 2 to Lille Flandres, board the SNCF TER train to Valenciennes station, and take Tram T1 to Université (UPHF)."
  }
}
```

---

##  Testing

The repository includes end-to-end integration tests validating multi-leg assertions, fallback policies, and route structures.

```bash
# Run Jest integration test suite
npm test
```

Test coverage includes:
- [x] Agent invocation and JSON schema validation
- [x] 4-hop transit continuity (Bus ➔ Metro ➔ Train ➔ Tram)
- [x] PostGIS spatial queries under mock loads
- [x] Route caching and cache-invalidation cycles
- [x] JWT verification & rate-limiting bypass under test flags

---

##  Project Structure

```
├── prisma/
│   ├── schema.prisma             # PostgreSQL schema with PostGIS extensions
│   └── migrations/               # Version-controlled DB migrations
├── scripts/
│   └── seedDb.ts                 # Realistic GTFS-like transit lines & POI seeder
├── src/
│   ├── agent/
│   │   ├── index.ts              # LangGraph ReAct agent & rate limiter
│   │   ├── prompts/
│   │   │   └── systemPrompt.ts   # Transit chain workflow & anti-hallucination guardrails
│   │   └── tools/
│   │       ├── geocode.tool.ts            # Spatial landmark resolution
│   │       ├── transitConnections.tool.ts # PostGIS line query tool
│   │       ├── transitRoute.tool.ts       # Walking/pedestrian leg routing
│   │       └── bikeAvailability.tool.ts   # Real-time bike station search
│   ├── cache/
│   │   └── redis.ts              # Redis client & helper functions
│   ├── config/
│   │   └── index.ts              # Strongly-typed environment validation
│   ├── db/
│   │   └── prisma.ts             # Prisma client singleton
│   ├── middleware/
│   │   ├── auth.middleware.ts    # JWT & RBAC guard
│   │   └── rateLimiter.ts        # Express route rate limiters
│   ├── modules/
│   │   ├── auth/                 # Authentication controller & router
│   │   └── route/                # Core routing controller & router
│   └── index.ts                  # Server entry point & graceful shutdown
├── docker-compose.yml            # PostgreSQL 16 (PostGIS) & Redis 7 services
├── jest.config.js                # CommonJS Jest test configuration
└── package.json
```

---

##  Available Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start development server with live watch reload (`tsx`) |
| `npm run build` | Compile TypeScript to JavaScript in `dist/` |
| `npm test` | Run integration test suite with Jest |
| `npm run migrate` | Apply latest Prisma database migrations |
| `npm run seed` | Seed database with stations, lines, and mock accounts |
| `npm run studio` | Launch Prisma Studio GUI for database inspection |
| `npm run docker:up` | Spin up PostgreSQL + PostGIS and Redis containers |
| `npm run docker:down` | Stop and remove running containers |

---

##  License
This project is open-source and available under the [ISC License](LICENSE).
