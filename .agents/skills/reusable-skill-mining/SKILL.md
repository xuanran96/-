---
name: reusable-skill-mining
description: 从多个项目或聊天中提取重复且经过验证的场景，并量化判断是否适合沉淀为正式技能。用于项目复盘、重复操作归纳和技能候选评审；不用于根据一次聊天直接生成或发布技能。
---

# 复用技能候选评审

1. 阅读 `docs/REUSE_FROM_CHATS.md`。
2. 只提取场景、触发、输入、步骤、输出、完成检查、纠正和边界，并先移除敏感内容。
3. 合并语义相同的候选，不用措辞相似代替场景相同。
4. 使用 `templates/project/04-reuse-candidates.json` 记录真实次数、独立范围和验证证据。
5. 运行 `python scripts/evaluate_reuse_candidate.py <candidate-file>`。
6. 未通过时保持 `collecting` 并记录缺口；通过时改为 `eligible` 并请求使用者确认。
7. 只有使用者明确同意后才改为 `approved`，再交给技能创建工具进行结构校验和真实场景验证。

不得伪造次数、成功率或来源，不得因为总结完整就判定技能成熟，不得自动安装或发布技能。

# 备注说明

- 候选说明使用简体中文，Skill 名称、命令和状态值保留英文。
- 无法脱敏的内容不进入候选文件，只记录不含敏感正文的来源编号。
