# bs_within_osapi
* 示例：B/S项目，web前端间接调用用户机器的操作系统API

# WinOnline - 在线 Markdown 编辑器

一个基于 Web 的本地文件系统浏览器和 Markdown 编辑器。

## 功能特性

- **文件浏览**: 像资源管理器一样浏览本地磁盘
- **Markdown 编辑**: 实时编辑和预览 Markdown 文件
- **用户认证**: 支持多用户管理和权限控制
- **操作日志**: 记录所有文件操作

## 项目结构

```
bs_within_osapi/
├── backend/              # 后端服务 (Flask, 端口 5000)
│   ├── app.py           # 主应用
│   ├── models.py        # 数据库模型
│   └── config.py        # 配置
├── frontend/            # 前端静态文件 (端口 8080)
│   ├── index.html       # 主页面
│   ├── app.js           # 应用逻辑
│   └── styles.css       # 样式
├── osapi_service/       # 文件操作系统 API (端口 8888) ⚠️ 需在客户机部署
│   ├── app.py           # 主应用
│   └── models.py        # 数据库模型
├── test/                # 测试文件夹
├── build_exe.py         # PyInstaller 打包脚本
└── OSAPI_README.md       # OS API 详细说明
```

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                        客户端浏览器                       │
│                    http://localhost:8080                 │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP
                      ▼
┌─────────────────────────────────────────────────────────┐
│                       前端服务                           │
│                    (任意 Web 服务器)                      │
└─────────────────────┬───────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                        ▼
┌─────────────────┐      ┌─────────────────┐
│   后端服务       │      │   OS API 服务    │
│   (端口 5000)    │      │   (端口 8888)    │
│   用户认证       │      │   文件操作       │
│   日志管理       │      │   ⚠️ 必须在     │
└─────────────────┘      │   客户机上运行    │
                          └─────────────────┘
```

## 启动方式

启动前端和后端服务：

```bash
# 后端服务 (端口 5000)
cd backend
python app.py

# 前端静态服务 (端口 8080)
# 启动前，请在frontend/app.js中配置后端服务器IP地址
const CONFIG = {
    // BACKEND_API需要配置后端服务器ip
    BACKEND_API: 'http://192.168.0.7:5000/api',
    // OSAPI为127.0.0.1即可
    OSAPI: 'http://127.0.0.1:8888/api'
};
# 配置好后再启动
cd frontend
python -m http.server 8080
```

启动OS API 服务 (端口 8888) ⚠️ 必须在客户机上运行： 
#### 1. 安装python运行
1. 确保客户机上安装了Python环境
2. 复制osapi_service文件夹至客户机，运行OS API服务：
```bash
cd osapi_service
pip install flask flask_cors flask_sqlalchemy
python app.py
```

#### 2. 打包运行
1. 安装 PyInstaller：
```bash
pip install pyinstaller
```

2. 运行打包脚本：
```bash
cd osapi_service
python build.py
```

3. 将 `osapi_service/dist/` 目录下的 exe 文件复制到客户机

4. 在客户机上双击运行`osapi_server.exe`


## 默认账户

- 用户名: `admin`
- 密码: `admin123`

## 访问地址

- 前端页面: http://[前端服务器IP]:8080
- 后端 API: http://[后端服务器IP]:5000
- OS API: http://[客户机IP]:8888

## 技术栈

- **后端**: Flask, Flask-CORS, Flask-SQLAlchemy
- **前端**: 原生 JavaScript, marked.js (Markdown 渲染)
- **数据库**: SQLite

## API 端点

### 后端 API (端口 5000)

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/auth/login` | POST | 用户登录 |
| `/api/users` | GET, POST | 用户列表/创建 |
| `/api/users/<id>` | GET, PUT, DELETE | 用户详情/更新/删除 |
| `/api/logs` | GET | 操作日志 |

### 文件系统 API (端口 8888)

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/system/drives` | GET | 获取驱动器列表 |
| `/api/system/info` | GET | 获取系统信息 |
| `/api/directory/list` | POST | 列出目录内容 |
| `/api/directory/create` | POST | 创建目录 |
| `/api/file/read` | GET | 读取文件 |
| `/api/file/create` | POST | 创建文件 |
| `/api/file/update` | PUT | 更新文件 |
| `/api/file/delete` | DELETE | 删除文件 |
| `/api/file/exists` | GET | 检查文件是否存在 |
| `/api/logs/files` | GET | 文件操作日志 |

## 使用说明

1. 双击驱动器进入目录
2. 双击文件夹进入子目录
3. 单击 `.md` 文件直接打开编辑
4. 使用 `../` 返回上级目录
5. 编辑器支持实时 Markdown 预览
