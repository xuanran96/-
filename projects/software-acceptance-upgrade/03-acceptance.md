# 验收记录：软件验收与目标完善

- 验收日期：2026-09-06
- 质量等级：Q2
- 结论：本地实现和验证完成，用户业务确认待进行。
- 源码基线：`4c5a99020ff55e476d2150e45f72a442cc2b83a7` 加本次未提交工作区修改。
- 环境：Windows，Python 3.13.13，pytest 9.1.1。

| 条件 | 验证方式 | 实际结果 | 证据 |
| --- | --- | --- | --- |
| AI 按目标完善 | 检查工作流、技能和模板的执行及结束条件 | 包含源码检查、运行、实现、修复、回归和阻塞恢复 | `docs/SOFTWARE_ACCEPTANCE.md`、项目技能及模板 |
| 检查与逐轮取证 | `python -m pytest -q` | 36 passed in 2.46s，包含已有测试 | `tests/test_run_acceptance.py`、`tests/test_evaluate_reuse_candidate.py` |
| 失败不会误报通过 | 测试错误退出码、输出不匹配、超时、缺失命令、人工条件和无效配置 | 全部通过 | 上述测试中的失败、阻塞和退出码用例 |
| 修改代码后可复测 | 用错误程序输出 41，修改成 42 再运行 | 首轮 needs_work，次轮 automated_passed | `test_fix_and_retest_real_program` |
| 实际程序可执行 | README 的示例命令 | 4 项运行检查通过 | 本地 `acceptance-runs/20260906T154939Z-b2ae27b9/report.json` 与原始日志 |
| 技能与 Python 文件有效 | skill-creator 的 `quick_validate.py`、`python -m compileall -q scripts` | Skill is valid，编译通过 | 本次本地执行结果 |

## 完善记录

- 首轮测试发现 Windows 超时异常携带的输出可能是字符串，原实现按字节解码导致失败。
  已同时兼容字符串和字节，复测通过。
- 增加 Python 子进程 UTF-8 输出配置与中文断言测试，关闭检查命令标准输入。

## 使用及限制

- 从 README 的 `$lightweight-project` 提示词开始，提供目标代码位置和最终目标。
- 验收工具不调用模型；需要运行本工作流的 AI 实际修改项目代码。
- 本次实际验证为本地 Windows / Python 3.13。CI 已配置 Windows、Linux 与 Python
  3.10、3.12，但远程 CI 尚未运行。
- 未进行浏览器、API 或桌面目标项目的真实任务回放，不宣称已经验证所有技术栈。
- 示例报告在本地忽略目录中，可用同一命令重新生成。超时不管理孙进程，测试夹具应清理服务。
- 修改尚未提交或推送至 GitHub；未进行安装发布或生产部署。
