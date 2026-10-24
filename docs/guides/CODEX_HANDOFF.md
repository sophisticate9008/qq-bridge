# 本机 Codex 跨会话交接

更新：2026-10-24。供同机后续会话查找现有认证和维护资料；不包含密钥值。
这是交接快照，实际状态须读取当前配置，用户新指令优先于本文和旧审计记录。

## GitHub

- 工作目录：`/root/qq-bridge`。
- API：`gh` 已持久认证，配置 `/root/.config/gh/hosts.yml`，检查时文件权限为 `0600`。
- 2026-10-24 在移除 `GH_TOKEN`、`GITHUB_TOKEN` 环境变量的新进程中调用 API 成功，账号 `sophisticate9008`；仓库 API 返回 `permissions.push=true`。
- Git 使用 SSH，复用 `/root/.ssh/` 下的现有配置。API 认证和 Git SSH 认证是不同通道。
- `origin`：`git@github.com:sophisticate9008/qq-bridge.git`；`upstream`：`https://github.com/Derpyu520/qq-bridge.git`。
- 本次检查分支为 `feat/local-hybrid-stack`；后续先查看实际分支，不强行切回。用户要求自己的改动保留在 Fork。

无需查看 token 原文即可验证和使用：

```sh
gh api user --jq .login
gh api repos/sophisticate9008/qq-bridge --jq '{full_name: .full_name, push: .permissions.push}'
git remote -v
git status --short
```

按实际任务使用 `gh api`、`gh issue`、`gh pr`。不要运行会把 token 输出到聊天记录的命令；不要复制认证文件到仓库。
认证失败时先检查实际系统用户、`HOME`、`GH_CONFIG_DIR`、`XDG_CONFIG_HOME` 和环境变量覆盖，再判断是否过期。

## 其他 API 和运行配置的位置

以下路径相对项目根目录，均为本机私有配置，不能提交或整体打印：

| 路径 | 用途 |
| --- | --- |
| `config/local/models.json` | 本机模型 provider、URL、认证配置 |
| `dsh/home/.credentials.yaml` | DSH 凭据；含 `DEEPSEEK_PRIMARY_API_KEY`、`DEEPSEEK_API_KEY`、`LOCAL_GPT_API_KEY` 引用对应内容 |
| `dsh/home/profiles/web/cordis.patch.yml` | 实际 DSH provider、预设及工具挂载配置 |
| `config.json` | 桥接、控制台、协议端等实际配置和令牌 |
| `protocols/snowluma/vendor/` | SnowLuma 本机安装及账号配置；具体配置位置以启动脚本为准 |

在程序内部按需读取密钥；诊断输出只保留字段是否存在、脱敏信息和必要状态。
不要从历史对话复制旧密钥覆盖当前配置。更多说明见 [模型配置](LOCAL_MODEL_PROVIDERS.md)。

## 用户已确认的运行要求

- 小鲸鱼 / 鲸鲸 / 大肥鱼是唤醒称呼，不再用“真寻”唤醒。人格和协议分别在 `roles/鲸鲸.md`、`dsh/agent-presets/qq-chat-v2/agent.cordis.yml`。
- DeepSeek 负责仿真聊天和意图识别，工作可委派 GPT；称 GPT 为“GPT 姐姐”。保持连续上下文，群里不直播工作过程。
- DeepSeek 两个 provider（主用转发、官方备用），GPT 一个 provider。群聊上下文 172K、私聊 384K、GPT 512K；具体模型、路由和数值读取当前配置。见 [上下文分级](CHAT_CONTEXT_TIERS.md)。
- 定时主动找话题关闭：`socialV2.proactive.enabled=false`。黑话学习、自动研究及查询/提交工具关闭。正常唤醒和聊天调度继续启用；关闭主动话题不等于暂停所有调度。
- 主人也不是每条必答；明确 @ 或昵称呼叫是强唤醒，语境续聊另行判断。看图按语境和要求，激活窗口不代表每图必看，见 [看图策略](IMAGE_READING_POLICY.md)。
- DSH 只绑定本机回环，其他控制台按现有内网配置。启动栈用 SnowLuma，不恢复 NapCat 启动项。
- 不因维护、测试或同步提示词擅自清空会话。不要用大量真实模型请求测试文档或凭据发现。

## 运维和提示词同步

入口 `qqbridge` 链接到本项目 `ops/qqbridge`。只读检查用 `qqbridge status` / `qqbridge doctor`。
需要重启时优先 `qqbridge restart bridge` 或 `qqbridge restart dsh`；整套重启可能打断任务和 QQ 登录。

修改二代提示词后检查源、生成 patch 和已部署 profile 的差异：

```sh
node scripts/build-agent-preset-patches.mjs
node ops/sync-chat-persona.mjs
```

只有任务确需部署时才执行以上写入命令，并按需要重启 DSH。
`ops/sync-chat-persona.mjs` 用于同步 persona，避免重跑完整配置脚本覆盖其他配置。
当前工作树存在其他会话的代码和人格编辑：开始/提交前都查看 `git status`，不要批量暂存或回滚。

参考 [本机部署](LOCAL_DEPLOYMENT.md)、[CLI 和 boot](QQBRIDGE_CLI.md)、[目录地图](../FOLDER_MAP.md)。
早期部署和审计文档中“主动话题开启”“黑话工具可用”等是历史快照，不能据此恢复旧值。

## 会话共享范围

全局入口在 `/root/.codex/AGENTS.md`；项目入口在根目录 `AGENTS.md`。
同机、同系统用户且使用默认 Codex home 的新会话可加载全局入口；项目入口随仓库保存。
已开启的会话可显式读取这两份文件。不同机器、不同系统用户或自定义 `CODEX_HOME` 需另行配置入口和认证，Git clone 不会带上本机密钥。
依据：[OpenAI 官方 AGENTS.md 文档](https://learn.chatgpt.com/docs/agent-configuration/agents-md)。
