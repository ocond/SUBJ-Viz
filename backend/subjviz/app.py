"""FastAPI application serving the SUBJ-Viz API and, if built, the frontend."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Callable, List, TypeVar

import pysubj as sj
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from . import __version__
from . import models as m
from . import operators

REPO_ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = Path(os.environ.get("SUBJVIZ_STATIC_DIR", REPO_ROOT / "frontend" / "dist"))
PATCH_DIR = Path(os.environ.get("SUBJVIZ_PATCH_DIR", REPO_ROOT / "patches" / "subj"))

T = TypeVar("T")


def _subj_call(function: Callable[[], T]) -> T:
    """Reports argument errors raised by SUBJ as 422 responses."""
    try:
        return function()
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def _patch_subjects() -> List[str]:
    subjects = []
    for patch in sorted(PATCH_DIR.glob("*.patch")):
        lines = patch.read_text(encoding="utf-8").splitlines()
        for index, line in enumerate(lines):
            if line.startswith("Subject:"):
                subject = line
                # Long subjects are folded onto indented continuation lines
                for continuation in lines[index + 1 :]:
                    if not continuation.startswith(" "):
                        break
                    subject += continuation
                subjects.append(subject.split("]", 1)[-1].strip())
                break
    return subjects


api = APIRouter(prefix="/api")


@api.get("/info", response_model=m.InfoResponse)
def info() -> m.InfoResponse:
    return m.InfoResponse(
        subjviz_version=__version__, pysubj_version=sj.__version__, patches=_patch_subjects()
    )


@api.post("/opinions", response_model=m.OpinionResponse, response_model_exclude_none=True)
def opinions(request: m.OpinionRequest) -> m.OpinionResponse:
    return _subj_call(lambda: operators.opinions(request))


@api.post("/deduction", response_model=m.DeductionResponse, response_model_exclude_none=True)
def deduction(request: m.DeductionRequest) -> m.DeductionResponse:
    return _subj_call(lambda: operators.deduction(request))


@api.post("/fusion", response_model=m.FusionResponse, response_model_exclude_none=True)
def fusion(request: m.FusionRequest) -> m.FusionResponse:
    return _subj_call(lambda: operators.fusion(request))


@api.post("/unfusion", response_model=m.UnfusionResponse, response_model_exclude_none=True)
def unfusion(request: m.UnfusionRequest) -> m.UnfusionResponse:
    return _subj_call(lambda: operators.unfusion(request))


@api.post(
    "/trust-discounting",
    response_model=m.TrustDiscountingResponse,
    response_model_exclude_none=True,
)
def trust_discounting(request: m.TrustDiscountingRequest) -> m.TrustDiscountingResponse:
    return _subj_call(lambda: operators.trust_discounting(request))


@api.post(
    "/multiplication", response_model=m.MultiplicationResponse, response_model_exclude_none=True
)
def multiplication(request: m.MultiplicationRequest) -> m.MultiplicationResponse:
    return _subj_call(lambda: operators.multiplication(request))


def create_app() -> FastAPI:
    app = FastAPI(title="SUBJ-Viz", version=__version__)
    app.include_router(api)
    if STATIC_DIR.is_dir():
        app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
    return app


app = create_app()
