# qqbridge 启动与 boot 接入

本机部署入口：`/usr/local/bin/qqbridge` → `/root/qq-bridge/ops/qqbridge`。
命令从任意目录执行，不需要进入仓库。无参数等价于 `qqbridge start`。

## 日常命令

| 命令 | 作用 |
| --- | --- |
| `qqbridge` / `qqbridge start` | 启动真寻、SnowLuma、QQ 客户端、DSH、Bridge |
| `qqbridge status` | 显示五个组件的 screen 状态 |
| `qqbridge doctor` | 验证 HTTP、DSH 鉴权、Bridge 连接、QQ 在线和登录账号 |
| `qqbridge stop` | 反向停止五个组件，保留共享数据库 |
| `qqbridge restart` | 整套机器人重启，可能需要重新登录 QQ |
| `qqbridge restart bridge` | 只重启桥接，不影响 QQ 登录和 DSH |
| `qqbridge restart dsh` | 重载 DSH 插件和 profile；桥接随后重新连接 |
| `qqbridge restart zhenxun` | 重新加载真寻 `.env.dev` 和插件 |
| `qqbridge logs bridge` | 显示最近 100 行日志 |
| `qqbridge logs dsh -f` | 持续跟踪日志，Ctrl+C 退出查看，不停止服务 |
| `qqbridge console` | 显示三个本机 Web 控制台地址，不输出登录令牌 |
| `qqbridge help` | 显示帮助 |

start、stop、restart、status、doctor、logs 都可指定一个组件：
`zhenxun`、`snowluma`、`qq-client`、`dsh`、`bridge`。
指定组件只操作该组件，不递归重启其他组件；从完全停止状态启动整套服务请不带组件参数。

## 实际流程

1. 获取启停锁 `runtime/qqbridge-control.lock`，避免两个终端同时启停。
2. 必要时通过现有 `sub2api-chroot postgres-start` 启动真寻所用 PostgreSQL。
3. 启动真寻，等待 `127.0.0.1:8080` 就绪。
4. 启动 SnowLuma，等待 `127.0.0.1:5099` WebUI 就绪。
5. 启动独立 QQ 客户端，使用本机部署配置里的机器人账号。
6. 启动 DSH，使用持久化浏览器 Cookie 验证 HTTP 和 `session/list` 会话服务；网页能打开不代表模型会话已就绪。
7. 启动 Bridge，等待其报告 DSH 已连接。
8. 检查 OneBot QQ 在线状态及账号；未登录时提示到 SnowLuma 检查登录。

各服务最长等待就绪 90 秒，失败会停止后续启动步骤，并给出日志命令。
已运行的 screen 不重复启动；已就绪的非 screen 服务不重复启动，也不由 stop 杀掉。
未知进程占着服务端口而服务未就绪时会失败，防止反复生成冲突进程。
QQ 登录需要手机操作时，服务启动本身可以完成；`doctor` 会返回失败直到 QQ 在线。
`status` 仅看进程，不能替代 `doctor`。

停止顺序：Bridge → DSH → QQ 客户端 → SnowLuma → 真寻。
单组件重启会先等旧进程停止，再启动；不会删除聊天历史、配置或数据库。
共享 PostgreSQL 与模型网关等其他主机服务不在 qqbridge stop 的范围内。

## boot

主机入口 `/usr/local/bin/boot` 仍执行 `/root/service_boot/service-boot.sh`。
主机流程先启动已有公共依赖，再调用 `qqbridge start`；不再单独重复启动真寻，也不启动 NapCat。

```bash
boot                    # 主机整套服务，包括 qqbridge
boot status             # 包含机器人五个组件的状态
boot logs qqbridge      # 跟踪 Bridge 日志
boot logs dsh           # 跟踪 DSH 日志
boot logs zhenxun       # 跟踪真寻日志
```

`boot stop` 先停止 qqbridge，再停止原有其他服务。
`boot restart` 若停止失败则中止，避免带着残留进程重复启动。
这是现有 boot 命令内的流程；不额外安装 systemd、自启动任务或后台守护。

## 内网控制台

本机配置：Bridge 的 `config.json` 设置 `consoleHost: "0.0.0.0"`；
SnowLuma 的 `config/local/deployment.json` 设置 `snowlumaWebHost: "0.0.0.0"`，
由启动器传入官方 `SNOWLUMA_WEBUI_HOST` 环境变量。未设置时均默认只监听回环地址。
修改后分别运行 `qqbridge restart bridge`、`qqbridge restart snowluma`。

当前内网地址：Bridge `http://192.168.1.66:3100`，SnowLuma `http://192.168.1.66:5099`。
仍使用原有控制台令牌或登录凭据。Bridge 允许本机网卡 IPv4 地址作为 Host/Origin，
仍拒绝任意域名、其他 IP 和无令牌的管理 API 请求。
本 Fork 的自定义控制台令牌支持 10–128 位字母、数字、下划线和短横线；
前端、服务端和 MCP 读取校验保持一致。实际令牌只存私有配置，不写入文档或 Git。
按用户要求，DSH 保持 `127.0.0.1:3080`，没有内网转发入口。
以上设置随 `boot` / `qqbridge` 启动生效；内网 IP 变化时使用新的网卡地址访问。

## 安装与维护

```bash
cd /root/qq-bridge
python3 ops/install-qqbridge.py
qqbridge doctor
```

安装脚本会校验当前 boot 结构、备份到私有的 `ops/backups/`、检查 shell 语法，然后原子替换。
重复安装不会重复插入启动步骤；若同名 CLI 已属于其他安装，会明确退出。
`ops/stack.sh` 只是兼容入口，无参数仍显示 status。
组件日志统一写入 `runtime/logs/<组件>.log`；真寻切换到新启动器前的旧日志在
`/root/service_boot/logs/zhenxun.log`，CLI 在新日志不存在时兼容读取。

验证命令：`python3 scripts/test-qqbridge-cli.py`。
此测试使用临时目录和假 screen/健康检查，覆盖启动停止顺序、幂等、失败中止、锁和单组件重启，
不会操作正在运行的 QQ。实机另外验证了 start 幂等、Bridge/真寻重启、doctor 与 boot status。

## 群里出现“消息未被接受”的排查记录

2026-10-22：DSH 的 `agent-default-model.config.reasoningEffort` 被存为布尔值 `false`，
但配置要求字符串，因此默认模型插件启动失败，连带 `sessionController` 不可用。
此时网页和 settings 接口仍正常，旧健康检查误报就绪。

已把值修复为字符串 `'off'`，部署脚本同时维护 DeepSeek provider 和默认模型的这个字段。
CLI 和桥接现在检查真实会话服务及 RPC 结果；服务不可用时，收到的消息按原有队列机制等待恢复。
桥接投递拒绝、agent 运行错误仅记在本机日志和控制台活动记录；群聊的重启排队提示、敏感内容拦截通知也不再发送。
敏感内容的拦截本身仍然生效，不会把原始错误伪装成模型回复。

查看故障：`qqbridge logs dsh`、`qqbridge logs bridge`、`qqbridge doctor`。
回归测试：`node scripts/test-runtime-diagnostics.mjs`。
