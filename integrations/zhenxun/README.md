# 真寻 Bot 接入

复用现有真寻实例，`instance` 是指向实际安装目录的本地符号链接，不进入 Git。
真寻由 `qqbridge` 与协议端、DSH、桥接统一管理；主机 `boot` 调用同一入口。

SnowLuma 为同一 QQ 账号建立两条连接：

- 正向 WebSocket：桥接连接 `127.0.0.1:3001`。
- 反向 WebSocket：SnowLuma 连接真寻 `127.0.0.1:8080/onebot/v11/ws`。

真寻插件及数据库保留，不复制、不重新初始化。检查运行状态时，应同时验证
SnowLuma `get_login_info`、`get_status` 和真寻日志中的 OneBot 连接成功记录。

## 小鲸鱼名称配置

实际运行配置是 `instance/.env.dev`（`instance/.env` 设置 `ENVIRONMENT=dev`）：

```dotenv
NICKNAME=["小鲸鱼", "鲸鲸", "大肥鱼"]
SELF_NICKNAME="小鲸鱼"
```

旧的“真寻 / 小真寻 / 绪山真寻 / 小寻子”不再作为 NoneBot 呼叫名。
修改后必须重启 `zhenxun` 服务；只改 DSH 提示词不会改变 NoneBot 的称呼触发规则。
`NICKNAME` 控制呼叫触发，`SELF_NICKNAME` 控制插件读取的机器人自称。
部分第三方插件可能自带硬编码文本或专用命令，它们不属于 NoneBot 呼叫名。
QQ 账号展示昵称另由协议端 `set_qq_profile` 修改；`get_login_info` 可能保留旧缓存，
应同时用 `get_stranger_info(no_cache=true)` 核验资料更新。

## 戳一戳不触发服务器自检

`instance/data/config.yaml` 的 `check.TYPE` 设为 `message`：

```yaml
check:
  TYPE: message
```

真寻内置 check 插件仅在 `poke` / `mix` 时响应戳一戳；`message` 关闭这一触发，
仍保留主人主动发“自检”的命令。修改后执行 `qqbridge restart zhenxun`。
无需删除或修改真寻框架代码。QQ 的戳一戳事件仍交给鲸鲸自然聊天或回戳。
