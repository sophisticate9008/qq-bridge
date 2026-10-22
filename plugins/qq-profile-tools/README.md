# QQ 改名工具

DSH 原生工具 `mcp__snowluma__qq_change_nickname`，通过
`qq-agent-presets/qq-profile-tools.mjs` 装入聊天预设。
DeepSeek 从连续上下文决定是否执行、修改对象及新名字，不依赖群消息正则。

| target | 操作范围 |
| --- | --- |
| self_group_card | 机器人在当前群的名片 |
| owner_group_card | 主人在当前群的名片，受 QQ 群权限限制 |
| self_profile | 机器人 QQ 账号昵称 |

调用必须携带 key、token 和主人提出要求的 sourceMessageId。
后端 `/api/socialV2/profile/change` 校验当前 DSH 父会话、白名单、会话令牌和真实主人消息，
只接受当前会话最近 30 分钟的来源，不接受任意目标 QQ 号或群号。
模型负责判断语义上的执行意图；后端负责身份、范围、参数和实际执行。
单纯讨论、引用别人要求、含糊的新名字应澄清，不能擅自操作。

`src/local/profile-actions.js` 调用 OneBot 并读回，只有 `verified=true` 表示成功。
操作收据保存在忽略的 `state/qq-profile-actions.json`：同一来源消息重复调用返回原结果，
不能换参数再次执行；中断时保留未知结果，避免自动重复提交。需要重试时使用新的主人要求。
工具本身不向 QQ 发消息，聊天模型根据回执用人设表达。

同步：运行 `node scripts/build-agent-preset-patches.mjs`，再运行
`node ops/configure-local-chat.mjs`。DSH profile 支持热加载，重启 bridge 加载后端。
不要为同步工具重置聊天历史或中断已有 GPT 工作。
已有会话会保留旧预设代次，因此根插件 `qq-profile-live` 只向现有聊天会话补载工具，
不向 GPT 工作子代理安装。新会话直接从聊天预设加载，已注册时跳过，避免重复注册。

验证：`node --test scripts/test-qq-profile-tools.mjs`。
