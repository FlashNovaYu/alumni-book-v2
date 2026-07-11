# V2 项目目录整理设计

## 目标

将 `C:\Users\Administrator\Projects\alumnibook` 整理为以 `alumni-book-v2` 为唯一主项目入口的清晰结构，同时保留所有尚未合并的 Git 分支、有效未提交内容和独立项目。

## 最终结构

```text
C:\Users\Administrator\Projects\
├─ alumnibook\
│  ├─ alumni-book-v2\
│  │  └─ .worktrees\
│  └─ _archive\
│     └─ alumni-book-v10-master\
└─ r-alumnibook\
```

所有仍在使用的 V2 工作树统一放入 `alumni-book-v2\.worktrees`。Gemini 自动生成且仍有独立提交的隐藏工作树保留在其原始缓存位置，避免中断相关会话。

## 清理规则

1. 不修改、合并或重写任何业务分支。
2. 不触碰主工作树现有的未提交修改。
3. 仅移除提交已包含于 `main` 的临时工作树；存在未提交内容时先在项目目录外备份。
4. 对尚未包含于 `main` 的工作树，只进行 Git 感知的路径移动，不删除。
5. 分离头指针的评审工作树仍保留原提交和工作树登记。
6. 旧版 V10 只归档，不删除；独立 Rust 项目移出 V2 项目族目录。

## 备份

备份写入 `C:\Users\Administrator\Documents\ProjectArchives\alumnibook-cleanup-2026-07-12`。每个待清理工作树保存：

- 当前提交、分支和状态信息；
- 已跟踪文件的二进制安全补丁；
- 未跟踪文件清单；
- 未跟踪文件本体（如存在）。

## 执行顺序

1. 创建备份并验证备份文件存在。
2. 使用 `git worktree remove` 移除明确可清理的已合并工作树。
3. 使用 `git worktree move` 收纳仍活跃的顶层 V2 工作树。
4. 使用同一 PowerShell 进程、经绝对路径校验后移动 V10 和 Rust 项目。
5. 运行工作树、目录和状态验证，确认主工作树原有改动仍然存在。

## 成功标准

- `alumnibook` 顶层只保留主项目和旧版归档目录；
- 活跃 V2 工作树可由 Git 正常识别；
- 所有未合并提交仍可通过分支或工作树访问；
- 被移除工作树的未提交内容可从项目外备份恢复；
- 主项目整理前的未提交文件集合保持不变。
