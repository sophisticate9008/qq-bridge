# 本机部署与长期维护

更新：2026-10-22。先部署可运行系统，再在自己的 Fork 迭代应用代码。

## 目录与责任

| 目录 | 职责 |
| --- | --- |
| `src/`、`plugins/`、`scripts/` | Fork 中的桥接实现；本机扩展集中在 `src/local/`、`plugins/owner-delegation/` |
| `dsh/agent-presets/` | 上游聊天预设权威源，本次保持不变 |
| `dsh/deployment/` | 可提交的工作协调预设和固定版本依赖清单 |
| `dsh/runtime/` | 实际 DSH 安装，含 package-lock，不提交 |
| `dsh/home/` | DSH profile、凭据和会话，不提交 |
| `protocols/snowluma/vendor/` | 官方 SnowLuma 发行包、账号配置，不提交 |
| `protocols/qq-client/vendor/` | 独立 QQ 客户端，不加载 NapCat，不提交 |
| `integrations/zhenxun/` | 真寻接入说明；本地 instance 链接指向原有实例 |
| `config/local/` | 密钥、主机信息、管理密码，目录 0700、文件 0600 |
| `ops/` | 本机启动、兼容加载器、可重复应用的聊天部署配置 |
| `ops/backups/` | 迁移前主机启动脚本及私有备份，不提交 |
| `runtime/`、`state/` | 日志、登录截图、探针证据、聊天状态，不提交 |

系统默认 Node.js 为官方 ARM64 Node 24.22.1，安装在
`/opt/nodejs/node-v24.22.1`，由 `/usr/local/bin/node/npm/npx` 使用。
原发行版 `/usr/bin/node` 未覆盖；本项目启动器明确使用升级后的 Node。
DSH 0.2.1-rc.2，SnowLuma 2.1.1。不要无验证地追随 latest。

## 连接拓扑

```text
QQ 客户端 → SnowLuma
              ├─ OneBot WS 127.0.0.1:3001 → QQ Bridge → DSH :3080
              ├─ OneBot HTTP 127.0.0.1:3000 ← Bridge / MCP
              └─ 反向 WS → 真寻 127.0.0.1:8080/onebot/v11/ws
```

控制台：桥接 `127.0.0.1:3100`，DSH `127.0.0.1:3080`，SnowLuma `127.0.0.1:5099`。
均使用各自鉴权。桥接 API 接受 `x-console-token`，不是 Bearer；令牌在本地 `config.json`。
DSH 使用本地浏览器会话 Cookie；不要把带登录 token 的 URL 写到公开文档或日志报告里。

真寻本体、插件和数据库保留原位。主机 `/root/service_boot/service-boot.sh`
已把 NapCat 的自动启动换成 `ops/stack.sh start`，备份位于 `ops/backups/`。
原 NapCat 文件保留，运行进程已经停止。

## 模型分工

| 场景 | 模型 / 路由 | 行为 |
| --- | --- | --- |
| 日常群聊、私聊 | `deepseek-official / deepseek-flash` | 使用现有小鲸鱼角色，短句、口语化 |
| 直接工作默认模型 | `local-gpt / gpt-6.1-sol` | 本机现有 API，Responses 协议 |
| 工作协调 | 同一个 DeepSeek QQ 聊天会话 | 从连续上下文判断并委派，结果回到原会话 |
| 工作执行子代理 | 固定 `local-gpt / gpt-6.1-sol`、high | standard 工具面，负责实际工作与技术结论 |

`deepseek-flash` 是官方映射到 DeepSeek-V4.1-Flash-1017 的 API 名称；映射将来可能变化，
升级前核对 [官方模型说明](https://api-docs.deepseek.com/quick_start/pricing/)。
GPT 按 [Responses API](https://developers.openai.com/api/docs/models/gpt-6.1-sol) 对接本机已有网关。

协调预设不提供直接 shell / 文件工具，只给 GPT 派工及沟通工具。
预设明确要求保留 GPT 的纠错、阻塞条件、风险和证据；有异议反馈给 GPT 复核，
失败时不得由 DeepSeek 静默替代，也不能虚报完成。
这是提示词及工具分工约束，尚未实现对最终文本的程序化一致性检查。

当前默认二代仿真 `reserved2`，**无需切换模式**。聊天会话挂载
`plugins/owner-delegation/` 原生 DSH 委派插件，DeepSeek 自行决定何时使用
`qq_delegate_work`，把当前对话的需求、背景、约束交给固定 GPT 子代理。
父会话及其历史不重置，子代理以 `delivery: parent` 自动回传结果；主人补充需求时
用 `qq_work_followup` 继续同一 childId。后台执行期间父会话继续聊天。
技术过程留在内部上下文，群里用小鲸鱼人设表达简短结论；不直播命令、路径、日志。
这部分表达与结论一致性受提示词约束，并非程序能够证明的语义保证。

委派授权在桥接后端验证真实 OneBot `user_id`、源 `messageId`、当前会话令牌及父会话 ID。
每条主人消息只授权一次，30 分钟后过期；群友自称主人、引用和跨会话调用不授权。
原始主人要求由后端附给 GPT，不只采用模型改写。授权和父子关系持久化在
`state/owner-delegations.json`（不提交）。GPT 若要求审批/澄清，发往主人私聊，
使用“工作批准 / 工作拒绝 / 工作答复 内容”，其他聊天不被消费为审批。

`qq-coordinator` 保留用于管理端手动工作；日常 QQ 派工不依赖全局模式切换。
聊天模型选择可能同步改变 DSH 全局默认，但子代理路由固定，不受影响。

聊天思考强度为 **off**（已补桥接支持），GPT 工作使用 high。
消息合并 1 秒，短静默 0.5–1 秒，连续消息静默 1.5 秒，明确未说完 3 秒。
关闭五分钟沉睡观察及无消息时的自动回复检查。保留实际消息驱动，不通过长等待占住回合。
主人消息无需 @；小鲸鱼、鲸鲸、大肥鱼也会唤醒，且不受模型临时潜水配置覆盖。
延迟还取决于网络、模型和工具耗时，不作固定秒数承诺。

本机部署覆盖保存在 `dsh/deployment/chat-persona.txt` 和 `roles/鲸鲸.md`，
执行 `node ops/configure-local-chat.mjs` 可重建 profile 覆盖与聊天策略，不改上游预设源。
重启 DSH 与 bridge 加载，保留 `state/sessions.json`，**不要以重置聊天解决配置更新**。

主人改名入口支持“把我的群名片改成 名字”“把你的群名片改成 名字”“把你的昵称改成 名字”，
也支持 `/名片 名字`、`/机器人名片 名字`、`/机器人昵称 名字`。
这是 OneBot 实际操作并读回核验，不是模型口头答应。机器人不能修改他人的 QQ 账号昵称；
群主名片须群主自己修改，普通成员机器人也不能替别人改名片。

## 运维

```bash
cd /root/qq-bridge
./ops/stack.sh status
./ops/stack.sh start
./ops/stack.sh stop
./ops/stack.sh restart
```

`start` 不重复启动已有 screen 会话；`restart` 会中断正在运行的会话，并可能需要重新扫码。
进程管理使用 screen，适合当前没有 systemd 的主机；进程崩溃后需要重新 start，尚无自动守护重启。
真寻由原主机启动脚本管理，不包含在 stack 的 stop 内。

日志位于 `runtime/logs/`。QQ 登录截图为 `runtime/qq-login-scan.png` 和 `runtime/qq-login.png`，
是抓取时的静态图片，二维码过期需要刷新重新截图。
SnowLuma `hookAutoLoad=true`，重启后自动重新接入已运行 QQ。

新增群只修改 `config.json` 的 `allow.groups`，随后重启 bridge；保持 `allowAllWhenEmpty=false`。
管理员私聊由 `ownerQQ` 与 `allow.private` 管理。真实 QQ 号、白名单及 URL 保存在本地配置。

## 本次部署的兼容处理

1. 上游 `new WebSocket(url, {headers})` 依赖 ws 的扩展；Node 内置 WebSocket 不发送该鉴权头。
   `ops/node-websocket.mjs` 只在 bridge 进程启动时加载 ws，避免修改桥接内核。
2. DSH 0.2.1 不再接受上游聊天预设的 `{{cwd}}` 提示词变量。
   本地 profile 覆盖两个聊天 preset 的 persona 并清空 suffix，挂载主人委派插件；源预设不变。
3. 初始部署故障期的会话曾归档一次。本轮连续上下文改造保留现有会话 ID 和聊天历史。

## 验证与边界

- DeepSeek 官方 API 与 GPT Responses API 均实际请求成功，响应模型符合配置。
- DSH Cookie 鉴权验证 16 项通过。
- 带 ws 加载器的 RPC / 事件流 / 队列清理探针通过。
- qq-chat 和 qq-chat-v2 两个聊天预设实际调用只读 SnowLuma 状态工具成功，无本地工具调用。
- DeepSeek 实际派出 GPT 子代理计算 19×23，结果 437；子会话持久化记录确认
  provider=local-gpt、model=gpt-6.1-sol、reasoningEffort=high。
- 新增主人/唤醒/委派授权测试及原等待、预设契约均通过，消息水位回归 36/36 通过。
- 原生委派实测：父会话保留代号，委派期间能继续聊天；结果 437 自动回到父会话，
  补充任务复用同一 GPT 子代理得到 438。证据保存在 `runtime/native-delegation-evidence.json`。
- 当前聊天预设实际以 reasoningEffort=off 调用只读工具成功。
- 真寻实际配置加载结果为三个新呼叫名和“小鲸鱼”自称，已重启。
- SnowLuma `get_login_info` 确认原机器人账号，`get_status` online/good 均为 true。
- SnowLuma 已连到真寻反向 WebSocket；协议端重启恢复也已经验证。
- 没有额外向群发送测试消息。真实群内体验仍需用户使用后确认。
- 上游 `verify:adaptation` 脚本把自定义 preset insert 误当 MCP，读取 args[0] 时退出；
  **该整体验证未通过**，以上结论来自独立实际检查，不能用它冒充全量通过。

## 备份、升级与 Fork

备份 `config.json`、`config/local/`、`dsh/home/`、`state/`、SnowLuma config/data，以及真寻原数据库。
备份包含凭据和聊天记录，只保存到私有位置。发布前检查 `git diff --cached`，不使用 `git add -f` 绕过忽略规则。

`upstream` 为 Derpyu520/qq-bridge，自己的 Fork 使用 `origin`；本地部署分支为 `feat/local-hybrid-stack`。
升级时先备份，再 fetch upstream，在独立分支处理差异，验证鉴权、事件流、两个模型、委派、QQ 与真寻，
最后再切换运行目录。避免直接覆盖正在运行的 vendor 或运行 npm update。

后续应用迭代优先做：GPT 结果一致性校验、委派观测与失败恢复、进程守护、
适配测试正确识别自定义 preset。新功能放独立模块，必要的内核接缝保持小而可测。
