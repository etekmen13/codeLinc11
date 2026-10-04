import sqlite3
from pathlib import Path

import onboarding
from care_plan import router as care_plan_router
from cdt_mapper import router as cdt_router
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()
app.include_router(onboarding.router)
app.include_router(care_plan_router)
app.include_router(cdt_router)
DB_PATH = Path(__file__).parent / "app.db"


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # rows behave like dicts
    return conn


with db() as conn:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY, symbol TEXT, qty REAL)"
    )


class Trade(BaseModel):
    symbol: str
    qty: float


@app.get("/api/trades")
def list_trades():
    with db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM trades")]


@app.post("/api/trades")
def add_trade(t: Trade):
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO trades (symbol, qty) VALUES (?, ?)", (t.symbol, t.qty)
        )
        return {"id": cur.lastrowid, **t.model_dump()}
