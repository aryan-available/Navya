# Member C — Python Optimization Engine

FastAPI + PuLP microservice that computes least-cost, reliability-aware dispatch for the Urjadrishti microgrid.

## Setup

From the `engine/` directory:

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

macOS / Linux:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

## Run the API

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open Swagger UI at `http://127.0.0.1:8000/docs`.

## Tests

```bash
pytest
```

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | `/optimize` | Solve one-interval economic dispatch |
| POST | `/ladder` | Apply shortfall-ladder stage 0–4, then dispatch |
| GET | `/runway` | Deterministic 24 h diesel fuel runway |
| GET | `/signal` | GREEN / YELLOW / RED from runway days |

## Folder layout

| Path | Role |
| --- | --- |
| `app/main.py` | FastAPI application and route registration |
| `optimizer/models.py` | Pydantic request / response models |
| `optimizer/core/` | PuLP objective, constraints, solver, reason codes |
| `optimizer/plans/` | Deterministic baseline strategies |
| `optimizer/ladder/` | Load tiers, shortfall ladder, fuel runway |
| `optimizer/signals/` | Operational color signals |
| `optimizer/routers/` | Thin HTTP adapters |
| `optimizer/tests/` | Pytest suite |
