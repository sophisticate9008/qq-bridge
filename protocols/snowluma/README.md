# SnowLuma 协议端

本机使用官方 Linux ARM64 Lite 发行包 v2.1.1，安装在 `vendor/`。
该目录含专有二进制、账号配置和日志，整体忽略，不提交到 Git。

管理界面监听 `127.0.0.1:5099`。管理密码保存在 `config/local/snowluma-admin.json`。
OneBot HTTP / 正向 WS 使用 `127.0.0.1:3000` / `127.0.0.1:3001`。
同一账号通过反向 WS 接到真寻的 `ws://127.0.0.1:8080/onebot/v11/ws`。

QQ 客户端独立放在 `../qq-client/vendor/`，启动入口已恢复官方 launcher，不再加载 NapCat。
登录需要在手机 QQ 扫码确认；SnowLuma 已启动不代表账号已经登录。

来源：https://github.com/SnowLuma/SnowLuma/releases/tag/v2.1.1
