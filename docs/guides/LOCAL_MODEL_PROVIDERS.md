# 本机模型渠道

## 渠道分工

| Provider | 用途 | 配置 |
| --- | --- | --- |
| `deepseek-primary` | 主用聊天、意图理解和工作委派 | 新渠道，`deepseek-v4.1-flash` / `off` |
| `deepseek-official` | 官方备用聊天渠道 | 原密钥保留，`deepseek-flash` / `off` |
| `local-gpt` | GPT 委派工作 | 原渠道保持 `gpt-6.1-sol` / `high` |

2026-10-23：主用地址更正为 `https://sub.soloxiaoye.top:10000`，DSH 使用其 `/v1` 兼容接口。模型列表和实际响应均返回 `deepseek-v4.1-flash`；渠道没有单独列出带 `1017` 的版本 ID，因此使用这个已验证的 V4.1 Flash 标识。

两个 DeepSeek provider 独立保留，GPT 只有一个。主用关闭思考，沿用鲸鲸聊天人设及 GPT 委派策略。当前没有跨 provider 自动故障切换；官方渠道作为可切换的备用。

## 配置位置

- `config/local/models.json`：私有连接资料。`deepseek` 保留官方资料；新渠道在 `deepseekPrimary`；`deepseekRouting` 记录主备部署状态，不是自动故障切换实现。
- `dsh/home/.credentials.yaml`：凭据引用 `DEEPSEEK_PRIMARY_API_KEY`、`DEEPSEEK_API_KEY`、`LOCAL_GPT_API_KEY`。
- `dsh/home/profiles/web/cordis.patch.yml`：DSH 持久化配置。主用在 `llm-pi-ai.config.providers.deepseek-primary`；官方在 `llm-deepseek`；GPT 在 `llm-pi-ai.config.providers.local-gpt`。
- `config.json` 的 `dsh.provider/model/reasoningEffort` 和 DSH 的 `agent-default-model`：保持 `deepseek-primary / deepseek-v4.1-flash / off`。

密钥只保存在被 Git 忽略的私有文件中。搜索等仍需官方 API 的独立能力继续使用原官方凭据，不能把新渠道密钥覆盖到 `DEEPSEEK_API_KEY`。

## 切换与验证

渠道通过 DSH 设置接口热加载。已有 QQ 聊天会话通过 `session/selectModel` 切换下一次模型请求，保留会话 ID 和上下文；GPT 工作会话保持原选择。只重启 Bridge 使其读取新的默认配置，不重启 DSH 或 QQ。

需要长期切回官方时，同时更新 Bridge 配置、DSH 默认模型和已有聊天会话的选择为 `deepseek-official / deepseek-flash / off`，并重启 Bridge。只在控制台切一个会话不会替代部署默认配置。

已验证：模型列表、非流式回复、关闭思考、图片识色与工具调用、工具结果回传后的流式回复，以及独立 DSH `standard` 测试会话实际返回 `PROVIDER_OK`。测试未向 QQ 群发送消息。

运行 `qqbridge doctor` 检查本机服务。该检查本身不验证上游模型推理；渠道维护后还应执行一次隔离的模型调用。

主用的超时和重试调优见 [Token 排查记录](TOKEN_ECONOMY_AUDIT.md)：`node ops/configure-token-economy.mjs` 可重复应用本机优化配置。
