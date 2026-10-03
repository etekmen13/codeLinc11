# ruff: isort:skip_file
import sqlite3
from pathlib import Path
from fastapi import FastAPI
from pydantic import BaseModel
# ruff: isort:on

app = FastAPI()
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
