# Fix Main Flow Test Spec

## Why
目前主流程测试（test_full_flow.py）由于外部数据源（如饭太硬、肥猫等）不稳定，以及跨域代理服务经常失效，导致测试反复失败。为了让测试通过而不断增加的代理 fallback 逻辑使得代码变得过于复杂。我们需要简化这一流程，移除不必要的复杂重试机制，确保在本地测试环境中主流程能够稳定、成功地运行。

## What Changes
- 简化 `src/utils/request.ts` 和 `src/App.tsx` 中的数据源拉取逻辑。
- 在本地测试环境（localhost）下，提供一个稳定、简单的 mock 数据源，不再依赖外部不稳定接口。
- 调整 `test_full_flow.py` 脚本，使其直接使用本地 mock 数据源完成完整的 UI 交互测试（设置 -> 首页渲染 -> 详情页 -> 播放页）。

## Impact
- Affected specs: 自动化测试
- Affected code: `test_full_flow.py`, `src/utils/request.ts`, `src/App.tsx`, `src/pages/Home.tsx`

## MODIFIED Requirements
### Requirement: 稳定的自动化测试
系统在本地测试时，应当能够直接使用内置的 Mock 数据源快速完成渲染，以验证 UI 组件和路由跳转的主流程（首页 -> 详情 -> 播放），而不受外部网络环境的影响。