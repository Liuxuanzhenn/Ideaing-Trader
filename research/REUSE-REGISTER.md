# 复用项目登记表

任何直接依赖之外的复用（L2 适配、L3 改造）必须先登记。规则见 [技术方案 §9](../docs/TECHNICAL-DESIGN.md#9-复用开源项目的规则)。

| 能力 | 复用层级 | 来源仓库 | commit/tag | 许可证 | 采用路径 | 改动范围 | 上游活跃度 | 测试/验证 | 状态 |
|---|---|---|---|---|---|---|---|---|---|
| K 线图渲染 | L1 直接依赖 | https://github.com/tradingview/lightweight-charts | npm `lightweight-charts@5.2.1` | Apache-2.0 | 替换自研 SVG K 线（`web/src/components/StockChart.tsx` 398 行 → 库渲染 + 数据映射） | 无上游改动；删除手绘蜡烛/坐标轴/十字光标代码，保留自家指标公式与周月聚合 | 活跃（TradingView 官方维护） | `npm run build` 通过；蜡烛+MA+成交量+MACD/KDJ/RSI 三副图渲染 | 已采用 |
| 自研：日频回测引擎 | 自研（未找到合适实现） | — | — | — | `backend/src/quant_workbench/backtest/` | 全部自研 | — | 190 个测试含边界样例 | 已采用 |
| 自研：涨跌停与 ST 判定 | 自研（未找到合适实现） | — | — | — | `market/limits.py`、`market/review.py` | 全部自研 | — | 边界样例测试 + 140 处 ST 反证比对 | 已采用 |

字段说明：

- **复用层级**：`L1 直接依赖`、`L2 适配封装`、`L3 改造复用`。
- **来源仓库**：GitHub 地址；L3 必须给固定 commit，不用 `main`。
- **许可证**：以仓库 LICENSE 文件为准，不凭 README 或口头说明判断。
- **改动范围**：L3 写明被修改的目录/文件，以及删除了哪些原业务逻辑。
- **状态**：`待调研`、`试验中`、`已采用`、`已弃用`。

L3 改造复用还需要在文件头写明来源与改动摘要，否则 review 时不通过。
