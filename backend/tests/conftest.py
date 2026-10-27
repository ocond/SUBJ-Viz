from __future__ import annotations

from typing import List, Optional

import pytest
from fastapi.testclient import TestClient

from subjviz.app import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


def opinion(belief: List[float], uncertainty: float, base_rate: Optional[List[float]] = None) -> dict:
    if base_rate is None:
        base_rate = [1.0 / len(belief)] * len(belief)
    return {"belief": belief, "uncertainty": uncertainty, "baseRate": base_rate}


def binomial(b: float, d: float, u: float, a: float = 0.5) -> dict:
    return opinion([b, d], u, [a, 1.0 - a])


def post(client: TestClient, path: str, payload: dict) -> dict:
    response = client.post(path, json=payload)
    assert response.status_code == 200, response.text
    return response.json()
