# 真寻 Bot 接入

复用现有真寻实例，`instance` 是指向实际安装目录的本地符号链接，不进入 Git。
真寻仍由已有主机启动脚本管理；本项目负责协议端和 AI 桥接。

SnowLuma 为同一 QQ 账号建立两条连接：

- 正向 WebSocket：桥接连接 `127.0.0.1:3001`。
- 反向 WebSocket：SnowLuma 连接真寻 `127.0.0.1:8080/onebot/v11/ws`。

真寻插件及数据库保留，不复制、不重新初始化。检查运行状态时，应同时验证
SnowLuma `get_login_info`、`get_status` 和真寻日志中的 OneBot 连接成功记录。
