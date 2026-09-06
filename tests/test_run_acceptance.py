import copy
import json
from pathlib import Path
import subprocess
import sys

import pytest

from scripts.run_acceptance import run, validate


@pytest.fixture
def plan():
    return {
        "version": 1, "goal": "运行程序并得到正确输出",
        "criteria": [{"id": "AC-01", "description": "程序输出 42", "checks": ["cli"]}],
        "checks": [{"id": "cli", "kind": "runtime",
                    "command": ["{python}", "-c", "print(42)"], "stdout_contains": ["42"]}],
    }


def test_real_execution_and_immutable_rounds(plan, tmp_path):
    first = run(plan, tmp_path, tmp_path / "evidence")
    assert first["status"] == "automated_passed"
    evidence = Path(first["evidence_dir"])
    original = (evidence / "report.json").read_bytes()
    assert "42" in (evidence / first["checks"][0]["stdout_log"]).read_text()
    assert json.loads((evidence / "plan.json").read_text(encoding="utf-8")) == plan
    plan["checks"][0]["stdout_contains"] = ["43"]
    second = run(plan, tmp_path, tmp_path / "evidence")
    assert second["status"] == "needs_work"
    assert second["evidence_dir"] != first["evidence_dir"]
    assert second["plan_sha256"] != first["plan_sha256"]
    assert (evidence / "report.json").read_bytes() == original


def test_fix_and_retest_real_program(plan, tmp_path):
    program = tmp_path / "app.py"
    program.write_text("print(41)", encoding="utf-8")
    plan["checks"][0]["command"] = ["{python}", "app.py"]
    assert run(plan, tmp_path, tmp_path / "evidence")["status"] == "needs_work"
    program.write_text("print(42)", encoding="utf-8")
    assert run(plan, tmp_path, tmp_path / "evidence")["status"] == "automated_passed"


def test_expected_error_exit(plan, tmp_path):
    plan["checks"][0].update(
        command=["{python}", "-c", "import sys; print('invalid', file=sys.stderr); sys.exit(2)"],
        expected_exit=2, stdout_contains=[], stderr_contains=["invalid"],
    )
    assert run(plan, tmp_path, tmp_path / "evidence")["status"] == "automated_passed"
    plan["checks"][0]["expected_exit"] = 0
    assert run(plan, tmp_path, tmp_path / "evidence")["status"] == "needs_work"


@pytest.mark.parametrize("command,timeout", [
    (["definitely-missing-acceptance-executable"], 60),
    (["{python}", "-c", "import time; print('started', flush=True); time.sleep(20)"], 0.1),
])
def test_environment_and_timeout_never_pass(plan, tmp_path, command, timeout):
    plan["checks"][0].update(command=command, timeout_seconds=timeout)
    report = run(plan, tmp_path, tmp_path / "evidence")
    assert report["status"] == "blocked"
    assert report["criteria"][0]["status"] == "blocked"


def test_manual_conditions_remain_pending(plan, tmp_path):
    plan["criteria"].append({"id": "AC-02", "description": "用户确认交互体验", "manual": True})
    assert run(plan, tmp_path, tmp_path / "evidence")["status"] == "needs_review"


@pytest.mark.parametrize("mutation", [
    lambda p: p.update(version=True),
    lambda p: p.update(goal=" "),
    lambda p: p.update(checks=[]),
    lambda p: p.update(criteria=[]),
    lambda p: p["checks"].append(copy.deepcopy(p["checks"][0])),
    lambda p: p["criteria"].append(copy.deepcopy(p["criteria"][0])),
    lambda p: p["criteria"][0].update(checks=["missing"]),
    lambda p: p["criteria"][0].update(checks=[]),
    lambda p: p["criteria"][0].update(manual="true"),
    lambda p: p["checks"][0].update(kind="code"),
    lambda p: p["checks"][0].update(command="python app.py"),
    lambda p: p["checks"][0].update(timeout_seconds=0),
    lambda p: p["checks"][0].update(timeout_seconds=float("nan")),
    lambda p: p["checks"][0].update(timeout_seconds=True),
    lambda p: p["checks"][0].update(expected_exit=False),
    lambda p: p["checks"][0].update(stdout_contains="42"),
    lambda p: p["criteria"][0].update(checks=[], manual=True),
])
def test_bad_plans_rejected_before_execution(plan, mutation):
    mutation(plan)
    with pytest.raises(ValueError):
        validate(plan)


def test_all_checks_continue_after_failure(plan, tmp_path):
    plan["checks"][0]["stdout_contains"] = ["wrong"]
    plan["checks"].append({"id": "second", "kind": "runtime", "command": ["{python}", "-c", "print('ok')"]})
    plan["criteria"][0]["checks"].append("second")
    report = run(plan, tmp_path, tmp_path / "evidence")
    assert [check["status"] for check in report["checks"]] == ["failed", "passed"]
    assert report["status"] == "needs_work"


def test_cli_validation_does_not_execute(plan, tmp_path):
    plan["checks"][0]["command"] = ["{python}", "-c", "from pathlib import Path; Path('marker').touch()"]
    path = tmp_path / "plan.json"
    path.write_text(json.dumps(plan), encoding="utf-8")
    cli = Path(__file__).resolve().parents[1] / "scripts" / "run_acceptance.py"
    result = subprocess.run([sys.executable, str(cli), str(path), "--root", str(tmp_path)], capture_output=True)
    assert result.returncode == 0
    assert not (tmp_path / "marker").exists()


@pytest.mark.parametrize("expected,status", [(0, "automated_passed"), (1, "needs_work"), (2, "blocked"), (3, "needs_review")])
def test_cli_exit_codes(plan, tmp_path, expected, status):
    if expected == 1:
        plan["checks"][0]["stdout_contains"] = ["wrong"]
    elif expected == 2:
        plan["checks"][0]["command"] = ["definitely-missing-acceptance-executable"]
    elif expected == 3:
        plan["criteria"][0]["manual"] = True
    path = tmp_path / "plan.json"
    path.write_text(json.dumps(plan), encoding="utf-8")
    cli = Path(__file__).resolve().parents[1] / "scripts" / "run_acceptance.py"
    result = subprocess.run([sys.executable, str(cli), str(path), "--root", str(tmp_path),
                             "--output", str(tmp_path / "evidence"), "--run"], capture_output=True)
    assert result.returncode == expected
    reports = list((tmp_path / "evidence").glob("*/report.json"))
    assert json.loads(reports[0].read_text(encoding="utf-8"))["status"] == status


def test_shipped_example(tmp_path):
    root = Path(__file__).resolve().parents[1] / "examples" / "software-goal"
    plan = json.loads((root / "acceptance-plan.json").read_text(encoding="utf-8"))
    assert run(plan, root, tmp_path)["status"] == "automated_passed"


def test_unicode_output(plan, tmp_path):
    plan["checks"][0].update(command=["{python}", "-c", "print('验收成功')"], stdout_contains=["验收成功"])
    assert run(plan, tmp_path, tmp_path / "evidence")["status"] == "automated_passed"
