# Quant Workbench Demo v1 开发计划

- **版本**：执行版 2026-11-11
- **状态**：G0 数据层与 API 契约基线已冻结；下一垂直切片等待证券元数据采集/生产写入授权
- **关联文档**：[PRD](PRD-demo-v1.md)、[技术方案](TECHNICAL-DESIGN.md)、[复用登记](../research/REUSE-REGISTER.md)

这份文档是当前开发顺序、角色分工、交接方式和质量门的执行依据。PRD 决定产品范围，技术方案决定模块边界；本文件决定**现在先做什么、谁来做、何时交接、怎样才算完成**。

## 1. 当前状态

项目已经越过原型和基础数据验证，正在把真实数据、后端 API、前端页面、任务记录和 Agent/MCP 组成可验收闭环。

### 1.1 已完成事项

以下内容已经完成，保留删除线作为历史记录，不再作为当前待办重复安排。

- ~~完成 PRD、技术方案和原型审查，冻结 Demo v1 核心范围：沪深主板、创业板、科创板，排除北交所；默认基准为沪深 300。~~
- ~~完成 Agent 角色、工作区隔离、文件所有权和基础协作规则。~~
- ~~完成 GitHub 数据包、QuantMind、baostock、chenditc、Tushare 等候选的初步调研、覆盖验证和许可证判断。~~
- ~~完成 baostock 历史日线入库、截断缺陷修复、NULL 价格行处理和数据质量检查。~~
- ~~完成复权因子变点表、质量标记和 Tushare 价格交叉核对。~~
- ~~完成 Python/TypeScript 双侧数据契约：金额单位为元、数量单位为股、百分比和比例的字段语义固定，算不出返回 `null`。~~
- ~~完成交易日历、涨跌停、ST 历史状态、新股窗口、停牌和交易状态等领域规则。~~
- ~~完成复盘、个股、筛选和回测的后端领域层、仓储层、序列化和 FastAPI 接口。~~
- ~~完成 `/health`、鉴权、Vite 服务端代理和 SSH 隧道验证；token 未下发到浏览器。~~
- ~~完成 index bars、limit streaks 初版和 session stats 初版计算。~~
- ~~完成复盘页、个股页、筛选页和回测页接入真实 API 的第一版。~~
- ~~完成观察池读写接口和独立 JSON 持久化；重复添加幂等，损坏文件不静默重置。~~
- ~~修复回测费用导致现金负数时直接失败的问题，并补充费用边界测试。~~
- ~~统一复盘 ladder 与 ST 排除口径。~~
- ~~舵面修复 K 线 mock 日期导致的 stale/partial 白屏；42 组状态矩阵通过。~~
- ~~舵面修复无 token 构建失败问题；`env -u QW_API_TOKEN npm run build` 通过。~~
- ~~将 `web/vite.log` 从 Git 跟踪中移除并加入忽略规则。~~

### 1.2 当前未完成事项

按优先级排序：

| 优先级 | 事项 | 负责人 | 当前状态 |
|---|---|---|---|
| P0 | 三日 bars 增量、派生表重算、snapshot 更新与 S6 | 算盘 | 已完成：bars max=2026-11-11，派生表 max=2026-11-11，rule_version 一致 |
| P0 | 当前表 schema、来源与读取路径实测冻结 | 算盘 + 舵手 | **G0 已完成**：生产对象、独立文件、provenance、API 基线和未知项已写入 §11；API 延迟为旧部署口径 |
| P0 | 页面字段到真实 API 的映射和缺失态矩阵 | 舵面 | **G0 已完成**：8 页 + 右栏矩阵已交付；未改文件 |
| P0 | 证券元数据生产落地与 name/industry API join | 用户授权数据采集/写入；算盘 + 舵手实现；舵面消费 | **数据已落地**（2026-11-12）：全量 Parquet 已发布，5,501/5,501 覆盖。剩余：API join 代码在隔离集成分支 `e05ede9`，未部署；部署需用户再授权且配置 `QW_INSTRUMENTS_META_PATH` |
| P0 | 回测结果持久化、任务查询和断线恢复 | 舵手 + 算盘 + 舵面 | G3；未开始 |
| P0 | MCP 基础查询和至少一个 Agent 驱动研究任务 | 舵手 + 算盘 + 舵面 | G4；未开始 |
| P1 | 资金流、资讯、龙虎榜、流通市值 | 算盘 | 数据源/授权/schema 未冻结，不阻塞 G0-G3 |
| P1 | 更完整状态矩阵、窄屏与视觉细节 | 舵面 | 核心状态已完成，其余按区间排序 |

## 2. 角色、工作区和权限

| 角色 | 主要职责 | 工作区与目录 | 交付给谁 |
|---|---|---|---|
| **舵手** | 需求基线、任务排序、公共接口、集成、合并、向用户汇报 | `D:/quant`；只改分配给自己的集成和 API 文件 | 用户、所有 agent |
| **舵面** | Web 页面、状态、客户端适配和前端回归 | `D:/quant-agent-3`，独占 `web/**` | 舵手 review/合并 |
| **算盘** | 数据、市场规则、指标、筛选、回测和数据测试 | `D:/quant-agent-2`，负责后端数据/量化目录 | 舵手和审查员 |
| **副舵手** | 任务卡、依赖、接口检查、集成环境和进度汇总 | 只改明确分配的任务记录和协调文件 | 舵手 |
| **审查员** | 独立检查金融正确性、需求、许可证、安全和可维护性 | 不直接修改责任 agent 的实现分支 | 责任 agent 和舵手 |

规则：

1. 舵面不改后端、数据库、PRD、原型和其他 agent 的目录。
2. 算盘不改 `web/**`，不自行改变公共 API 语义。
3. 舵手不越过目录 owner 直接改舵面或算盘的实现；需要修复时分配给 owner，只有紧急安全问题可以先止损并报告。
4. `prototype/` 已冻结，不再和生产前端并行修改。
5. 发现需要跨目录改动时，先通过 intercom 指定 owner、文件范围、依赖和交接点。

## 3. 计划表：从数据收尾到 Demo 验收

时间以本计划批准后的第一次协作同步为 T+0。数据重算属于单写者任务；表中并行项只能在不争用同一 DuckDB/Parquet 文件的情况下执行。

| 时间 | 舵手 | 舵面 | 算盘 | 依赖与交付物 | 阶段门 |
|---|---|---|---|---|---|
| T+0–30 分钟 | 核对分支、未提交文件和 API 现状；冻结本轮范围 | 报告 `web/**` 分支、dirty 文件和当前提交 | 报告 `limit_streaks`、`session_stats`、Tushare 审计状态 | 当前状态表、阻塞表、文件 owner 清单 | 不存在跨工作区未授权改动 |
| T+30–90 分钟 | 发出字段冻结表和真实 JSON 样例清单 | 只读接口和页面，列出字段缺口，不猜字段 | 继续唯一一项数据重算或审计作业 | 7 个接口的字段、单位、`null`、错误码草案 | 舵面可以按样例开发 |
| T+90–3 小时 | 集成 portfolio/review/stock/screen/backtest 契约测试 | 优先接 review、stock；保留其他页面 mock 开关 | 复验 3 个代表交易日和短回测黄金样本 | 契约测试结果、代表日期对账结果 | API 口径没有未决冲突 |
| T+3–6 小时 | 处理接口冲突，冻结第一批 P0 合并范围 | 完成 review/stock 的 loading、empty、error、stale、partial | 完成长回测费用、现金和内存回归 | 前端核心页可用；长回测有资源记录 | 阻塞级问题清零 |
| T+1 工作日 | 合并通过 review 的 P0 分支，拆下一批任务卡 | 接 screen、backtest、portfolio 真实接口 | 完成数据阶段收尾报告和规则版本核对 | 前后端联调构建、API 契约、数据状态 | 数据阶段停止扩张 |
| T+2 工作日 | 设计任务状态、运行记录和结果目录；冻结 schema | 接任务列表、回测结果和重连查询状态 | 提供回测参数、快照、规则版本和成交记录字段 | `runs/<date>/<run_id>/` 结构和查询接口 | 刷新/断线后仍可查询结果 |
| T+3–4 工作日 | 接入 MCP 适配层和统一业务服务 | 完成 Agent 工具调用卡片和结果引用 | 提供复盘、个股、筛选、回测工具输入输出 | MCP 工具契约和审计字段 | MCP 不复制业务逻辑 |
| T+5 工作日 | 组织全链路验收、风险复核和范围回顾 | 核心页面状态回归、最小分辨率检查 | 黄金样本、异常数据、性能和数据新鲜度验收 | 验收记录、遗留项和 v1.1 清单 | Demo v1 通过或明确阻塞原因 |

如果某一时间片因数据作业超时，负责人必须报告原因、影响和新交付时间；不能以“测试还未全部完成”为理由无限延迟接口冻结。

## 4. 三个核心 agent 的 RapidTodo

### 舵手

1. 检查三个 worktree 的分支、dirty 文件和最近提交。
2. 冻结 review、stock、screen、backtest、portfolio、data-status 和任务接口的字段、单位、版本和错误语义。
3. 收齐算盘的真实 JSON 样例，交给舵面；接口变更必须先做影响分析。
4. 先集成独立可验收的 P0，不等待 P1 数据字段。
5. 将任务持久化、MCP 和 Agent 面板拆为独立任务，不把 mock 任务中心标成完成。
6. 每个时间片结束汇报完成、下一步、阻塞和需要用户决定的 L3 项。

### 舵面

1. 保持 `web/**` 独占；按 review → stock → screen → backtest → portfolio 的顺序接入真实接口。
2. 字段冻结前只改适配层和 mock 开关，不猜字段名、不用 0 代替缺失。
3. 每页先完成 loading、empty、error、stale、partial，再做视觉优化。
4. 当前优先保持 18 组核心状态矩阵：review、stock、backtest 各 6 组；其他页面状态后置。
5. 每次提交只包含 `web/**`，提交前运行 `tsc --noEmit`、`npm run build` 和核心状态检查。
6. 图表、队列等通用能力先做复用审查；若引入依赖，锁版本、登记许可证和验证 bundle。核心 A 股口径不能交给不可审计的黑盒。

### 算盘

1. 重算 `limit_streaks`，加入并核对 `rule_version`，再刷新 `session_stats.max_ladder` 和 `ladder_count`。
2. 以 2026-11-06、2020-02-03、2015-07-08 等代表日期逐项对账，记录规则解释而不是只报数字。
3. 重跑长区间回测，检查费用、现金、成交限制、结果复现、峰值内存和耗时。
4. 提供各核心接口真实 JSON、错误样例、字段单位、缺失语义和快照/规则版本。
5. 只有在权限、授权和字段质量通过审计后，才补名称、行业、流通市值、资金流和资讯。
6. 将研究阻断型质量检查现在完成；全历史重扫和非 P0 统计转为批作业或后续阶段。

## 5. 测试分层和数据阶段停止条件

### 5.1 当前必须通过

- 涨跌停、ST、新股窗口、停牌、T+1、费用和整手交易的边界测试。
- 固定回测黄金样本：信号、成交、费用、净值、回撤和基准结果可复现。
- 长区间回测不因现金、手续费或内存问题崩溃；记录峰值资源。
- `limit_streaks` 与 `session_stats` 的规则版本一致，代表日期与在线复盘对账。
- API 契约、鉴权、错误码、`null` 语义和数据日期验证。
- 观察池原子写、重复添加幂等、损坏文件显式报错。
- 前端真实接口的 loading、empty、error、stale、partial 状态；无 token 构建通过，dev 代理仍必须鉴权。
- 不提交 token、数据库、Parquet、大型结果、日志和构建产物。

### 5.2 可以延后

以下内容可以后置，但必须标注“未验收”，不能暗示已经完成：

- 每次代码变更后的全市场全量重扫。
- 所有历史日期的逐字段逐行对账。
- 资金流、资讯、龙虎榜、板块共振等尚未进入稳定 P0 的数据能力。
- 所有页面完整状态矩阵、移动端 390px 和视觉细节。
- 指标库与所有第三方指标库的全面横向比较。
- 多策略、多基准、多参数批量回测。

数据阶段满足以下条件后停止扩展，算盘转入增量更新和缺陷修复：

1. `limit_streaks` 与 `session_stats` 已完成规则版本核对；
2. 代表日期在线/离线对账通过；
3. 回测黄金样本和长区间资源测试通过；
4. P0 API JSON 样例冻结；
5. 关键数据缺失在 API 和 UI 中可见；
6. 没有待解决的阻塞级数据质量问题。

## 6. Git、任务卡和提交规则

- 三个开发 agent 不直接在 `main` 开发或提交；只有舵手负责最终合并。
- 每个任务使用 `feat/<task-id>-<name>` 或 `fix/<task-id>-<name>` 分支。
- 新提交统一使用 `<type>(<task-id>): <summary>`。历史旧提交不为改写历史阻塞当前工作。
- 任务卡至少记录：任务 ID、PRD 编号、负责人、reviewer、依赖、文件范围、交付接口、验收命令、分支、commit、风险和交接记录。
- 提交前执行 `git status --short`，只暂存本任务文件；检查是否混入其他 agent 修改、凭证、日志或生成数据。
- 实现者不能独自批准自己的金融、数据写入、安全或公共接口改动；算盘的回测/指标改动至少由另一名 agent review。
- reviewer 发现问题时退回责任分支，不直接替实现者改代码。
- 小范围越界只允许用于不改变产品口径、API 所有权和数据安全的局部工作；必须先在 intercom 说明，完成后交回 owner 并记录影响。

## 7. GitHub 复用与自研规则

新模块开始前进行 15–30 分钟的快速复用检查：

1. 查找 GitHub 或已安装依赖中的成熟实现。
2. 核对字段覆盖、历史能力、性能、许可证、维护状态和适配成本。
3. 能直接使用就采用 L1；需要字段转换就采用 L2；只有确实需要改造且许可证允许才采用 L3。
4. 若自研，任务卡记录查过的候选、未采用原因和自研边界。
5. L1/L2/L3 都登记到 `research/REUSE-REGISTER.md`；L3 必须固定 commit、保留版权/NOTICE，并在文件头写来源和改动摘要。

允许的小范围例外是：成熟实现会破坏 A 股历史口径、引入无法接受的依赖，或适配成本明显高于最小自研实现。此时自研必须更可读、可测试、可审计，不能以“自己写比较快”作为唯一理由。

## 8. 质量、代码和安全规范

- 业务命名表达业务含义；金融计算注明单位、方向、窗口、样本过滤和边界。
- 缺失、无交易、源失败和无法计算分别表达；不静默填 0，不用假数据伪装成功。
- 页面不直接访问数据库；MCP 和页面调用同一应用服务，不复制业务逻辑。
- 数据库写入采用单写者或明确锁策略；运行数据、凭证和大结果放在仓库外。
- token 通过环境变量或受保护文件注入，绝不进 Git、前端 bundle 或浏览器响应。
- 注释只写代码无法表达的原因；不保留调试输出、死代码和未使用的扩展点。
- 新增非平凡金融逻辑必须有边界测试；简单 UI 变更不为覆盖率制造无意义测试。
- API 结果带数据日期、快照/规则版本和完整性提示；不能只返回一个看似精确的数字。

## 9. 当前需要用户确认的事项

1. 桌面端最小分辨率；当前先按桌面工作区处理，390px 移动端后置。
2. 任务中心是否接受 v1 的“运行记录 + 可查询结果”最小实现，还是必须加入完整后台队列和取消能力。
3. 名称、行业、流通市值、资金流和资讯的授权与数据源范围。
4. 指标字典中低开高走、市场强弱和板块共振的最终口径。



## 10. 协作流水线与区间目标（执行规则）

本项目按可验收的区间目标推进，不按 agent 各自的活动量推进。每个区间结束必须有一个可交付结果和明确结论；未过门时只修阻塞项，不开启依赖它的下一区间。

```text
任何 agent 的发现/提案
        ↓
副舵手整理任务卡、依赖、owner、风险和预计耗时
        ↓
舵手合并为一个目标区间，冻结范围与公共契约
        ↓
用户决策门（仅涉及产品口径、授权、破坏性/正式数据操作、不可逆范围时）
        ↓
并行实现：算盘（数据/后端） ──┐
           舵面（前端）       ├→ 接口/数据交汇 → 集成 → 独立验收
           副舵手（跟踪/审查） ┘                       ↓
                                               用户看结果并反馈
                                                       ↓
                                                下一目标区间
```

### 10.1 从任一 agent 开始的入口

| 起点 | 先做什么 | 交汇到哪里 |
|---|---|---|
| 算盘发现数据/规则问题 | 提供事实、影响范围、候选来源/API、schema 变化和耗时；不得自行改变已冻结的公共契约或写正式数据 | 副舵手建卡；舵手决定是否进入当前区间；需口径/授权的交用户 |
| 舵面发现展示/交互缺口 | 指明当前页面、真实 API 字段缺失、可接受空态；不以 mock 冒充真实能力 | 与算盘的数据/API 契约合流，由舵手冻结接口后实现 |
| 副舵手发现依赖/风险 | 给出阻塞关系、owner、所需决策和最小解除路径；不替 owner 改实现 | 舵手排序；涉及用户权限的项目只列为决策请求 |
| 审查员发现风险/复用候选 | 给出可复现证据、严重级、许可证和建议；不直接改责任分支 | 退回责任 owner 修复；舵手判断门禁是否阻塞 |
| 舵手收到用户目标 | 先定义区间结果、边界、owner、契约、验收和用户决策点，再派发并行任务 | 到契约冻结节点后，前后端与数据工作汇合 |

### 10.2 每个区间固定节点

1. **目标/范围**：舵手写一句目标、明确不做项、负责人、预计耗时、目标分支和依赖。
2. **并行摸底**：算盘报告数据/schema/来源/计算风险；舵面报告页面/API 消费；副舵手检查依赖和 owner；审查员仅对高风险金融、数据写入、安全、许可证任务做独立审查。
3. **契约冻结**：舵手合并字段、单位、空值、错误、数据日期、snapshot/rule_version 和兼容性。公共契约改变必须先通知所有消费者。
4. **实现汇流**：各 owner 在隔离工作区实现，只改所属路径；允许并行但禁止两个 agent 同时写同一 DuckDB/Parquet、同一文件或同一公共 schema。
5. **风险匹配验收**：先运行能证明本次变更正确的最小检查；金融口径、破坏性写入、安全边界需针对性验证。重复、无关或已有离线证据覆盖的昂贵测试后置，不作为默认门禁。
6. **集成/反馈**：舵手集成，副舵手核任务与提交，独立 reviewer 只检查高风险改动。向用户展示“完成/未完成/风险/下一决策”，用户反馈进入下一轮目标。
7. **区间关闭**：记录 commit、结果、遗留项和下一依赖；未达到目标不可标完成，不以新任务掩盖失败。

### 10.3 建议区间目标

| 区间 | 目标 | 主要并行工作 | 结束条件 |
|---|---|---|---|
| G0 数据与接口基线 | 冻结 v1 数据表/字段/来源/契约及缺失能力 | 算盘核实际 schema/来源；舵面映射页面字段；舵手维护契约；副舵手追依赖 | 数据字典及字段单位/空值/更新时间/snapshot 定稿；未供给字段显式列为缺口 |
| G1 数据可读可用 | 常用页面只读路径正确、资源可控 | 算盘优化查询和数据适配；舵面接真实字段；舵手集成 API | 核心查询投影/过滤正确，P95 和内存有基线，无全表传输到 UI |
| G2 研究页面闭环 | 复盘、个股、筛选展示真实数据和缺失状态 | 算盘补可由现有数据计算的服务；舵面接页面；舵手冻结 API | 页面字段与服务响应逐项映射；缺失明确而非伪零 |
| G3 回测与运行记录 | 回测能提交、可查询、刷新后可恢复 | 算盘负责引擎/结果 schema；舵手负责运行记录 API；舵面负责任务/结果界面 | run_id、参数、数据快照、版本、状态和结果可追溯 |
| G4 Agent/MCP | Agent 经受控服务查询/提交任务 | 算盘提供领域输入输出；舵手做 MCP/服务适配；舵面显示调用记录 | 工具不复制业务逻辑，调用参数与结果可审计 |
| G5 Demo 收口 | 端到端工作流稳定 | 各 owner 修阻塞问题，审查员检查关键风险 | P0 场景完成，剩余风险有负责人和明确后续区间 |

### 10.4 决策权限

| 决策类型 | 决策人 | 例子 |
|---|---|---|
| 产品范围、金融指标定义、数据授权/费用、正式远端写入/部署、不可逆删除、凭证处理 | **用户** | 新增市场/数据源；是否改涨停或收益口径；是否正式采集/重算 |
| 区间排序、任务拆分、公共 API/schema 冻结、合并、是否满足阶段门 | **舵手**；涉及产品口径时升级用户 | review 与 stock 先后、接口版本、集成策略 |
| 卡片依赖、owner、进度提醒、规范符合性和交接完整性 | **副舵手**；不得改产品/数据口径 | 拆子任务、发现跨分支冲突、催报长任务 |
| 实现内部且不改变契约/口径的技术细节 | **责任 agent 自行决定并记录** | 函数拆分、局部命名、等价查询写法、同等风险下的最小测试 |
| 金融正确性、安全、许可证、正式数据写入风险 | **责任 agent 实现 + 独立 reviewer 检查；舵手放行**；涉及正式授权仍由用户决定 | 回测成交/费用、路径保护、L3 代码迁移 |

### 10.5 汇报与耗时规则

- 每项任务开始前简报：目标、预计耗时、会触碰的资源/文件、是否只读或会写、阻塞条件。
- 预计 **超过 5 分钟**：开始时给 ETA；运行中至少每 5 分钟报告一次进度、已耗时、剩余估计和异常。进度报告不需要重复背景。
- ETA 超过原估计 2 倍、连续 5 分钟无进展、资源接近上限或结果异常：暂停后续写入并立即报告舵手；不要静默重试。
- 交付汇报固定为：`结果/commit`、`关键数字`、`检查结论`、`遗留或风险`、`需要谁决策`。常规报告控制在几行；详细日志仅在异常时附上。
- 任何 agent 不得把命令管道的最后一个进程退出码当作被测程序退出码；需直接捕获原命令状态。

### 10.6 测试与工作量取舍

测试按本次风险选取，不追求每次都跑全套：

- 纯文案/低风险 UI：编译或对应静态检查足够；不重复跑远端 E2E。
- 改动局部逻辑：跑对应单测/self-check 和必要契约检查。
- 金融规则、数据写入、备份恢复、鉴权/凭证边界：必须有目标性离线夹具或边界测试；正式库重复验证不替代离线证明。
- 全量数据重扫、全页面矩阵、全历史逐日对账、重复冒烟：只有当变更影响该范围或此前证据不足时才做；否则后置并说明未跑。
- 开始前估时；预计单项超过 5 分钟按 §10.5 报告。不要为了“测试全绿”执行与风险无关的耗时工作。

## 11. 数据层 v1 基线清单（今天冻结）

### 11.1 事实边界

一表一事实，所有数据集独立 root/schema/provenance；`QW_BARS_ROOT` 只属于 bars。不要建通用 dataset registry/plugin。日线 `trade_date` 保持 `VARCHAR YYYY-MM-DD` 以兼容现有生产表；元数据生效日期用 `DATE`/Parquet `date32`；来源、采集时刻和 snapshot provenance 与业务字段分开。金额用元、数量用股、`_pct` 为 0–100、`_rate` 为 0–1；不可计算为 NULL；NULL、停牌无行、源失败三态不得混淆。

### 11.2 当前数据对象和职责

| 对象 | v1 角色 | 当前字段/来源基线 | 状态与边界 |
|---|---|---|---|
| `bars` | 唯一日线事实表；Parquet `year=YYYY` 分区，DuckDB 查询副本 | 实测 16 列：`symbol VARCHAR, board VARCHAR, trade_date VARCHAR, open/high/low/close/preclose/volume/amount/turn DOUBLE, tradestatus INTEGER, pct_chg DOUBLE, is_st INTEGER, is_trading BOOLEAN, year BIGINT`。历史/增量主源 baostock；交叉核验 chenditc/Tushare | 已生产 14,642,615 行，max 2026-11-11；(symbol, trade_date) 仅检查 2026 年区间重复 0，未证明全历史唯一；`is_trading = volume 非空且 >0`；NULL 价格行丢弃并计数 |
| `instruments` | 证券代码、板块、首个可见交易日等轻量维表 | 实测 `symbol VARCHAR, first_trade_date VARCHAR, last_trade_date VARCHAR, board VARCHAR, bar_count BIGINT` | DuckDB 5,501 行；symbol 唯一；Main 3,426 / ChiNext 1,454 / STAR 621；不含名称/行业 |
| `instruments_meta` | 独立的低频证券元数据表（生产为 Parquet 文件，未注册 DuckDB 表） | loader 契约 14 字段：`symbol, name, name_as_of, ipo_date, out_date, is_listed, security_type, industry, industry_status, industry_classification, industry_as_of, collect_status, fetched_at, source`；baostock `query_stock_basic` + `query_stock_industry` | **生产已发布**（2026-11-12）：`/root/autodl-tmp/quant_meta/instruments_meta.parquet`，5,501 行 / 5,501 distinct，98,691 B，sha256 `54cf3438…13c5dc`，mode 600，universe 指纹 `a8bfc6d3…e9fc08`；状态 `ok` 5,224 / `empty_for_delisted` 274 / `missing` 3 / `missing_basic` 0；industry 非空 5,224，industry_as_of 快照 2026-11-09。API 读取需 `QW_INSTRUMENTS_META_PATH` 指向该文件；未部署前 API 不 join。确认采用独立表，不扩展 `instruments` 或 `bars`。API 读取若文件存在但无该 symbol 行，字段仍为 NULL（未覆盖不等于源查询后 missing） |
| `trade_calendar` | 交易日真相源 | Parquet 候选列 `date, is_trading_day`（注意生产文件实测列名为 `date`，不是候选 `trade_date`） | **独立文件未入 DuckDB**：`quant_calendar/trade_calendar.parquet` 6,240 行，max 2026-12-31；date 重复 0；另有 2 个 `.bak` |
| `factor_changes` | 复权因子变点，不存冗余日因子 | Parquet 实测 `symbol VARCHAR, effect_date VARCHAR, factor DOUBLE` | **独立文件未入 DuckDB**：52,073 行，max 2026-11-06；近似重复检查 0；来源 Tushare `adj_factor` |
| `factor_quality` | 复权因子覆盖/新鲜度状态 | Parquet 实测 `symbol, status, reason, violations, max_extra_jump_pct, points`；精确类型/唯一性本轮未核实 | **独立文件未入 DuckDB**：5,501 行；ok/stale 的生产行级取值未列入本次测量 |
| `index_bars` | 指数日线 | `code VARCHAR, trade_date VARCHAR, o/h/l/c/preclose/volume/amount/pct_chg DOUBLE, year INTEGER` | DuckDB 16,257 行；max 2026-11-06；(code, trade_date) 重复 0；4 个 code。比 bars 晚 3 个交易日是已知 freshness 边界，不阻塞 G0；同步策略另行决策 |
| `index_meta` | 指数静态元数据 | 实测 `code VARCHAR, name VARCHAR, first_date VARCHAR` | DuckDB 4 行，code 唯一；实际列名为 `first_date`，不是候选 `inception_date` |
| `limit_streaks` | 可重算涨停/连板派生表 | `symbol VARCHAR, trade_date VARCHAR, streak INTEGER, is_one_word BOOLEAN, rule_version VARCHAR` | DuckDB 232,454 行，max 2026-11-11；全表重复 0；5,331 只；rule_version 单值 `classify:2d8470f12238` |
| `session_stats` | 可重算的每日复盘聚合 | 实测 15 列：`trade_date VARCHAR, up/down/flat/sealed_up/broken_up/sealed_down/no_limit/out_of_band/touched_up INTEGER, seal_rate DOUBLE, max_ladder INTEGER, ladder_count INTEGER, amount DOUBLE, rule_version VARCHAR` | DuckDB 4,092 行，max 2026-11-11；trade_date 重复 0；rule_version 与 limit_streaks 一致 |
| `data_quality` | 质量事实、更新状态和当前快照来源 | 实测 8 列：`check_id, scope, value, threshold, verdict, note, recorded_at, snapshot_id`（均 VARCHAR） | DuckDB 50 行；最新 recorded_at `2026-11-11T19:12:09`；35 pass / 15 warn；最新 recorded_at 行决定 API 当前 snapshot |
| `recon_results` | 数据源交叉核验结果 | 实测 14 列：`trade_date`, 11 个计数/coverage 列, `recorded_at`, `snapshot_id`；精确 11 个指标名见算盘 G0 交付 | DuckDB 28 行，max 2026-11-02；trade_date 重复 0；本轮核验窗口较 bars 末日滞后 |
| `portfolio.json` | 单用户观察池 | kind/code 与更新时间（按当前 JSON schema） | 仓库外文件；原子写；不是市场主数据 |
| `tasks/runs` | 回测/筛选等运行记录和产物索引 | run_id、type/status、参数、时间、snapshot、rule/code version、log/artifact refs、error | 尚未持久化完整闭环；属于 G3，不塞大结果入 DuckDB 单行或 MCP 消息 |

**G0 实测（2026-11-12，只读）**：生产 DuckDB 含 9 张 BASE TABLE、0 视图：`bars`、`instruments`、`index_bars`、`index_meta`、`limit_streaks`、`session_stats`、`data_quality`、`recon_results`、`checks`。`instruments_meta`、`trade_calendar`、`factor_changes`、`factor_quality` 未注册为 DuckDB 表；其中日历与因子数据分别存在独立 Parquet 根目录，不能表述成“已入库”。生产数据集级 manifest 不存在；可用 provenance 是 `data_quality.snapshot_id`、per-symbol `done/*.json` 抓取戳及 ingest/audit 日志。bars Parquet 无 provenance 列。

**G0 实测约束**：行数、日期、schema、唯一性和文件分区证据以本节表格及算盘 2026-11-12 G0 交付为准。bars `(symbol, trade_date)` 唯一性只检查了 2026 年区间，未证明全历史唯一；因子质量取值域/唯一性未知。API 代表路径基于旧部署 `ce4e7bd`，不是本地 `f62ef4d`：review 5 次 P50/P95 691.7/752.8 ms，stock 120.1/169.9 ms，data-status 86.8/95.6 ms，均 HTTP 200。review 的 `max(trade_date) FROM bars WHERE trade_date < ?` 单条查询约 476.6 ms，是已测路径主要成本；EXPLAIN 扫描行数未能解析，不能宣称已知。独立查询进程峰值 RSS 69.9–89.0 MB（含约 70 MB Python/DuckDB 基线），因此只能估算单查询增量低于 20 MB，不能当成服务并发内存上限。

**生产数据源边界**：`index_bars` max 2026-11-06，落后 bars 3 个交易日；这是 #27 增量只更新 bars 后的已知 freshness 边界，不阻塞 G0。`recon_results` max 2026-11-02。是否让后续增量同步指数、对账属于后续范围决策。

本次 G0 为只读核验：没有全量重扫、写入生产数据、启动服务或提交代码。

### 11.3 当前来源/API 与未接数据

| 数据 | 来源/API | 更新/写入方式 | 缺口/决定 |
|---|---|---|---|
| 沪深日线与证券状态 | baostock `query_history_k_data_plus`；交叉核验 chenditc；价格/因子抽查 Tushare | 交易日收盘后增量抓取，临时 staging、验证后单写者入 `bars`/分区 | 失败股票>0、全空或空率>50%、universe 指纹/行数不符即拒写 |
| 证券基础/行业 | baostock `query_stock_basic`、`query_stock_industry` | JSONL staging → 校验/幂等 Parquet `instruments_meta` | 全量已发布（5,501 行，2026-11-12）；单进程采集约 30 分钟；双会话并发曾触发会话级瞬时错误 `10001001`（19 只，续跑后 error=0），后续重采建议单进程 |
| 复权 | Tushare `adj_factor` | 仅变点写 `factor_changes`，质量写 `factor_quality` | token/授权隔离；不把原始 API 凭证传到浏览器 |
| 指数 | 当前 `csi300.txt` 成分参考；index bars 实际来源/频率按生产 manifest 核实 | 独立 `index_bars`/`index_meta` | 399006 inception 前保留缺失，不造数据 |
| 交易日历 | 已验证日历源/现存 Parquet | 备份后原子替换 `trade_calendar` | 交易日守卫；只允许显式已确认目标日期 |
| 资金流、资讯、龙虎榜、概念历史、流通市值 | 当前无可用生产数据表/API 契约 | 不写入现有表；未来每类单独评估成熟实现、许可证、授权、schema 和 root | 明确未接入；不能以空列表伪装“当天无数据” |

### 11.4 接口契约冻结字段

所有研究 API 至少携带 `as_of`、`updated_at`、`snapshot_id`、状态等级（`ok/partial/stale/error/empty`）和覆盖/失败来源；百分比/金额/数量单位固定；缺失 `null`，集合缺失须有状态或原因，错误统一 `{code,message,details?}`。前端消费 JSON 类型不得自行猜字段、默认填零或把 501 变成空成功。schema 变更需先由舵手标记兼容/破坏性并同步舵面。

G0 首批冻结现有 `/api/review`、`/api/stocks/{code}`、`/api/screen/options`、`/api/screen`、`/api/backtests/options`、`POST /api/backtests`、`GET/POST/DELETE /api/portfolio`、`/api/data-status` 的真实 request/response、错误码和缺失语义。任务查询、日志、资讯和 Agent 端点尚不存在，不得写成已支持。

### 11.5 读取效率原则

- DuckDB 查询只选页面所需列；先按 `trade_date`/`symbol` 过滤并利用 `year=YYYY` Parquet 分区裁剪，避免 `SELECT *` 和把全市场历史装进 Python 对象。
- 单股历史使用排序后的受限窗口；多股查询批量 `IN`/join，避免逐证券 N+1 查询；复盘优先读取 `session_stats`/`limit_streaks` 物化结果。
- 对大响应分页或按日期窗口返回；图表只传需要的 candles，不传全库。
- 写路径继续单写者；读路径基准先记录代表请求 P50/P95、扫描行数和内存峰值。只在证据显示热点后加缓存、物化视图或 Polars；不因“未来可能更快”先加新依赖。
- 数据库查询优化优先复用 DuckDB/Parquet 的列裁剪、分区裁剪与批量扫描；不要假设 Parquet 有传统 B-tree 索引。

## 12. 当前区间与下一步

当前区间：**G1 证券元数据数据层已完成生产落地，G0 基线仍有效**。

G0 的 schema / provenance / API 只读基线、页面字段矩阵和独立审查结论均已归档。G1 部分：后端 `811d36b` 与前端 `12f30bf` 已合入隔离分支 `integration/backend-c8b72ab`（集成头 `e05ede9`），未合 main、未 push；集成分支后端 212 tests 通过，前端静态检查与无 token build 通过。生产侧已于 2026-11-12 发布 `instruments_meta.parquet`（5,501 行，sha256 `54cf3438…13c5dc`），但部署未更新，API 仍返回 `name`/`industry` 为 null 且无 `industry_status`——这是预期兼容态，不是缺陷。

#27 bars 增量、派生重算和 snapshot 已完成；本次授权仅限元数据采集与文件发布，不包含代码部署。

下一工作顺序：
1. 证券元数据生产落地已完成（2026-11-12）：用户授权后全量采集并发布 `instruments_meta.parquet`，5,501/5,501 覆盖，error 最终 0，universe 指纹与生产 `instruments` 全等。规范路径 `/root/autodl-tmp/quant_meta/instruments_meta.parquet`。未改 DuckDB、未建表、未重启服务。
2. 剩余待授权项：部署集成分支 `e05ede9` 并把 `QW_INSTRUMENTS_META_PATH` 指向上述路径，API 才会返回 `name`/`industry`/`industry_status`；部署属写操作，需用户明确授权。
3. G1 读取契约已在集成分支实现：只接个股详情和筛选行；`industry_status` 为 nullable（loader 四态）；文件缺失或文件存在但无该 symbol 行时均返回 NULL，不把未覆盖伪装为源查询后的 `missing`。逐请求读整个 Parquet 的性能尚未实测；非集成阻塞，待真实文件基准后再决定是否缓存。
4. 未授权部署前，可继续在集成分支做本地验证和代码复核；合 main 仍需舵手阶段门。
5. 指数增量同步、数据集级 manifest、G1 查询优化另开任务卡排序；资金流/资讯等新数据源另列区间，不以空列表伪装已接入。

本文件中所有“当前状态”随区间门更新；阶段已完成的旧计划不得继续显示为待办。既有 PRD、技术设计、Git/许可证和安全规则继续有效；若本节冲突，以用户最新决策及本节具体执行规则为准。
