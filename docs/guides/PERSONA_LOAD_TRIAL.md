# 鲸鱼娘人设标记试用（2026-10-23）

按用户明确要求，将从 `【PERSONA_LOAD】` 到 `TIMEOUT_SIGNAL` 的整段原文（包括空行和英文标记）加入鲸鲸角色卡与二代 DSH persona。原有人设正文、按需看图策略、主人身份校验和工具权限保持不变。

- 角色卡：`roles/鲸鲸.md`
- 预设源：`dsh/agent-presets/qq-chat-v2/agent.cordis.yml`
- 生成产物：`plugins/qq-agent-presets/presets/qq-chat-v2.patch.yml`

它是提供给模型的提示文本，没有新增激活指令解析器，`TIMEOUT_SIGNAL` 不与程序超时事件绑定。是否改变表达风格需观察实际聊天，部署核验仅确认文本完整加载，不声称特殊激活效果。

生成后用 `node ops/sync-chat-persona.mjs` 同步本机覆盖；暂停调度并等待在途任务结束后重启 DSH，再恢复原暂停状态。此次保留聊天会话，无须重置上下文。撤销试用时删除角色卡和预设源中的这一段，重新生成并同步即可。
