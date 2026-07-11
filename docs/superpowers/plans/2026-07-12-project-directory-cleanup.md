# V2 项目目录整理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不丢失分支、提交或未提交内容的前提下，将 V2 相关目录收纳到唯一主项目入口并清理已合并的临时工作树。

**Architecture:** 先在项目目录外建立逐工作树恢复备份，再用 Git 原生命令移除或移动工作树。普通目录移动全部在单一 PowerShell 进程中完成，并在移动前验证解析后的源和目标绝对路径。

**Tech Stack:** PowerShell 7、Git worktree、Git patch

---

### Task 1: 建立整理基线和恢复备份

**Files:**
- Create: `C:\Users\Administrator\Documents\ProjectArchives\alumnibook-cleanup-2026-07-12\manifest.txt`
- Create: `C:\Users\Administrator\Documents\ProjectArchives\alumnibook-cleanup-2026-07-12\worktrees\$worktreeName\status.txt`
- Create: `C:\Users\Administrator\Documents\ProjectArchives\alumnibook-cleanup-2026-07-12\worktrees\$worktreeName\tracked.patch`
- Create: `C:\Users\Administrator\Documents\ProjectArchives\alumnibook-cleanup-2026-07-12\worktrees\$worktreeName\untracked\`

- [ ] **Step 1: 记录主工作树整理前状态**

运行 `git status --porcelain=v1` 和 `git worktree list --porcelain`，将结果保存到备份清单。

- [ ] **Step 2: 备份所有准备移除的脏工作树**

对每个工作树保存 `git status`、`git diff --binary HEAD`、未跟踪文件清单及文件本体。预期每个脏工作树均存在状态文件和补丁文件。

- [ ] **Step 3: 验证备份**

检查清单和每个备份目录存在；有未跟踪文件的工作树必须能在 `untracked` 子目录找到对应文件。

### Task 2: 清理已合并的临时工作树

**Files:**
- Remove: `C:\Users\Administrator\.gemini\antigravity\brain\760be07f-5e85-4ff3-b35c-1a68572ee5ee\.system_generated\worktrees` 下所有 HEAD 已包含于 `main` 的评审工作树
- Remove: `C:\Users\Administrator\.gemini\antigravity\brain\eda9e6fb-d2fd-42a3-8464-744f3a24b598\.system_generated\worktrees` 下所有 HEAD 已包含于 `main` 的实现工作树
- Remove: `C:\Users\Administrator\Projects\alumnibook\alumni-book-v2\.worktrees\ui-audit-fixes`

- [ ] **Step 1: 再次验证可移除条件**

对每个候选项运行 `git merge-base --is-ancestor <HEAD> main`。只有退出码为 0 且备份已验证的项进入下一步。

- [ ] **Step 2: 使用 Git 移除工作树**

运行 `git worktree remove --force <绝对路径>`。`--force` 仅用于已经备份的生成文件、锁文件或未跟踪文件。

- [ ] **Step 3: 清理失效登记**

运行 `git worktree prune --verbose`，随后确认被移除路径不再出现在 `git worktree list`。

### Task 3: 收纳活跃 V2 工作树

**Files:**
- Move: `alumni-book-v2-gemini-direct` → `alumni-book-v2\.worktrees\gemini-direct`
- Move: `alumni-book-v2-gemini-frontend` → `alumni-book-v2\.worktrees\gemini-frontend`
- Move: `alumni-book-v2-gemini-migration` → `alumni-book-v2\.worktrees\gemini-migration`
- Move: `C:\Users\Administrator\Projects\alumni-book-v2-review-5a39384` → `alumni-book-v2\.worktrees\review-5a39384`

- [ ] **Step 1: 验证目标路径不存在**

解析每个目标的绝对路径，确认均位于 `alumni-book-v2\.worktrees` 且尚不存在。

- [ ] **Step 2: 使用 Git 移动工作树**

逐项运行 `git worktree move <源绝对路径> <目标绝对路径>`；每次移动后运行 `git -C <目标> status --short --branch`。

- [ ] **Step 3: 验证活跃内容**

确认移动前后的 HEAD、分支名和状态输出一致。

### Task 4: 整理非 V2 目录

**Files:**
- Move: `C:\Users\Administrator\Projects\alumnibook\alumni-book-v10-master` → `C:\Users\Administrator\Projects\alumnibook\_archive\alumni-book-v10-master`
- Move: `C:\Users\Administrator\Projects\alumnibook\r-alumnibook` → `C:\Users\Administrator\Projects\r-alumnibook`

- [ ] **Step 1: 验证绝对路径边界**

使用 `Resolve-Path` 验证两个源目录位于 `C:\Users\Administrator\Projects\alumnibook`，并确认目标不存在。

- [ ] **Step 2: 在同一 PowerShell 进程中移动目录**

先创建 `_archive`，再用 `Move-Item -LiteralPath` 移动 V10 和 Rust 项目。

- [ ] **Step 3: 验证新位置**

确认源路径不存在、目标路径存在；在 Rust 新位置运行 `git status --short --branch`。

### Task 5: 最终完整性验证

**Files:**
- Modify: `C:\Users\Administrator\Documents\ProjectArchives\alumnibook-cleanup-2026-07-12\manifest.txt`

- [ ] **Step 1: 检查最终目录结构**

确认 `alumnibook` 顶层仅有 `alumni-book-v2` 和 `_archive`。

- [ ] **Step 2: 检查全部工作树**

运行 `git worktree list --porcelain`；对每个登记路径确认目录存在并可读取 HEAD。

- [ ] **Step 3: 检查主工作树原有修改**

将最终 `git status --porcelain=v1` 与基线比较。除本计划文档提交外，整理前用户修改集合必须保持一致。

- [ ] **Step 4: 写入最终清单**

把最终目录、工作树列表和验证结果追加到项目外 `manifest.txt`，确保未来可以追溯和恢复。
