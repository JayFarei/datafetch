#!/usr/bin/env python3
"""CRAG finance tool bridge for the datafetch snippet runtime.

The substrate's df.tool bridge (src/snippet/dfBinding.ts) shells out to:

    python <runnerPath> --dataset-dir <dir> --bundle <b> --tool <t> --args <json>

and reads {"result": ...} from stdout. This runner implements the single
`cragFinance` bundle against the CRAG finance knowledge graph.

Backend selection:
  - Default: call cragapi.finance.FinanceKG IN-PROCESS. The shipped FastAPI
    server (server.py) eagerly instantiates ALL domain KGs in its lifespan
    (OpenKG, MovieKG, ...), and in this environment only the finance KG is
    downloaded; the other domains are git-LFS pointer files, so the server
    cannot boot ("OSError: Invalid data stream" decompressing the LFS stub).
    Calling FinanceKG directly hits the exact same KG code + sqlite data the
    server would serve, with no HTTP dependency. Deterministic (Apple ->
    AAPL -> PE 25.13, cap 2.78e12, EPS 7.17).
  - Opt-in HTTP: set CRAG_TOOL_BACKEND=http to POST to a running mock server
    (CRAG_MOCK_API_URL, default http://127.0.0.1:8000) using the endpoint
    names declared in server.py. Use this once the full KG set is fetched.

KG_BASE_DIRECTORY must point at the cragkg dir (the runner defaults it to the
sibling cragkg/ of --dataset-dir when unset).

Each tool maps to a POST endpoint:
  get_company_name           -> /finance/get_company_name        {query}
  get_ticker_by_name         -> /finance/get_ticker_by_name       {query}
  get_price_history          -> /finance/get_price_history        {query: ticker}
  get_detailed_price_history -> /finance/get_detailed_price_history {query: ticker}
  get_dividends_history      -> /finance/get_dividends_history     {query: ticker}
  get_market_capitalization  -> /finance/get_market_capitalization {query: ticker}
  get_eps                    -> /finance/get_eps                   {query: ticker}
  get_pe_ratio               -> /finance/get_pe_ratio              {query: ticker}
  get_info                   -> /finance/get_info                  {query: ticker}

The agent calls e.g. df.tool.cragFinance.get_pe_ratio({ ticker: "AAPL" }).
Tool args accept any of: ticker / ticker_name / query / name / company_name /
company — whichever the agent passes is forwarded as the {query} body the
FastAPI endpoint expects.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

# tool name -> (endpoint path, server query model wants a plain {query} body)
BUNDLE = "cragFinance"

ENDPOINTS = {
    "get_company_name": "/finance/get_company_name",
    "get_ticker_by_name": "/finance/get_ticker_by_name",
    "get_price_history": "/finance/get_price_history",
    "get_detailed_price_history": "/finance/get_detailed_price_history",
    "get_dividends_history": "/finance/get_dividends_history",
    "get_market_capitalization": "/finance/get_market_capitalization",
    "get_eps": "/finance/get_eps",
    "get_pe_ratio": "/finance/get_pe_ratio",
    "get_info": "/finance/get_info",
}

# Argument keys the agent might use for the single string payload. The first
# present non-empty value wins. All finance endpoints take a {query} body.
ARG_KEYS = ("ticker", "ticker_name", "query", "name", "company_name", "company", "symbol")


def base_url() -> str:
    return os.environ.get("CRAG_MOCK_API_URL", "http://127.0.0.1:8000").rstrip("/")


# tool name -> FinanceKG method name (in-process backend). The name tools
# take a free-text query; the rest take a ticker symbol.
KG_METHODS = {
    "get_company_name": "get_company_name",
    "get_ticker_by_name": "get_ticker_by_name",
    "get_price_history": "get_price_history",
    "get_detailed_price_history": "get_detailed_price_history",
    "get_dividends_history": "get_dividends_history",
    "get_market_capitalization": "get_market_capitalization",
    "get_eps": "get_eps",
    "get_pe_ratio": "get_pe_ratio",
    "get_info": "get_info",
}

_KG_SINGLETON = None


def get_finance_kg(dataset_dir: str):
    """Instantiate FinanceKG in-process. dataset_dir is the directory holding
    company_name.dict (eg .../cragkg/finance); its parent is the cragkg base
    the KG reads from. Sets KG_BASE_DIRECTORY when unset."""
    global _KG_SINGLETON
    if _KG_SINGLETON is not None:
        return _KG_SINGLETON
    if not os.environ.get("KG_BASE_DIRECTORY"):
        # dataset_dir is .../cragkg/finance; KG base is its parent (.../cragkg).
        if dataset_dir:
            os.environ["KG_BASE_DIRECTORY"] = os.path.dirname(os.path.abspath(dataset_dir))
    # The mock_api package (cragapi) lives two levels up from cragkg/finance.
    # Add the mock_api dir to sys.path so `import cragapi.finance` resolves.
    if dataset_dir:
        mock_api_dir = os.path.abspath(os.path.join(dataset_dir, "..", ".."))
        if mock_api_dir not in sys.path:
            sys.path.insert(0, mock_api_dir)
    from cragapi.finance import FinanceKG  # noqa: E402

    _KG_SINGLETON = FinanceKG()
    return _KG_SINGLETON


def call_kg(dataset_dir: str, tool: str, query: str) -> object:
    kg = get_finance_kg(dataset_dir)
    method = getattr(kg, KG_METHODS[tool])
    return method(query)


def extract_query(payload: dict) -> str:
    for key in ARG_KEYS:
        if key in payload and payload[key] not in (None, ""):
            return str(payload[key])
    # Fall back to the first scalar value supplied.
    for value in payload.values():
        if isinstance(value, (str, int, float)) and value not in (None, ""):
            return str(value)
    raise SystemExit(
        f"cragFinance tool: no query argument found in {json.dumps(payload)}; "
        f"expected one of {ARG_KEYS}"
    )


def post(path: str, body: dict, timeout: float) -> object:
    url = f"{base_url()}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
    parsed = json.loads(raw)
    # FastAPI endpoints wrap the value as {"result": ...}.
    if isinstance(parsed, dict) and "result" in parsed:
        return parsed["result"]
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", required=False, default="")
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--tool", required=True)
    parser.add_argument("--args", default="{}")
    parser.add_argument("--list", action="store_true")
    args = parser.parse_args()

    if args.bundle != BUNDLE:
        raise SystemExit(f"unknown bundle {args.bundle}; only '{BUNDLE}' is supported")

    if args.list:
        output({"bundle": BUNDLE, "tools": sorted(ENDPOINTS.keys())})
        return

    if args.tool not in ENDPOINTS:
        available = ", ".join(sorted(ENDPOINTS))
        raise SystemExit(f"unknown tool {args.tool}; available: {available}")

    try:
        payload = json.loads(args.args)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid --args JSON: {exc}") from exc
    if not isinstance(payload, dict):
        payload = {"query": payload}

    query = extract_query(payload)
    backend = os.environ.get("CRAG_TOOL_BACKEND", "inprocess").strip().lower()

    if backend == "http":
        timeout = float(os.environ.get("CRAG_TOOL_TIMEOUT_S", "60"))
        try:
            result = post(ENDPOINTS[args.tool], {"query": query}, timeout)
        except urllib.error.URLError as exc:
            output({
                "bundle": BUNDLE,
                "tool": args.tool,
                "result": {
                    "success": False,
                    "error": f"tool {args.tool} HTTP error: {exc}",
                    "tool": args.tool,
                    "query": query,
                },
            })
            return
        output({"bundle": BUNDLE, "tool": args.tool, "result": result})
        return

    # Default: in-process FinanceKG call.
    try:
        result = call_kg(args.dataset_dir, args.tool, query)
    except Exception as exc:  # noqa: BLE001 - surface any KG error as a tool result
        output({
            "bundle": BUNDLE,
            "tool": args.tool,
            "result": {
                "success": False,
                "error": f"tool {args.tool} KG error: {exc}",
                "tool": args.tool,
                "query": query,
            },
        })
        return
    output({"bundle": BUNDLE, "tool": args.tool, "result": result})


def _sanitize(obj: object) -> object:
    if isinstance(obj, float):
        if obj != obj or obj in (float("inf"), float("-inf")):
            return None
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


def output(value: object) -> None:
    print(json.dumps(_sanitize(value), ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
