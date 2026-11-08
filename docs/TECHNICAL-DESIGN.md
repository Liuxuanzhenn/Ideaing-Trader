# Quant Workbench Demo v1 技术方案与选型

- 状态：建议稿；产品范围部分已确认，技术选型待验证
- 关联：[PRD](PRD-demo-v1.md)、[开发计划与 Agent 协作规则](DEVELOPMENT-PLAN.md)

## 1. 技术目标

技术方案服务于个人 A 股日频研究、远端 AutoDL 计算、桌面工作台和 Agent/MCP 接入。优先降低接口不稳定、策略难复现和多 Agent 集成成本，不为未来规模预先建设分布式系统。

## 2. 推荐语言与运行形态

### 2.1 结论

- **量化数据、指标、API、任务服务：Python。**
- **桌面工作台 UI：TypeScript + React。**
- **桌面容器：先不锁定 Tauri/Electron；Rust 仅在选择 Tauri 后用于原生壳，不把量化业务迁移到 Rust。**
- **数据计算：先使用 DuckDB + Parquet；需要 DataFrame 操作时评估 Polars。**

这不是把所有东西塞进一门语言，而是按生态边界分工。A 股数据和研究工具主要在 Python；桌面 UI 的状态、表格和工作区交互由 TypeScript 负责。桌面容器只负责窗口和系统集成，不参与指标口径。

### 2.2 桌面与 UI 选型，以及本机 Orca 检查

本机 Windows 安装位于 `/mnt/c/Users/lenovo/AppData/Local/Programs/orca`。安装目录包含 `Orca.exe`、`resources/app.asar` 和 Chromium 的 `resources.pak`，确认桌面容器为 **Electron**。本地打包资源可见 React DOM 相关 bundle；上游 `stablyai/orca` 的 `package.json`、`electron.vite.config.ts` 进一步明确其 UI 技术栈：**React 19 + TypeScript + Vite/electron-vite + Tailwind CSS 4 + Radix UI**，状态管理使用 Zustand，图标使用 lucide-react。此处的“UI 引擎”不是单一库：Electron 提供桌面运行时，React 负责界面，Tailwind/Radix 等负责样式与组件基础。

上游证据：[`package.json`](https://github.com/stablyai/orca/blob/main/package.json)、[`electron.vite.config.ts`](https://github.com/stablyai/orca/blob/main/electron.vite.config.ts)。这些是检查时上游 main 分支的状态，实际本机版本可能不同。

建议本项目复用相同的前端基础（React + TypeScript + Tailwind，组件按需选择 Radix），这样更容易参考 Orca 的工作区、标签、快捷命令、面板和状态交互。**不要复制 Orca 源码或把它的组件当成量化业务组件。**桌面容器是独立决策：Tauri 可减小安装包，Electron 与 Orca 一致且生态成熟；两者视觉实现基本相同。当前建议仍是先做 Web 前端，原型评审和远端连通验证通过后再选壳，不把 Tauri/Electron 的选择阻塞原型。

### 2.3 为什么不全用 Rust

Demo v1 的主要风险是数据源、指标口径和回测规则，而不是语言运行速度。全 Rust 会显著提高数据生态接入和研究迭代成本。先用列式查询和批量计算解决数据吞吐；只有基准测试证明某段 Python/Polars 代码成为瓶颈，才为该热点单独做优化。

### 2.4 为什么不只做网页

Orca 式桌面体验需要本地窗口、持久工作区和系统集成。建议先以普通网页开发和验证界面，后续由评审通过的桌面壳打包同一套前端。桌面壳不应成为后端部署边界：Python 服务在 AutoDL 独立运行，客户端通过受保护的 HTTP/SSE API 连接。

### 2.5 技术决定状态

以下为推荐而非已批准的最终决定：

| 决策 | 建议 | 需确认/验证 |
|---|---|---|
| 后端语言 | Python 3.12+（按依赖兼容性锁定具体版本） | AutoDL 镜像可安装依赖；数据源包兼容 |
| UI | TypeScript + React，参考 Orca 的 Tailwind/Radix 交互基础 | 原型评审后确认组件范围 |
| 桌面封装 | 先不锁定；默认优先验证 Tauri，若依赖 Electron 特性或生态再选 Electron | 比较包体、更新、系统集成和维护成本 |
| API | FastAPI，REST 查询/命令 + SSE 任务事件 | 断线重连和认证验证 |
| 默认基准 | 沪深 300；回测接口保留可配置能力 | 数据覆盖和基准复权验证 |
| MCP | Python MCP SDK，复用业务服务层 | SDK 版本及 MCP 传输方式验证 |
| 存储 | Parquet + DuckDB | 并发读写、增量更新和备份恢复验证 |
| 表计算 | Python 原生 + DuckDB；必要时 Polars | 代表性全市场任务做基准测试 |
| 图表 | lightweight-charts（日 K）+ ECharts（统计图） | 原型中验证所需图型 |

项目开始前固定 lockfile 和运行时版本。依赖版本不得用浮动 latest。

## 3. 逻辑架构

```text
桌面客户端（Tauri/Electron 待评审）
  └─ React/TypeScript：工作区、复盘、个股、筛选、回测、任务、Agent UI
       └─ HTTPS API + SSE
            └─ Python 服务（AutoDL）
                 ├─ API 层：请求校验、鉴权、序列化
                 ├─ 应用服务：复盘、查询、筛选、回测、任务
                 ├─ 领域计算：指标口径、交易规则、策略/回测
                 ├─ MCP 适配层：调用同一应用服务，不复制业务逻辑
                 └─ 数据适配与仓储：外部数据源、Parquet、DuckDB
```

MCP 与桌面 API 调用相同的应用服务。页面不能直接读写数据库；MCP 不能通过 shell 执行任意用户代码。

## 4. 模块边界

1. **data**：数据源适配、增量更新、交易日历、schema、质量检查。
2. **market**：行情、股票状态、行业/概念、涨停和资金流查询。
3. **research**：复盘统计、指标字典、筛选条件。
4. **backtest**：信号、成交模拟、费用、组合曲线和绩效统计。
5. **jobs**：提交、状态、日志、取消、产物索引。
6. **api**：客户端需要的 HTTP 接口和 SSE 事件。
7. **mcp**：Agent 工具适配。
8. **desktop**：UI、客户端状态、远端连接和桌面壳。

首版可采用单体服务和模块化代码，不拆微服务。每个模块只在确有复用边界时定义接口，不建通用插件平台。

## 5. 建议仓库结构

以下是逻辑边界清楚、适合单仓库协作的建议结构。只在实际需要时创建目录，不为每个未来模块放空文件。数据和凭证不进入仓库。

```text
quant-workbench/
├── README.md
├── pyproject.toml              # Python 服务及量化核心依赖
├── uv.lock                     # Python 锁文件（若评审选 uv）
├── package.json                # 前端工作区命令
├── pnpm-lock.yaml              # 前端锁文件（若评审选 pnpm）
├── .gitignore
├── .env.example                # 仅变量名和示例占位值
├── backend/
│   ├── src/quant_workbench/
│   │   ├── api/                # HTTP API、SSE
│   │   ├── application/        # 用例编排、任务提交
│   │   ├── domain/             # 指标、市场规则、回测规则
│   │   ├── data/               # 数据源适配、质量检查、存取
│   │   ├── jobs/               # 任务状态、日志和产物索引
│   │   └── mcp/                # MCP 工具适配，不重复领域逻辑
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── fixtures/
├── desktop/
│   ├── src/
│   │   ├── app/                # 路由、应用壳
│   │   ├── features/           # review、stock、screen、backtest、jobs、agent
│   │   ├── components/         # 跨功能通用 UI
│   │   ├── services/           # API/MCP 客户端
│   │   └── state/              # 仅客户端状态
│   └── tests/
├── prototype/
│   └── index.html              # 评审用原型，不作为生产 UI 源码
├── docs/
├── research/
├── tasks/
└── scripts/                    # 本地开发、数据诊断和验证脚本
```

若 Python 前端 monorepo 工具或桌面容器最终选型改变，保持 `backend`、`desktop`、`prototype` 的职责边界，不为迁就目录结构做不必要的代码移动。

### 5.1 命名约定

- Python 包/文件/函数/变量：`snake_case`；类和异常：`PascalCase`；常量：`UPPER_SNAKE_CASE`。
- TypeScript/React：组件和类型 `PascalCase`；变量/函数 `camelCase`；文件名按导出主体命名，React 组件用 `PascalCase.tsx`，普通模块用 `kebab-case.ts` 或团队统一后全程一致。
- 测试文件与目标模块对应：Python `test_<module>.py`；前端 `<name>.test.tsx`。
- 指标 ID 使用稳定的 `snake_case`，例如 `low_open_recovery_rate`；展示名称与 ID 分开，公式/版本放指标字典。
- API 字段使用 `snake_case` JSON；前端类型按 API schema 生成或集中定义，不能手工在多个模块重复声明。
- 任务文件 `T-001-short-name.md`；分支 `feat/T-001-short-name` / `fix/T-001-short-name`。
- 数据集和结果产物使用小写名称、明确日期/版本；不在文件名里塞含糊的 `final2`、`new`、`latest`。

### 5.2 数据、产物与本地配置

运行时数据放在仓库外的明确数据根目录（例如 AutoDL 持久卷的 `data/`），仓库只保存 schema、配置样例和小型测试 fixture。回测产物按 `runs/<YYYY-MM-DD>/<run_id>/` 组织，包含参数、版本元信息、指标摘要和必要数据引用；大结果文件不提交 Git。日志、缓存和密钥目录加入 `.gitignore`。

## 6. 核心接口约定

技术评审冻结后，接口 schema 放入仓库并成为前后端共同依据。

### 6.1 任务模型

每个任务至少有：`id`、`type`、`status`、`created_by`、`created_at`、`started_at`、`finished_at`、`progress`、`params`、`log_ref`、`artifact_refs`、`error`。

任务状态只允许：`queued`、`running`、`succeeded`、`failed`、`cancel_requested`、`cancelled`。状态转换由服务端校验。SSE 只发事件；断线后客户端通过任务查询接口恢复，不依赖 SSE 永不掉线。

### 6.2 研究运行记录

筛选、指标计算和回测统一记录输入参数、数据快照标识、代码版本、口径版本、开始/结束时间、状态和结果引用。大结果不塞入任务表或 MCP 消息，使用文件产物和分页 API。

### 6.3 指标与策略

实现前先定最小注册格式和测试方式。指标函数应是可独立测试的纯计算或显式读数据函数；策略产生目标信号，成交和费用由回测器负责。v1 不要求动态加载第三方插件。

## 7. 数据与回测技术规则

- 原始行情、复权因子和经过处理的研究数据区分保存；不覆盖原始来源。
- 首批数据优先从 GitHub 已有数据包、数据湖或适配项目开始验证；验证字段、历史覆盖、复权、ST/新股历史状态、质量、更新方式和许可证。
- 未通过验证的数据包只能作为研究参考，不能直接成为生产回测数据。
- 交易日历是时间推进的唯一依据。
- 股票范围按历史交易日的证券板块、风险警示状态和上市阶段适用规则处理；v1 覆盖沪深主板、创业板、科创板，包含新股和 ST，排除北交所。
- 新股上市初期、注册制规则切换、ST 状态变更必须使用历史生效日期；缺少历史状态/规则数据时要标记不可准确模拟，不能用当前规则回填。
- ST 是否默认纳入某次筛选由筛选条件决定；市场复盘可包含 ST，但应可区分显示。
- 交易规则集中实现并用固定边界样例测试；页面和 Agent 不自行推导涨跌停价。
- 回测结果引用明确的数据快照和策略版本；无可追溯数据快照时标记不可完全复现。
- DuckDB/Parquet 写入采用单写者或明确锁策略；不要默认多进程同时改同一数据文件。
- AutoDL 上数据目录与代码目录分离；凭证通过环境变量/密钥配置注入，不提交到 Git。

## 8. 服务与连接

- AutoDL 运行 Python API 和任务 worker；服务启动有健康检查。
- 外部访问必须用 TLS 或受保护的隧道/私网方案，并做令牌认证；不把实例服务端口裸露给匿名公网。
- 客户端显示 API 健康、数据新鲜度和最近成功更新时间。
- 长任务由远端继续执行，客户端重连后读取任务状态。
- 任务与结果要有可备份、可恢复的目录约定；实例不会释放不等于误删、磁盘故障或程序覆盖不存在，至少验证一次恢复流程。

## 9. 复用开源项目的规则

### 9.1 默认顺序

**先找现成的 → 直接依赖 → 适配封装 → 改造复用 → 都没有才自研。** 自研必须说明“找不到合适实现”的理由，不能因为“改别人的代码麻烦”就重写。

### 9.2 三层复用

| 层级 | 做法 | 适用 | 代价 |
|---|---|---|---|
| L1 直接依赖 | pip/npm 引入，按上游接口使用 | 数据接口、图表库、MCP SDK、序列化、通用工具 | 最低；受上游版本和接口约束 |
| L2 适配封装 | 写薄适配层转换到本项目的接口，不改上游 | 上游能算但口径/字段不完全匹配，或需要替换数据源 | 中；适配层要有自己的测试 |
| L3 改造复用 | 把实现引入本仓库并重构、补测试 | 功能形态要照搬但质量不达标，且无可用替代 | 最高；必须过许可证门槛和改造验收 |

同一能力只选一层，不要出现“L1 调一份、L3 又抄一份”。

### 9.3 许可证门槛

| 许可证 | 处理 |
|---|---|
| MIT / Apache-2.0 / BSD / ISC | 允许 L3 改造复用，保留原始版权与 NOTICE |
| AGPL / GPL / LGPL | 不直接改入代码库；确需使用时按 L3 决策报项目创建者确认，并评估服务端开源义务 |
| 无 LICENSE 或声明不明 | 视为不可复用 |
| 仅参考设计/交互，不复制代码 | 不受许可证约束，但要注明来源 |

许可证判断写入 `research/REUSE-REGISTER.md`，未登记不得合入。

### 9.4 改造复用的验收标准

改造后必须比原实现更符合本项目的规则，否则不如直接依赖：

- 结构贴合本项目的模块边界，不引入第二套分层模式；
- 命名符合 §5.1，删除原仓库的业务残留、未使用分支和死代码；
- 计算复杂度不劣于原实现，热点路径有基准或至少有大 O 说明；
- 对外接口单一入口，扩展点收敛在注册表/参数，不新增并行机制；
- 为非平凡分支、边界和市场规则补测试，测试是本项目写的，不是原仓库的；
- 文件头注明来源仓库、commit、许可证和改动摘要。

### 9.5 候选方向

- A 股数据湖/接口：CNEquity、adata、AkShare 等，先验证所需字段、历史覆盖、限流和许可；
- 量化研究：Qlib、vectorbt 等，按实际回测需求评估，不同时引入多个重叠引擎；
- 桌面工作台：参考 Orca 的布局与任务体验；Orca 为 MIT 且体量大，优先参考交互与信息架构，不整仓 fork；
- 可视化：优先使用成熟图表组件，不自研 K 线绘图。

### 9.6 反模式

- 把大型平台整仓 fork 进来当底座（包体、依赖和后续合并成本远超收益）；
- 同时引入两个功能重叠的引擎（例如两个回测框架）；
- 复制代码但不记录来源和 commit，后续无法判断许可证与升级路径；
- 以“L3 改造”为名，实际只改名不重构，留下无法维护的混合代码。

## 10. 技术验证清单（开工首阶段）

1. AutoDL 环境安装 Python、依赖和服务启动；
2. 从客户端/浏览器安全访问健康检查端点；
3. SSE 中断后使用任务查询恢复状态；
4. 下载和查询一段真实行情，核对复权与交易日；
5. 用代表性股票池/区间做计算基准；
6. 用评审通过的桌面壳打包最小前端并连接远端服务；
7. 备份并恢复一份 Parquet 数据与任务产物。

验证结果记录在 `research/`，失败时先调整方案，不以计划日期为由跳过。

## 11. 明确暂不采用

- 微服务、Kubernetes、Kafka、Airflow 等复杂基础设施；
- Rust 重写量化内核；
- 自研图表系统和通用插件框架；
- 多个互相重叠的回测引擎；
- 让 Agent 直接执行任意 Python/SQL；
- 将数据库文件直接同步到桌面客户端。
