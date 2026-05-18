#!/usr/bin/env python3
"""jsonplaceholder tool runner.

Mirrors the SkillCraft Python bridge interface expected by
`src/snippet/dfBinding.ts::invokeSkillcraftTool`. Spawned as:

    python3 jsonplaceholderToolRunner.py \
        --skillcraft-dir <dir> \
        --bundle jsonplaceholder \
        --tool <name> \
        --args '<json>'

Always prints exactly one JSON line to stdout of the shape
`{"result": {...}}` and exits 0. The substrate parses
`JSON.parse(proc.stdout).result` and an exit-nonzero is a separate
error code path, so this runner must NEVER raise.
"""

import argparse
import json
import sys
import urllib.error
import urllib.request

BASE_URL = "https://jsonplaceholder.typicode.com"
TIMEOUT_SECONDS = 5.0


def emit(result):
    sys.stdout.write(json.dumps({"result": result}))
    sys.stdout.write("\n")
    sys.stdout.flush()


def fail(message, tool, input_data):
    emit({
        "success": False,
        "error": message,
        "tool": tool,
        "input": input_data if input_data is not None else {},
    })


def http_get_json(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        raw = resp.read()
    return json.loads(raw.decode("utf-8"))


def dispatch(tool, input_data):
    if tool == "getUsers":
        data = http_get_json(BASE_URL + "/users")
        return {"success": True, "users": data}

    if tool == "getUser":
        if not isinstance(input_data, dict) or "id" not in input_data:
            raise ValueError("missing required arg 'id'")
        user_id = input_data["id"]
        data = http_get_json(BASE_URL + "/users/" + str(user_id))
        return {"success": True, "user": data}

    if tool == "getPosts":
        data = http_get_json(BASE_URL + "/posts")
        return {"success": True, "posts": data}

    if tool == "getPostsByUser":
        if not isinstance(input_data, dict) or "userId" not in input_data:
            raise ValueError("missing required arg 'userId'")
        user_id = input_data["userId"]
        data = http_get_json(BASE_URL + "/posts?userId=" + str(user_id))
        return {"success": True, "posts": data}

    if tool == "getCommentsByPost":
        if not isinstance(input_data, dict) or "postId" not in input_data:
            raise ValueError("missing required arg 'postId'")
        post_id = input_data["postId"]
        data = http_get_json(BASE_URL + "/comments?postId=" + str(post_id))
        return {"success": True, "comments": data}

    raise ValueError("unknown tool '" + str(tool) + "'")


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--dataset-dir", required=False, default="")
    parser.add_argument("--bundle", required=False, default="")
    parser.add_argument("--tool", required=False, default="")
    parser.add_argument("--args", required=False, default="")

    try:
        ns = parser.parse_args()
    except SystemExit:
        # argparse exits non-zero on bad CLI; intercept to honor the
        # "always exit 0 with a JSON envelope" contract.
        fail("invalid CLI arguments", tool="", input_data={})
        sys.exit(0)

    bundle = ns.bundle or ""
    tool = ns.tool or ""
    raw_args = ns.args or ""

    if bundle != "jsonplaceholder":
        emit({"success": False, "error": "unknown bundle " + bundle})
        sys.exit(0)

    if raw_args.strip() == "":
        input_data = {}
    else:
        try:
            input_data = json.loads(raw_args)
        except (ValueError, TypeError) as exc:
            fail("invalid --args JSON: " + str(exc), tool=tool, input_data={})
            sys.exit(0)

    if input_data is None:
        input_data = {}

    try:
        result = dispatch(tool, input_data)
        emit(result)
        sys.exit(0)
    except urllib.error.HTTPError as exc:
        fail("HTTP " + str(exc.code) + " " + str(exc.reason), tool=tool, input_data=input_data)
        sys.exit(0)
    except urllib.error.URLError as exc:
        fail("network error: " + str(exc.reason), tool=tool, input_data=input_data)
        sys.exit(0)
    except (ValueError, TypeError) as exc:
        fail(str(exc), tool=tool, input_data=input_data)
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001 - contract: never raise
        fail("unexpected error: " + str(exc), tool=tool, input_data=input_data)
        sys.exit(0)


if __name__ == "__main__":
    main()
