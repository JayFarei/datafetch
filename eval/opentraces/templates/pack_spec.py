"""Machine-readable template metadata for plan 011 M4/M5.

This module is the source used to render ``templates/pack.yaml`` and to build
question instances. Keep question text consumer-facing; schema vocabulary stays
out of prompts and instantiated questions.
"""

from __future__ import annotations

TEMPLATES = [
    {
        "id": "P1-T1",
        "persona": "P1",
        "slots": {"group_by": ["model", "project", "day"], "window": "utc_half_open"},
        "answer_type": "numeric_set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "aggregate",
        "solver": "eval/opentraces/solvers/p1_t1.py",
        "question_template": (
            "For sessions started in {window_label} (UTC), how many input, output, "
            "cache-read, and cache-write tokens were spent, grouped by {group_label}?"
        ),
    },
    {
        "id": "P1-T2",
        "persona": "P1",
        "slots": {"window": "utc_half_open", "threshold": "fraction"},
        "answer_type": "set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "filter",
        "solver": "eval/opentraces/solvers/p1_t2.py",
        "question_template": (
            "Which sessions started in {window_label} (UTC) had a cache hit rate below {threshold}?"
        ),
    },
    {
        "id": "P1-T3",
        "persona": "P1",
        "slots": {"n": "integer", "window": "utc_half_open"},
        "answer_type": "ordered_set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "aggregate",
        "solver": "eval/opentraces/solvers/p1_t3.py",
        "question_template": (
            "Which {n} sessions started in {window_label} (UTC) had the highest average "
            "fresh-input tokens per step?"
        ),
    },
    {
        "id": "P1-T4",
        "persona": "P1",
        "slots": {"window": "utc_half_open", "percent": "fraction"},
        "answer_type": "set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "temporal+aggregate",
        "solver": "eval/opentraces/solvers/p1_t4.py",
        "question_template": (
            "Within sessions started in {window_label} (UTC), find the highest-token day; "
            "which sessions, counting each captured run separately rather than grouping runs "
            "that share a session id, accounted for at least {percent_label} of that day's "
            "input+output tokens?"
        ),
    },
    {
        "id": "P1-T5",
        "persona": "P1",
        "slots": {"model": "model_name", "max_steps": "integer", "window": "utc_half_open"},
        "answer_type": "set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "filter",
        "solver": "eval/opentraces/solvers/p1_t5.py",
        "question_template": (
            "Which sessions started in {window_label} (UTC), used {model}, were marked committed "
            "in the capture record, and had at most {max_steps} steps?"
        ),
    },
    {
        "id": "P1-T6",
        "persona": "P1",
        "slots": {"skill": "skill_name", "window": "utc_half_open"},
        "answer_type": "numeric_pair",
        "tolerance": {"kind": "relative", "value": 0.01},
        "difficulty": "join-ish aggregate",
        "solver": "eval/opentraces/solvers/p1_t6.py",
        "question_template": (
            "For sessions started in {window_label} (UTC), what is the mean input+output token "
            "cost for sessions that invoked {skill} versus sessions that did not?"
        ),
    },
    {
        "id": "P1-T7",
        "persona": "P1",
        "slots": {"model": "absent_model_name", "window": "utc_half_open"},
        "answer_type": "abstain",
        "tolerance": {"kind": "tri_state", "value": None},
        "difficulty": "abstention",
        "solver": "eval/opentraces/solvers/p1_t7.py",
        "question_template": (
            "For sessions started in {window_label} (UTC), how many input+output tokens were spent on {model}?"
        ),
    },
    {
        "id": "P2-T1",
        "persona": "P2",
        "slots": {"window": "utc_half_open"},
        "answer_type": "set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "aggregate",
        "solver": "eval/opentraces/solvers/p2_t1.py",
        "question_template": (
            "Which skills were invoked by sessions started in {window_label} (UTC), and how many invocations did each have?"
        ),
    },
    {
        "id": "P2-T2",
        "persona": "P2",
        "slots": {"skill": "skill_name", "window": "utc_half_open"},
        "answer_type": "numeric_triple",
        "tolerance": {"kind": "relative", "value": 0.01},
        "difficulty": "filter+aggregate",
        "solver": "eval/opentraces/solvers/p2_t2.py",
        "question_template": (
            "For {skill}, among sessions started in {window_label} (UTC), how many sessions invoked it, "
            "what fraction ended committed, and what was their mean duration in seconds?"
        ),
    },
    {
        "id": "P2-T3",
        "persona": "P2",
        "slots": {"skill": "skill_name", "window": "utc_half_open"},
        "answer_type": "set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "filter",
        "solver": "eval/opentraces/solvers/p2_t3.py",
        "question_template": (
            "Which sessions started in {window_label} (UTC) invoked {skill} but were not marked committed in the capture record?"
        ),
    },
    {
        "id": "P2-T4",
        "persona": "P2",
        "slots": {"skill": "skill_name", "window": "utc_half_open"},
        "answer_type": "numeric_series",
        "tolerance": {"kind": "relative", "value": 0.01},
        "difficulty": "temporal aggregate",
        "solver": "eval/opentraces/solvers/p2_t4.py",
        "question_template": (
            "For {skill}, what was the mean input+output token cost by week for sessions started in {window_label} (UTC)?"
        ),
    },
    {
        "id": "P2-T5",
        "persona": "P2",
        "slots": {"skill": "skill_name", "window": "utc_half_open"},
        "answer_type": "set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "join-ish",
        "solver": "eval/opentraces/solvers/p2_t5.py",
        "question_template": (
            "Which other skills appeared in the same sessions as {skill} among sessions started in {window_label} (UTC)?"
        ),
    },
    {
        "id": "P2-T6",
        "persona": "P2",
        "slots": {"skill": "absent_skill_name"},
        "answer_type": "abstain",
        "tolerance": {"kind": "tri_state", "value": None},
        "difficulty": "abstention",
        "solver": "eval/opentraces/solvers/p2_t6.py",
        "question_template": "How did the retired skill {skill} perform in the frozen capture?",
    },
    {
        "id": "P3-T1",
        "persona": "P3",
        "slots": {"scope": "whole_snapshot"},
        "answer_type": "numeric_set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "aggregate",
        "solver": "eval/opentraces/solvers/p3_t1.py",
        "question_template": (
            "Across the whole frozen capture, how many sessions per project are marked shareable versus blocked, "
            "and what safety tiers do they carry?"
        ),
    },
    {
        "id": "P3-T2",
        "persona": "P3",
        "slots": {"project": "project_name"},
        "answer_type": "set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "filter",
        "solver": "eval/opentraces/solvers/p3_t2.py",
        "question_template": "Which sessions in project {project} are blocked from sharing, grouped by safety tier?",
    },
    {
        "id": "P3-T3",
        "persona": "P3",
        "slots": {"window": "utc_half_open"},
        "answer_type": "numeric_pair",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "aggregate",
        "solver": "eval/opentraces/solvers/p3_t3.py",
        "question_template": (
            "Across sessions started in {window_label} (UTC), how many redactions were applied and how many safety flags were reviewed?"
        ),
    },
    {
        "id": "P3-T4",
        "persona": "P3",
        "slots": {"scope": "whole_snapshot"},
        "answer_type": "set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "filter",
        "solver": "eval/opentraces/solvers/p3_t4.py",
        "question_template": "Across the whole frozen capture, which sessions have stale or missing safety scans?",
    },
    {
        "id": "P3-T5",
        "persona": "P3",
        "slots": {"project": "project_name", "window": "utc_half_open"},
        "answer_type": "composite_numeric_set",
        "tolerance": {"kind": "relative", "value": 0.01},
        "difficulty": "aggregate",
        "solver": "eval/opentraces/solvers/p3_t5.py",
        "question_template": (
            "Build the third-party usage report for project {project}, sessions started in {window_label} (UTC): "
            "session count, date range, input+output tokens, and shareable fraction."
        ),
    },
    {
        "id": "P3-T6",
        "persona": "P3",
        "slots": {"project": "absent_project_name"},
        "answer_type": "abstain",
        "tolerance": {"kind": "tri_state", "value": None},
        "difficulty": "abstention",
        "solver": "eval/opentraces/solvers/p3_t6.py",
        "question_template": "What is the sharing status of project {project}?",
    },
    {
        "id": "P4-T1",
        "persona": "P4",
        "slots": {"commit": "present_commit_sha"},
        "answer_type": "exact_trace",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "cross-store join",
        "solver": "eval/opentraces/solvers/p4_t1.py",
        "question_template": "Which captured session produced commit {commit}?",
    },
    {
        "id": "P4-T2",
        "persona": "P4",
        "slots": {"pattern": "path_contains", "window": "utc_half_open"},
        "answer_type": "numeric_pair",
        "tolerance": {"kind": "relative", "value": 0.01},
        "difficulty": "cross-store join",
        "solver": "eval/opentraces/solvers/p4_t2.py",
        "question_template": (
            "Among sessions with recorded activity events, how many sessions touched a file whose path contains "
            "\"{pattern}\" during {window_label} (UTC), and what did those sessions cost in input+output tokens?"
        ),
    },
    {
        "id": "P4-T3",
        "persona": "P4",
        "slots": {"project": "project_name", "window": "utc_half_open"},
        "answer_type": "numeric_pair",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "aggregate",
        "solver": "eval/opentraces/solvers/p4_t3.py",
        "question_template": (
            "For project {project}, among sessions started in {window_label} (UTC), how many sessions ran and how many commits were anchored?"
        ),
    },
    {
        "id": "P4-T4",
        "persona": "P4",
        "slots": {"window": "utc_half_open"},
        "answer_type": "numeric_pair",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "drift-spanning",
        "solver": "eval/opentraces/solvers/p4_t4.py",
        "question_template": (
            "Among sessions with recorded activity events in {window_label} (UTC), how many patches were created "
            "and how many later anchored to a git commit?"
        ),
    },
    {
        "id": "P4-T5",
        "persona": "P4",
        "slots": {"session": "captured_session_label", "step": "integer"},
        "answer_type": "set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "cross-store join",
        "solver": "eval/opentraces/solvers/p4_t5.py",
        "question_template": (
            "For captured session {session_label}, which context snapshots were observed at step {step_label}?"
        ),
    },
    {
        "id": "P4-T6",
        "persona": "P4",
        "slots": {"library": "substring", "window": "utc_half_open"},
        "answer_type": "numeric_plus_set",
        "tolerance": {"kind": "exact", "value": 0},
        "difficulty": "filter",
        "solver": "eval/opentraces/solvers/p4_t6.py",
        "question_template": (
            "How much work involved the exact text \"{library}\" in recorded patch paths or task descriptions "
            "for sessions started in {window_label} (UTC)?"
        ),
    },
    {
        "id": "P4-T7",
        "persona": "P4",
        "slots": {"commit": "absent_commit_sha"},
        "answer_type": "abstain",
        "tolerance": {"kind": "tri_state", "value": None},
        "difficulty": "abstention",
        "solver": "eval/opentraces/solvers/p4_t7.py",
        "question_template": "Which captured session produced commit {commit}?",
    },
]


TEMPLATE_BY_ID = {item["id"]: item for item in TEMPLATES}
