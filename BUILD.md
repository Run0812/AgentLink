# 构建说明

AgentLink Obsidian 插件构建指南

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（带热重载）
npm run dev

# 完整构建（检查 + 测试 + 构建）
npm run build

# 快速构建（仅构建，跳过检查）
npm run build:quick
```

## 构建产物

构建成功后，产物将输出到 `build/` 目录：

```
build/
├── main.js          # 主程序（约 98 KB）
├── manifest.json    # 插件清单
└── styles.css       # 样式文件（约 7 KB）
```

## 构建流程

### 1. 完整构建（推荐用于发布）

```bash
npm run build
```

执行步骤：
1. `npm run lint` - TypeScript 类型检查
2. `npm run test` - 运行所有单元测试
3. `esbuild production` - 打包并输出到 build/ 目录
4. 复制 manifest.json 和 styles.css 到 build/

### 2. 快速构建（开发调试）

```bash
npm run build:quick
```

仅执行打包，跳过类型检查和测试。

### 3. 清理构建目录

```bash
npm run clean
```

删除 `build/` 目录。

## 安装到 Obsidian

### 方法 1：开发模式

```bash
# 在项目根目录启动开发模式
npm run dev

# 创建符号链接到 Obsidian 插件目录
# macOS/Linux:
ln -s "$(pwd)" /path/to/vault/.obsidian/plugins/agentlink

# Windows (PowerShell, 管理员):
New-Item -ItemType SymbolicLink -Path "C:\path\to\vault\.obsidian\plugins\agentlink" -Target "$(Get-Location)"
```

### 方法 2：生产构建

```bash
# 构建插件
npm run build

# 复制 build/ 目录到 Obsidian 插件目录
cp -r build/ /path/to/vault/.obsidian/plugins/agentlink/
```

### 方法 3：手动安装

1. 运行 `npm run build`
2. 将 `build/` 文件夹复制到 Obsidian vault 的 `.obsidian/plugins/` 目录
3. 重命名文件夹为 `agentlink`
4. 在 Obsidian 设置中启用插件

## 目录结构

```
project-root/
├── build/                    # 构建产物（自动生成）
│   ├── main.js
│   ├── manifest.json
│   └── styles.css
├── src/                      # 源代码
│   ├── main.ts              # 插件入口
│   ├── core/                # 核心类型和工具
│   ├── adapters/            # 后端适配器
│   ├── services/            # 服务层
│   ├── settings/            # 设置管理
│   └── ui/                  # UI 组件
├── test/                     # 测试文件
├── manifest.json             # 插件清单（源文件）
├── styles.css               # 样式文件（源文件）
├── package.json
├── tsconfig.json
└── esbuild.config.mjs       # 构建配置
```

## 构建配置

### esbuild.config.mjs

- **Entry**: `src/main.ts`
- **Output**: `build/main.js`
- **Format**: CommonJS (cjs)
- **Target**: ES2018
- **Platform**: Node.js
- **Bundle**: 是（打包所有依赖）
- **Tree Shaking**: 启用

### 外部依赖（不打包）

- `obsidian` - Obsidian API
- `electron` - Electron API
- `@codemirror/*` - CodeMirror 编辑器
- `@lezer/*` - Lezer 解析器
- Node.js 内置模块

## 故障排除

### 构建失败

1. **检查依赖**
   ```bash
   npm install
   ```

2. **清理缓存**
   ```bash
   npm run clean
   rm -rf node_modules
   npm install
   ```

3. **检查 TypeScript 错误**
   ```bash
   npm run lint
   ```

### 测试失败

```bash
# 运行测试查看详细信息
npm test

# 调试模式
npm run test:watch
```

### 插件无法加载

1. 检查 `manifest.json` 是否存在
2. 确认 `main.js` 不为空
3. 检查 Obsidian 开发者控制台（Ctrl+Shift+I）查看错误

## 发布检查清单

- [ ] 运行 `npm run build` 成功
- [ ] 所有测试通过
- [ ] 构建产物在 `build/` 目录
- [ ] 更新 `manifest.json` 版本号
- [ ] 更新 `versions.json`
- [ ] 测试在干净环境安装

## 版本更新

```bash
# 自动更新版本号并提交
npm version patch  # 小版本
npm version minor  # 中版本
npm version major  # 大版本
```

这将：
1. 更新 `package.json` 版本
2. 更新 `manifest.json` 版本
3. 更新 `versions.json`
4. 创建 git 提交

## 参考

- [Obsidian 插件开发文档](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [esbuild 文档](https://esbuild.github.io/)
- [Vitest 文档](https://vitest.dev/)
