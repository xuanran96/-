from scripts.evaluate_reuse_candidate import evaluate


def candidate() -> dict:
    return {
        "trigger": "每次完成同类项目后",
        "inputs": ["项目产物"],
        "steps": ["检查证据"],
        "outputs": ["候选结论"],
        "completion_checks": ["阈值全部满足"],
        "candidate_signals": {
            "recurs_periodically": True,
            "similar_input_shape": True,
            "stable_steps": True,
        },
        "evidence": {
            "occurrences": 3,
            "independent_projects_or_sessions": 2,
            "verified_successes": 4,
            "verified_attempts": 5,
            "historical_replays": 3,
            "historical_replays_covered": 3,
        },
        "safety_review": {
            "secrets_removed": True,
            "personal_data_removed": True,
            "sensitive_business_content_removed": True,
        },
    }


def test_eligible_candidate_passes() -> None:
    eligible, gaps = evaluate(candidate())
    assert eligible
    assert gaps == []


def test_insufficient_evidence_stays_collecting() -> None:
    value = candidate()
    value["evidence"]["occurrences"] = 1
    value["evidence"]["verified_successes"] = 1
    value["evidence"]["verified_attempts"] = 3
    eligible, gaps = evaluate(value)
    assert not eligible
    assert len(gaps) == 3


def test_unverified_safety_blocks_candidate() -> None:
    value = candidate()
    value["safety_review"]["personal_data_removed"] = False
    eligible, gaps = evaluate(value)
    assert not eligible
    assert "安全清理尚未全部确认" in gaps


def test_candidate_needs_three_value_signals() -> None:
    value = candidate()
    value["candidate_signals"] = {"stable_steps": True, "clear_artifact": True}
    eligible, gaps = evaluate(value)
    assert not eligible
    assert "候选价值信号少于 3 项" in gaps


def test_candidate_needs_historical_replay() -> None:
    value = candidate()
    value["evidence"]["historical_replays"] = 2
    value["evidence"]["historical_replays_covered"] = 2
    eligible, gaps = evaluate(value)
    assert not eligible
    assert "尚未完成 3 个历史任务回放并覆盖大多数案例" in gaps
