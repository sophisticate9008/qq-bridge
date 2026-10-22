# 主人工作委派

本机 DSH 0.2.1 插件，通过已安装的 `qq-agent-presets/owner-delegation.mjs` 加载。
依赖 `dsh/runtime/` 中同一套 DSH 工具及 schema 包，不安装另一套运行时。

- DeepSeek 保持原 QQ 会话和历史，以原生 `subagents.startActivation` 委派。
- GPT 固定 `local-gpt / gpt-6.1-sol / high`、`standard` 预设；完成消息回到父会话。
- `qq_delegate_work` 携带相关对话上下文；`qq_work_followup` 继续同一子代理。
- `qq_work_status` 只查询父会话自己的直接子代理，不应忙轮询。
- 群聊由 DeepSeek 按人设表达结果，不直播后台技术过程。

桥接 `src/local/delegation-authority.js` 从真实 OneBot 事件记录主人原话，校验源消息、
父会话及会话令牌。模型不能凭自称管理员获取权限。真实主人原话会再次附给 GPT，
不能仅依赖 DeepSeek 改写后的任务。源消息授权一次性消费，避免模型重试重复执行。
调用失败后需要主人重新下达要求；不会静默切换工作模型。

`Config.bridgePort` 仅供隔离的本机协议验证使用，始终连接回环地址；生产不设置，
从本机 `config.json` 读取端口。测试专用预设不会留在生产 profile。

验证：`node --test scripts/test-local-owner-work.mjs`。
真实模型链路还需验证父会话继续接话、自动结果回传、同一子代理接受后续要求，
并检查子会话 `modelSelection` 的实际 provider/model/effort。
