"""Run explicit software acceptance checks and retain evidence; never edit code."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import uuid


def validate(plan: dict) -> None:
    """Reject incomplete plans before executing any command."""
    if not isinstance(plan, dict) or type(plan.get("version")) is not int or plan["version"] != 1:
        raise ValueError("version 必须为 1")
    if not isinstance(plan.get("goal"), str) or not plan["goal"].strip():
        raise ValueError("goal 必须说明最终目标")
    checks = plan.get("checks")
    criteria = plan.get("criteria")
    if not isinstance(checks, list) or not checks:
        raise ValueError("checks 不能为空")
    if not isinstance(criteria, list) or not criteria:
        raise ValueError("criteria 不能为空")
    ids = set()
    for check in checks:
        if not isinstance(check, dict):
            raise ValueError("check 必须为对象")
        key = check.get("id")
        if not isinstance(key, str) or not key.strip() or key in ids:
            raise ValueError("check id 必须非空且唯一")
        ids.add(key)
        if check.get("kind") not in ("code", "runtime"):
            raise ValueError(f"{key}: kind 必须为 code 或 runtime")
        command = check.get("command")
        if not isinstance(command, list) or not command or any(
            not isinstance(part, str) or not part for part in command
        ):
            raise ValueError(f"{key}: command 必须为非空参数数组")
        timeout = check.get("timeout_seconds", 60)
        if type(timeout) not in (int, float) or not math.isfinite(timeout) or timeout <= 0:
            raise ValueError(f"{key}: timeout_seconds 必须为有限正数")
        if type(check.get("expected_exit", 0)) is not int:
            raise ValueError(f"{key}: expected_exit 必须为整数")
        for field in ("stdout_contains", "stderr_contains"):
            values = check.get(field, [])
            if not isinstance(values, list) or any(
                not isinstance(value, str) or not value for value in values
            ):
                raise ValueError(f"{key}: {field} 必须为非空字符串组成的数组")
    criterion_ids = set()
    used_checks = set()
    for criterion in criteria:
        if not isinstance(criterion, dict):
            raise ValueError("criterion 必须为对象")
        key = criterion.get("id")
        if not isinstance(key, str) or not key.strip() or key in criterion_ids:
            raise ValueError("criterion id 必须非空且唯一")
        criterion_ids.add(key)
        if not isinstance(criterion.get("description"), str) or not criterion["description"].strip():
            raise ValueError(f"{key}: 缺少可观察的验收条件")
        refs = criterion.get("checks", [])
        if not isinstance(refs, list) or any(not isinstance(ref, str) or ref not in ids for ref in refs):
            raise ValueError(f"{key}: 引用了不存在的检查")
        manual = criterion.get("manual", False)
        if type(manual) is not bool or (not refs and not manual):
            raise ValueError(f"{key}: 必须关联检查或标记 manual")
        used_checks.update(refs)
    if used_checks != ids:
        raise ValueError("每项检查都必须关联验收条件")
    if not any(check["kind"] == "runtime" for check in checks):
        raise ValueError("软件验收至少需要一项 runtime 检查，不能只检查静态代码")


def run(plan: dict, root: Path, output: Path) -> dict:
    validate(plan)
    root = root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("root 必须为目标代码目录")
    output.mkdir(parents=True, exist_ok=True)
    folder = output / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    folder.mkdir()
    serialized = json.dumps(plan, ensure_ascii=False, indent=2)
    (folder / "plan.json").write_text(serialized, encoding="utf-8")
    results = []
    for index, check in enumerate(plan["checks"], 1):
        command = [sys.executable if part == "{python}" else part for part in check["command"]]
        result = {"id": check["id"], "kind": check["kind"], "command": command,
                  "started_at": datetime.now(timezone.utc).isoformat()}
        stdout = stderr = ""
        try:
            completed = subprocess.run(
                command, cwd=root, capture_output=True, text=True, encoding="utf-8",
                errors="replace", timeout=check.get("timeout_seconds", 60), shell=False,
                stdin=subprocess.DEVNULL, env={**os.environ, "PYTHONIOENCODING": "utf-8"},
            )
            stdout, stderr = completed.stdout, completed.stderr
            problems = []
            if completed.returncode != check.get("expected_exit", 0):
                problems.append(f"退出码 {completed.returncode}，预期 {check.get('expected_exit', 0)}")
            for field, actual in (("stdout_contains", stdout), ("stderr_contains", stderr)):
                for expected in check.get(field, []):
                    if expected not in actual:
                        problems.append(f"{field} 未包含 {expected!r}")
            result.update(status="failed" if problems else "passed",
                          exit_code=completed.returncode, problems=problems)
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout or ""
            stderr = error.stderr or ""
            if isinstance(stdout, bytes):
                stdout = stdout.decode("utf-8", errors="replace")
            if isinstance(stderr, bytes):
                stderr = stderr.decode("utf-8", errors="replace")
            result.update(status="blocked", problems=["检查超时；需诊断程序或环境，不得视为通过"])
        except OSError as error:
            result.update(status="blocked", problems=[str(error)])
        result["finished_at"] = datetime.now(timezone.utc).isoformat()
        for stream, content in (("stdout", stdout), ("stderr", stderr)):
            filename = f"{index:03d}-{stream}.log"
            (folder / filename).write_text(content, encoding="utf-8")
            result[stream + "_log"] = filename
        results.append(result)
    by_id = {result["id"]: result["status"] for result in results}
    outcomes = []
    for criterion in plan["criteria"]:
        states = [by_id[ref] for ref in criterion.get("checks", [])]
        status = ("failed" if "failed" in states else "blocked" if "blocked" in states
                  else "needs_review" if criterion.get("manual") else "passed")
        outcomes.append({**criterion, "status": status})
    states = [item["status"] for item in outcomes]
    status = ("needs_work" if "failed" in states else "blocked" if "blocked" in states
              else "needs_review" if "needs_review" in states else "automated_passed")
    report = {"goal": plan["goal"], "status": status, "root": str(root),
              "plan_sha256": hashlib.sha256(serialized.encode("utf-8")).hexdigest(),
              "finished_at": datetime.now(timezone.utc).isoformat(),
              "checks": results, "criteria": outcomes,
              "evidence_dir": str(folder.resolve()),
              "limitation": "仅反映本次配置检查；AI 仍须核对目标覆盖、实际程序与最终代码版本。"}
    (folder / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    parser.add_argument("--root", type=Path, required=True, help="待验收代码目录；所有命令在此执行")
    parser.add_argument("--output", type=Path, default=Path("acceptance-runs"))
    parser.add_argument("--run", action="store_true", help="执行已检查的命令；默认仅验证配置")
    args = parser.parse_args()
    try:
        plan = json.loads(args.plan.read_text(encoding="utf-8-sig"))
        validate(plan)
        if not args.root.is_dir():
            raise ValueError("root 必须为存在的目标代码目录")
        if not args.run:
            print("配置有效；检查 command 内容后添加 --run 执行。")
            return 0
        report = run(plan, args.root, args.output)
    except (OSError, ValueError) as error:
        print(f"验收配置或文件错误：{error}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return {"automated_passed": 0, "needs_work": 1, "blocked": 2, "needs_review": 3}[report["status"]]


if __name__ == "__main__":
    raise SystemExit(main())
