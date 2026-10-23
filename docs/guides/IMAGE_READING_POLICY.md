# 二代仿真按需看图策略

2026-10-23：由 DeepSeek 根据说话对象、当前文字与连续语境决定是否调用看图工具，不用关键词硬匹配阻断工具。

- 明确要求查看、识别、分析，或回答问题必须理解图片：读取对应消息的图片。
- 与鲸鲸交流的人发来明显承接话题的图：可以自然读取，无需额外说“看图”。
- 激活/续聊窗口、主人身份、私聊、图片占位符本身：均不构成每图必看的要求。
- 群友互发表情、无关图片、刷屏：通常跳过，不扫描整段历史的图片。
- 图片已看过且仍在上下文中：复用；缺少必要细节或压缩后确需重看时才再次读取。
- 描述具体图片内容前必须实际看过；跳过无需公告，必要图片获取失败时简短说明，不反复重试。
- 合并转发可能直接携带图片，同样只有明确要求或当前话题需要时才展开，嵌套转发也按需查看。

该策略同时写在预设与 `qq_get_message_images` 工具说明中。图片工具仍可用，群聊/私聊模型分工、唤醒窗口和上下文容量不变；是否需要看图由模型判断，不能保证每次判断都完全准确。

维护源为 `dsh/agent-presets/qq-chat-v2/agent.cordis.yml`，生成产物为 `plugins/qq-agent-presets/presets/qq-chat-v2.patch.yml`；本机 profile 中还有部署覆盖，修改后须同步。

```bash
node scripts/build-agent-preset-patches.mjs
node scripts/build-agent-preset-patches.mjs --check
node ops/sync-chat-persona.mjs
qqbridge restart dsh
qqbridge doctor
```

同步脚本仅更新二代 persona，并备份私有 profile；不清空已有会话，不替换本机工具或权限配置。维护时先暂停调度、等在途任务结束，重启后恢复原暂停状态。提示词与工具定义调整会改变之后请求的部分缓存前缀，不能承诺此次更新零缓存未命中；不应为测试重发长历史。
