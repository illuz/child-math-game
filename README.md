# 小马宝莉数学乐园

iPad 适配的学前儿童数学与认字游戏，支持同一用户在不同设备之间同步学习进度。

## 运行方式

项目现在使用内置 Node.js 服务启动，服务同时负责静态文件和用户数据 API：

```bash
npm install
npm start
```

运行自动化测试：

```bash
npm test
```

然后在浏览器访问：<http://127.0.0.1:8080>

也可以通过环境变量修改端口：

```bash
PORT=3000 npm start
```

## 用户和卡片数据

首页可以切换或创建用户名并选择头像，不需要密码。每位用户拥有独立的卡片册、成绩和答题统计，数据保存在项目根目录的 `data/users.json`，重启 Node 服务后仍会保留。

页面通过以下 API 读写数据：

- `GET /api/users`：获取用户列表
- `POST /api/users`：创建用户，JSON 参数为 `{ "name": "用户名", "avatar": "🌈" }`
- `GET /api/users/:name`：读取用户数据
- `PUT /api/users/:name`：保存用户数据
- `GET /api/leaderboard`：按累计答对题数返回排行榜
- `POST /api/users/:name/events`：幂等写入答题、卡片、成绩和练习 Session 事件
- `GET /api/users/:name/dashboard`：携带 `X-Parent-Pin` 读取技能进度、每日任务、成就和家长报告数据
- `POST /api/users/:name/parent-pin`：设置或验证 4 位家长 PIN（服务端只保存带用户盐的 `scrypt` hash）

## 项目结构

```
child-math-game/
├── index.html          # 主页面
├── server.js           # Node.js 静态文件和用户数据服务
├── data/
│   └── users.json      # 用户卡片数据（运行时自动维护）
├── css/
│   ├── main.css        # 主样式
│   └── animations.css  # 动画样式
├── js/
│   ├── main.js         # 应用入口
│   ├── visual-math-game.js # 看图数学逻辑
│   ├── mission-engine.js   # 每日任务和成就文案
│   ├── content/
│   │   └── skills.js    # 学前数学技能目录
│   ├── core/
│   │   ├── timer-controller.js
│   │   ├── session-controller.js
│   │   └── progress.js
│   ├── config.js       # 游戏配置
│   ├── game.js         # 游戏逻辑
│   ├── pony.js         # Canvas 绘制小马
│   ├── sound.js        # Web Audio 音效
│   ├── storage.js      # Node API 存储客户端
│   └── animations.js   # 动画效果
└── assets/
    ├── images/         # 预留图片目录
    └── sounds/         # 预留音效目录
```

## 功能特性

- **三种难度**：简单(1-5)、中等(1-8 限时)、困难(1-10 限时)
- **学前视觉数学**：看图数数（1-5、1-10）、比较数量、找图形规律，并提供逐题提示
- **卡片收集**：答对累计获得小马卡片
- **卡片升级**：重复卡片自动转换为星星
- **学习进度**：按技能累计尝试次数、正确率、提示次数和掌握度
- **每日任务与成就**：跨设备同步答题、练习 Session、卡片和成就事件，任务奖励只发放一次
- **Canvas 绘制**：所有小马角色使用 Canvas 绘制，零外部依赖
- **Web Audio**：使用 Web Audio API 生成音效
- **iPad 适配**：响应式布局，支持横竖屏
- **多用户**：无需密码即可创建、切换用户并选择头像
- **排行榜**：按累计答对题数展示所有用户排名
- **家长中心**：使用 4 位 PIN 查看统计、今日任务和已获成就
- **跨设备同步**：设备 ID + 幂等事件队列，短暂离线时先保存在浏览器并在恢复连接后补传
- **用户数据**：卡片收集进度和高分按用户名保存到本地 JSON，旧版 `version: 1` 数据会自动兼容

## 可选资产

如需使用外部图片，可下载免费资源放入 `assets/images/`:

- Vecteezy: 搜索 "little pony vector"
- Pixabay: 搜索 "cute pony cartoon"
- Flaticon: 搜索 "pony icon"
