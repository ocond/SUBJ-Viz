"""Runs the SUBJ-Viz server: python -m subjviz [--host HOST] [--port PORT] [--reload]."""

from __future__ import annotations

import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="SUBJ-Viz: subjective logic operator visualizer")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true", help="restart on code changes")
    args = parser.parse_args()
    uvicorn.run("subjviz.app:app", host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
