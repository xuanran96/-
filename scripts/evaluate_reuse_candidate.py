"""Evaluate reusable-skill candidates against the repository's admission rules."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REQUIRED_LISTS = ("inputs", "steps", "outputs", "completion_checks")
SAFETY_KEYS = (
    "secrets_removed",
    "personal_data_removed",
    "sensitive_business_content_removed",
)


def evaluate(candidate: dict) -> tuple[bool, list[str]]:
    evidence = candidate.get("evidence", {})
    safety = candidate.get("safety_review", {})
    successes = evidence.get("verified_successes", 0)
    attempts = evidence.get("verified_attempts", 0)
    rate = successes / attempts if attempts else 0
    signals = candidate.get("candidate_signals", {})
    signal_count = sum(value is True for value in signals.values())
    replays = evidence.get("historical_replays", 0)
    covered_replays = evidence.get("historical_replays_covered", 0)
    gaps: list[str] = []

    if signal_count < 3:
        gaps.append("候选价值信号少于 3 项")
    if evidence.get("occurrences", 0) < 3:
        gaps.append("同类场景少于 3 次")
    if evidence.get("independent_projects_or_sessions", 0) < 2:
        gaps.append("未覆盖至少 2 个独立项目或会话")
    if not candidate.get("trigger") or any(not candidate.get(key) for key in REQUIRED_LISTS):
        gaps.append("触发、输入、步骤、输出或完成检查不完整")
    if successes < 3:
        gaps.append("有证据的成功次数少于 3 次")
    if rate < 0.8:
        gaps.append(f"验证成功率 {rate:.0%} 低于 80%")
    if replays < 3 or covered_replays < 2:
        gaps.append("尚未完成 3 个历史任务回放并覆盖大多数案例")
    if not all(safety.get(key) is True for key in SAFETY_KEYS):
        gaps.append("安全清理尚未全部确认")

    return not gaps, gaps


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    data = json.loads(args.file.read_text(encoding="utf-8"))
    candidates = data.get("candidates", [])
    if not candidates:
        print("没有复用候选")
        return 1

    all_eligible = True
    for candidate in candidates:
        eligible, gaps = evaluate(candidate)
        candidate_id = candidate.get("id", "<missing-id>")
        print(f"{candidate_id}: {'ELIGIBLE' if eligible else 'COLLECTING'}")
        for gap in gaps:
            print(f"  - {gap}")
        all_eligible &= eligible
    return 0 if all_eligible else 1


if __name__ == "__main__":
    raise SystemExit(main())
