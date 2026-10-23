# QQ 会话上下文分级（2026-10-23）

按会话类型选择 DeepSeek 的上下文预算；同一群、同一私聊继续复用自己的连续会话，聊天与工作意图不会导致聊天会话另起一套。

| 会话 | DSH 上下文容量 | 主用内部路由 | 官方备用内部路由 |
| --- | ---: | --- | --- |
| 群聊 | 172K / 176,128 token | `deepseek-primary-group` | `deepseek-official-group` |
| 私聊 | 384K / 393,216 token | `deepseek-primary` | `deepseek-official` |
| GPT 工作 | 512K / 524,288 token，保持原配置 | `local-gpt` | 无 |

K 按 1024 计算。容量是 DSH 的预算及原生压缩策略输入，包括提示词、工具定义等开销，并非全部用于聊天原文；接近预算时 DSH 会按自身策略压缩历史。长期记忆和单次上下文是不同机制，384K 不代表无限保留所有原文。

## 实现与缓存

`config.json` 的 `dsh.conversationContext=true` 启用分级。`src/local/chat-context-policy.js` 统一保存容量和路由规则，Bridge 根据 `group:` / `private:` 会话键选择模型。GPT 或其他未知 provider 不受该映射影响。

DSH 的容量绑定在 provider/model 上，因此 `plugins/qq-context-routing/index.mjs` 为群聊注册两个内部路由，返回 172K 的模型元数据，并委托原有原生 adapter 发请求。基础 DeepSeek adapter 配置为 384K，供私聊使用；主用、备用仍是原来的两个真实渠道，密钥、接口地址和上游模型不变。没有增加一层模型推理，也没有新增收费渠道。

群聊 adapter 保留原生重试、图像规则及单次调用绑定的配置版本。历史中的 alias 来源标签在发送边界还原为真实 provider，确保原生 reasoning/signature replay 继续匹配。消息内容、工具、图片和 replayState 不因分级被重写；历史记录自身不修改。分级不保证渠道缓存必然命中，新会话首次仍需预热固定人设与工具前缀。

## 部署与检查

```bash
node ops/configure-chat-context.mjs
qqbridge restart dsh
qqbridge restart bridge
node scripts/test-chat-context.mjs
node scripts/test-audit-bridge.mjs
qqbridge doctor
```

部署脚本备份私有配置，应用 DeepSeek 基础容量与既有超时策略，安装本地插件并启用 Bridge 分级。不自动清空上下文或改变调度暂停状态，也不修改 GPT 配置。单独运行 `ops/configure-token-economy.mjs` 维护基础容量时仍是 384K，不会把群聊 alias 的 172K 覆盖掉。

运行中的只读核验可用 DSH `llm/listProviders`、`session/modelCatalog` 检查两个群聊路由可用；`settings/describe` 检查主用与备用基础容量为 393216、GPT 为 524288。检查结果只输出模型 ID、容量和状态，勿打印凭据或完整设置。

2026-10-23 经用户授权，迁移前暂停自动调度，停止并归档旧机器人聊天、学习和其委派会话，清除桥接映射、二代聊天状态和旧委派授权状态，再恢复原先开启的调度。保留原始日志及私有备份用于审计，旧会话不会接入新的聊天上下文。人格、配置、词库等独立资料保留。测试只使用离线夹具和只读运行时检查，没有发送 QQ 测试消息或发起付费推理。

后续只改容量时不必再次清空上下文；需要清空时应先暂停调度，确认没有在途任务，备份私有状态，重置聊天映射和二代状态并归档相关委派会话，最后恢复原来的暂停状态。重置不是删除审计日志。
