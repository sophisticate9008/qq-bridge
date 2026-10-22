# DeepSeek Harness

- `agent-presets/`：上游桥接的聊天预设，保持上游版本。
- `runtime/`：本机固定版本的 DSH npm 安装，不提交。
- `home/`：DSH_HOME，包含 profile、凭据、会话及设置，不提交。

本次部署 DSH 0.2.1-rc.2。上游桥接声明适配 0.2.0-rc.2，必须以实际鉴权、RPC、模型和会话验证为准。

日常 QQ 聊天使用官方 `deepseek-flash`（官方当前映射 V4.1-Flash-1017）。
GPT provider 为 `local-gpt`，工作模型固定 `gpt-6.1-sol`，使用本机已有 API 的 Responses 协议。
密钥仅在 `home/.credentials.yaml` 和 `config/local/models.json`，权限 0600。

桥接上游当前仅允许 low / high / max，会把 off 改回 max；在暂不修改应用代码的阶段使用 low。
官方 API 的独立非思考模式已实测，后续 Fork 再加入完整 off 支持，不能将 low 宣称为关闭思考。
