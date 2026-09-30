# 小马宝莉数学乐园

iPad 适配的儿童 10 以内加减法游戏

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
- **卡片收集**：答对累计获得小马卡片
- **Canvas 绘制**：所有小马角色使用 Canvas 绘制，零外部依赖
- **Web Audio**：使用 Web Audio API 生成音效
- **iPad 适配**：响应式布局，支持横竖屏
- **多用户**：无需密码即可创建、切换用户并选择头像
- **排行榜**：按累计答对题数展示所有用户排名
- **用户数据**：卡片收集进度和高分按用户名保存到本地 JSON

## 可选资产

如需使用外部图片，可下载免费资源放入 `assets/images/`:

- Vecteezy: 搜索 "little pony vector"
- Pixabay: 搜索 "cute pony cartoon"
- Flaticon: 搜索 "pony icon"
