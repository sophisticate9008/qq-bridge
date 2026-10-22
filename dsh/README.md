# DeepSeek Harness

- `agent-presets/`：上游桥接的聊天预设，保持上游版本。
- `runtime/`：本机固定版本的 DSH npm 安装，不提交。
- `home/`：DSH_HOME，包含 profile、凭据、会话及设置，不提交。

本次部署 DSH 0.2.1-rc.2。上游桥接声明适配 0.2.0-rc.2，必须以实际鉴权、RPC、模型和会话验证为准。

日常 QQ 聊天使用官方 `deepseek-flash`（官方当前映射 V4.1-Flash-1017）。
GPT provider 为 `local-gpt`，工作模型固定 `gpt-6.1-sol`，使用本机已有 API 的 Responses 协议。
密钥仅在 `home/.credentials.yaml` 和 `config/local/models.json`，权限 0600。

Fork 已补齐 off 支持，聊天使用 off，GPT 子代理固定 high。
`deployment/chat-persona.txt` 与 `plugins/owner-delegation/` 让同一个 DeepSeek 聊天会话进行原生委派；结果回到父上下文，后续要求复用子代理。
运行 `node ops/configure-local-chat.mjs` 应用本机覆盖，随后重启 DSH/bridge，不重置聊天历史。
