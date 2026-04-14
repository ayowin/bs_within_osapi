/**
 * WinOnline - 在线 Markdown 编辑器
 */

// ============== 配置 ==============

const CONFIG = {
    // BACKEND_API需要配置服务器ip
    BACKEND_API: 'http://192.168.0.7:5000/api',
    // OSAPI为127.0.0.1即可
    OSAPI: 'http://127.0.0.1:8888/api'
};

// ============== 状态管理 ==============

const state = {
    currentUser: null,
    token: null,
    currentPath: null,      // 当前目录路径
    currentFile: null,      // 当前文件路径
    isPreviewMode: false,   // 预览模式
    confirmCallback: null   // 确认回调
};

// ============== 工具函数 ==============

function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return document.querySelectorAll(selector) || [];
}

function showToast(message, type = 'info') {
    const toast = $('#toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
}

// ============== API 封装 ==============

async function backendRequest(endpoint, options = {}) {
    const url = `${CONFIG.BACKEND_API}${endpoint}`;
    const headers = { 'Content-Type': 'application/json', ...options.headers };

    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }

    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers,
            body: (options.method === 'POST' || options.method === 'PUT') && options.body
                ? JSON.stringify(options.body) : undefined
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: `请求失败: ${response.status}` }));
            throw new Error(error.error);
        }

        const text = await response.text();
        return text ? JSON.parse(text) : {};
    } catch (error) {
        console.error('Backend API Error:', error);
        throw error;
    }
}

async function osapiRequest(endpoint, options = {}) {
    let url = `${CONFIG.OSAPI}${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };

    if (options.method === 'GET' && options.params) {
        const params = new URLSearchParams(options.params);
        url += '?' + params.toString();
    }

    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers,
            body: (options.method === 'POST' || options.method === 'PUT') && options.body
                ? JSON.stringify(options.body) : undefined
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }

        const text = await response.text();
        return text ? JSON.parse(text) : {};
    } catch (error) {
        console.error('OS API Error:', error);
        throw error;
    }
}

// ============== 认证 ==============

async function login(username, password) {
    const data = await backendRequest('/auth/login', {
        method: 'POST',
        body: { username, password }
    });

    state.currentUser = data.user;
    state.token = data.token;
    localStorage.setItem('wineoline_user', JSON.stringify(data.user));
    localStorage.setItem('wineoline_token', data.token);
    return data;
}

function logout() {
    state.currentUser = null;
    state.token = null;
    localStorage.removeItem('wineoline_user');
    localStorage.removeItem('wineoline_token');
    showPage('login');
}

function checkAuth() {
    const user = localStorage.getItem('wineoline_user');
    const token = localStorage.getItem('wineoline_token');
    if (user && token) {
        state.currentUser = JSON.parse(user);
        state.token = token;
        return true;
    }
    return false;
}

// ============== 页面控制 ==============

function showPage(page) {
    $$('.page').forEach(p => p.classList.add('hidden'));
    $(`#${page}-page`).classList.remove('hidden');
    if (page === 'main') initMainPage();
}

function switchTab(tabName) {
    $$('.tab').forEach(t => t.classList.remove('active'));
    $(`.tab[data-tab="${tabName}"]`).classList.add('active');
    $$('.panel').forEach(p => p.classList.remove('active'));
    $(`#panel-${tabName}`).classList.add('active');
}

function showModal(id) { $(`#${id}`).classList.remove('hidden'); }
function hideModal(id) { $(`#${id}`).classList.add('hidden'); }

// ============== 主页面初始化 ==============

async function initMainPage() {
    $('#display-name').textContent = state.currentUser.display_name || state.currentUser.username;
    await loadSystemInfo();
    await loadDrives();
    await loadLogs();
}

// ============== 系统信息 ==============

async function loadSystemInfo() {
    try {
        const data = await osapiRequest('/system/info');
        $('#system-info').textContent = `用户: ${data.username} | 平台: ${data.platform}`;
    } catch (error) {
        console.error('加载系统信息失败:', error);
    }
}

// ============== 文件操作 ==============

// 加载驱动器列表
async function loadDrives() {
    const fileList = $('#file-list');
    fileList.innerHTML = '<p class="loading">加载驱动器...</p>';
    state.currentPath = null;
    $('#current-path').textContent = '我的电脑';

    try {
        const data = await osapiRequest('/system/drives');
        if (data.drives && data.drives.length > 0) {
            fileList.innerHTML = data.drives.map(drive => `
                <div class="dir-item drive-item" data-path="${drive}">
                    <span class="icon">💾</span>
                    <span class="name">${drive}</span>
                    <span class="meta">本地磁盘</span>
                </div>
            `).join('');
        } else {
            fileList.innerHTML = '<p class="empty-state">未检测到驱动器</p>';
        }
    } catch (error) {
        fileList.innerHTML = `<p class="error">加载失败: ${error.message}</p>`;
    }
}

// 加载目录文件列表
async function loadFiles(path = state.currentPath) {
    const fileList = $('#file-list');
    fileList.innerHTML = '<p class="loading">加载中...</p>';

    try {
        const data = await osapiRequest('/directory/list', {
            method: 'POST',
            body: { path }
        });

        state.currentPath = data.path;
        $('#current-path').textContent = data.path;

        // 生成返回上级目录项
        let html = '';
        html += generateParentDirItem(data.path);

        // 目录为空时的处理
        if (data.entries.length === 0) {
            fileList.innerHTML = html + '<p class="empty-state">目录为空</p>';
            return;
        }

        // 文件列表
        html += data.entries.map(entry => {
            if (entry.is_dir) {
                return `
                    <div class="dir-item" data-path="${entry.path}">
                        <span class="icon">📁</span>
                        <span class="name">${entry.name}</span>
                        <span class="meta">${formatDate(entry.modified)}</span>
                    </div>
                `;
            } else if (entry.name.endsWith('.md')) {
                return `
                    <div class="file-item" data-path="${entry.path}">
                        <span class="icon">📄</span>
                        <span class="name">${entry.name}</span>
                        <span class="meta">${entry.size ? (entry.size / 1024).toFixed(1) + ' KB' : ''} | ${formatDate(entry.modified)}</span>
                    </div>
                `;
            }
            return '';
        }).join('');

        fileList.innerHTML = html;
    } catch (error) {
        fileList.innerHTML = `<p class="error">加载失败: ${error.message}</p>`;
    }
}

// 生成返回上级目录项
function generateParentDirItem(currentPath) {
    const isDriveRoot = currentPath.match(/^[A-Z]:\\$/i);

    if (isDriveRoot) {
        return `
            <div class="dir-item parent-dir" data-path="__MY_COMPUTER__">
                <span class="icon">💻</span>
                <span class="name">../ (返回我的电脑)</span>
                <span class="meta">驱动器列表</span>
            </div>
        `;
    }

    let parentPath = currentPath.substring(0, currentPath.lastIndexOf('\\')) ||
        currentPath.substring(0, currentPath.lastIndexOf('/'));

    // 驱动器根目录（如 C:）
    if (parentPath && parentPath.match(/^[A-Z]:$/i)) {
        parentPath += '\\';
    }

    if (parentPath && parentPath !== currentPath) {
        return `
            <div class="dir-item parent-dir" data-path="${parentPath}">
                <span class="icon">⬆️</span>
                <span class="name">../ (返回上级)</span>
                <span class="meta">上级目录</span>
            </div>
        `;
    }
    return '';
}

// 双击检测
let lastClickTime = 0;
let lastClickPath = null;

function handleFileListClick(e) {
    const target = e.target.closest('.dir-item, .file-item');
    if (!target) return;

    const path = target.dataset.path;
    const now = Date.now();

    // 双击：进入目录或返回
    if (lastClickPath === path && now - lastClickTime < 300) {
        lastClickTime = 0;
        lastClickPath = null;
        if (path === '__MY_COMPUTER__') {
            loadDrives();
        } else {
            loadFiles(path);
        }
    } else {
        // 单击：打开 .md 文件
        lastClickTime = now;
        lastClickPath = path;
        if (target.classList.contains('file-item') && path.endsWith('.md')) {
            openFile(path);
        }
    }
}

// ============== 文件编辑 ==============

async function openFile(path) {
    try {
        const data = await osapiRequest('/file/read', {
            method: 'GET',
            params: { path }
        });

        state.currentFile = path;
        $('#file-path-input').value = path.split(/[/\\]/).pop();
        $('#markdown-editor').value = data.content;
        $('#file-info').textContent = `大小: ${(data.size / 1024).toFixed(1)} KB`;
        $('#status-message').textContent = '已加载文件';
        switchTab('editor');
    } catch (error) {
        showToast('打开文件失败: ' + error.message, 'error');
    }
}

async function saveFile() {
    const fileName = $('#file-path-input').value.trim();
    const content = $('#markdown-editor').value;

    if (!fileName) {
        showToast('请输入文件名', 'error');
        return;
    }

    // 拼接完整路径
    const currentDir = state.currentPath || 'C:\\';
    let path = fileName;
    if (!fileName.match(/^[A-Z]:/i)) {
        const sep = currentDir.endsWith('\\') ? '' : '\\';
        path = currentDir + sep + fileName;
    }

    try {
        const exists = await osapiRequest('/file/exists', { method: 'GET', params: { path } });
        if (exists.exists) {
            await osapiRequest('/file/update', { method: 'PUT', body: { path, content } });
        } else {
            await osapiRequest('/file/create', { method: 'POST', body: { path, content } });
        }
        state.currentFile = path;
        $('#file-path-input').value = fileName;
        $('#status-message').textContent = '保存成功 ' + formatDate(new Date());
        showToast('文件保存成功', 'success');
    } catch (error) {
        $('#status-message').textContent = '保存失败: ' + error.message;
        showToast('保存文件失败: ' + error.message, 'error');
    }
}

function newDocument() {
    state.currentFile = null;
    $('#file-path-input').value = '';
    $('#markdown-editor').value = '';
    $('#file-info').textContent = '';
    $('#status-message').textContent = '新建文档';
    if (state.isPreviewMode) togglePreview();
}

// ============== 目录操作 ==============

async function createDirectory() {
    const name = $('#new-dir-name').value.trim();
    if (!name || !state.currentPath) {
        showToast('请输入目录名称', 'error');
        return;
    }

    const path = state.currentPath + '\\' + name;
    try {
        await osapiRequest('/directory/create', { method: 'POST', body: { path } });
        hideModal('modal-new-dir');
        $('#new-dir-name').value = '';
        showToast('目录创建成功', 'success');
        await loadFiles();
    } catch (error) {
        showToast('创建目录失败: ' + error.message, 'error');
    }
}

// ============== Markdown 预览 ==============

function togglePreview() {
    const preview = $('#preview');
    const editor = $('#markdown-editor');

    if (state.isPreviewMode) {
        preview.classList.add('hidden');
        editor.style.display = 'block';
        state.isPreviewMode = false;
        $('#btn-preview').textContent = '预览';
    } else {
        if (typeof marked === 'undefined') {
            showToast('预览库未加载', 'error');
            return;
        }
        preview.innerHTML = marked.parse(editor.value);
        preview.classList.remove('hidden');
        editor.style.display = 'none';
        state.isPreviewMode = true;
        $('#btn-preview').textContent = '编辑';
    }
}

// ============== 日志 ==============

async function loadLogs() {
    const tbody = $('#logs-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">加载中...</td></tr>';

    try {
        const data = await osapiRequest('/logs/files');
        if (!data.logs || data.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无日志记录</td></tr>';
            return;
        }
        tbody.innerHTML = data.logs.map(log => `
            <tr>
                <td>${formatDate(log.created_at)}</td>
                <td>${log.operation}</td>
                <td>${log.file_name}</td>
                <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">${log.file_path}</td>
                <td class="${log.status === 'success' ? 'status-success' : 'status-failed'}">${log.status}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="error">加载失败: ${error.message}</td></tr>`;
    }
}

// ============== 用户管理 ==============

let usersPage = 1;
let usersSearch = '';
let logsPage = 1;

async function loadUsers(page = 1) {
    const tbody = $('#users-tbody');
    const pagination = $('#users-pagination');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">加载中...</td></tr>';

    try {
        let users = await backendRequest('/users');
        if (usersSearch) {
            users = users.filter(u =>
                u.username.toLowerCase().includes(usersSearch.toLowerCase()) ||
                (u.display_name && u.display_name.toLowerCase().includes(usersSearch.toLowerCase()))
            );
        }

        const perPage = 10;
        const totalPages = Math.ceil(users.length / perPage);
        const start = (page - 1) * perPage;
        const pageUsers = users.slice(start, start + perPage);

        if (pageUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无用户</td></tr>';
            pagination.innerHTML = '';
            return;
        }

        tbody.innerHTML = pageUsers.map(user => `
            <tr>
                <td>${user.id}</td>
                <td>@${user.username}</td>
                <td>${user.display_name || '-'}</td>
                <td>${user.email || '-'}</td>
                <td>${user.is_active ? '<span class="status-success">正常</span>' : '<span class="status-failed">禁用</span>'}</td>
                <td>${formatDate(user.created_at)}</td>
                <td class="action-buttons">
                    <button class="btn btn-small btn-secondary" onclick="editUser(${user.id})">编辑</button>
                    ${user.id !== state.currentUser.id ?
                        `<button class="btn btn-small btn-danger" onclick="confirmDeleteUser(${user.id}, '${user.username}')">删除</button>` :
                        '<span style="color:var(--gray-500);font-size:0.8rem;">当前用户</span>'}
                </td>
            </tr>
        `).join('');

        if (totalPages > 1) {
            pagination.innerHTML = renderPagination(page, totalPages, 'loadUsers');
        } else {
            pagination.innerHTML = '';
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="error">加载失败: ${error.message}</td></tr>`;
    }
}

function renderPagination(current, total, callbackName) {
    return `
        <button class="pagination-btn" ${current === 1 ? 'disabled' : ''} data-callback="${callbackName}" data-page="${current - 1}">上一页</button>
        <span style="padding:6px 12px;">第 ${current} / ${total} 页</span>
        <button class="pagination-btn" ${current === total ? 'disabled' : ''} data-callback="${callbackName}" data-page="${current + 1}">下一页</button>
    `;
}

document.addEventListener('click', e => {
    const btn = e.target.closest('.pagination-btn');
    if (!btn || btn.disabled) return;
    const fn = btn.dataset.callback;
    const page = parseInt(btn.dataset.page);
    if (fn === 'loadUsers') loadUsers(page);
    else if (fn === 'loadUserLogs') loadUserLogs(page);
});

function searchUsers() {
    usersSearch = $('#user-search').value;
    loadUsers(1);
}

async function createUser(formData) {
    try {
        await backendRequest('/users', { method: 'POST', body: formData });
        showToast('用户创建成功', 'success');
        $('#user-form').reset();
        await loadUsers(1);
    } catch (error) {
        showToast('创建用户失败: ' + error.message, 'error');
    }
}

function confirmDeleteUser(userId, username) {
    $('#confirm-message').textContent = `确定要删除用户 "${username}" 吗？`;
    state.confirmCallback = async () => {
        await backendRequest(`/users/${userId}`, { method: 'DELETE' });
        hideModal('modal-confirm');
        showToast('用户已删除', 'success');
        await loadUsers(usersPage);
    };
    showModal('modal-confirm');
}

async function editUser(userId) {
    try {
        const user = await backendRequest(`/users/${userId}`);
        $('#edit-user-id').value = user.id;
        $('#edit-username').value = user.username;
        $('#edit-email').value = user.email || '';
        $('#edit-display-name').value = user.display_name || '';
        $('#edit-password').value = '';
        showModal('modal-edit-user');
    } catch (error) {
        showToast('获取用户信息失败: ' + error.message, 'error');
    }
}

async function updateUser() {
    const userId = $('#edit-user-id').value;
    const formData = {
        email: $('#edit-email').value || null,
        display_name: $('#edit-display-name').value || null
    };
    const password = $('#edit-password').value;
    if (password) formData.password = password;

    try {
        await backendRequest(`/users/${userId}`, { method: 'PUT', body: formData });
        hideModal('modal-edit-user');
        showToast('用户更新成功', 'success');
        await loadUsers(usersPage);
    } catch (error) {
        showToast('更新用户失败: ' + error.message, 'error');
    }
}

async function loadUserLogs(page = 1) {
    const tbody = $('#user-logs-tbody');
    const pagination = $('#logs-pagination');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">加载中...</td></tr>';

    try {
        const data = await backendRequest('/logs', { params: { per_page: 10, page } });
        if (!data.logs || data.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无日志记录</td></tr>';
            pagination.innerHTML = '';
            return;
        }
        tbody.innerHTML = data.logs.map(log => `
            <tr>
                <td>${formatDate(log.created_at)}</td>
                <td>${log.action}</td>
                <td>${log.description || '-'}</td>
                <td>${log.ip_address || '-'}</td>
                <td class="${log.status === 'success' ? 'status-success' : 'status-failed'}">${log.status === 'success' ? '成功' : '失败'}</td>
            </tr>
        `).join('');
        if (data.pages > 1) {
            pagination.innerHTML = renderPagination(page, data.pages, 'loadUserLogs');
        } else {
            pagination.innerHTML = '';
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="error">加载失败: ${error.message}</td></tr>`;
    }
}

// ============== 事件绑定 ==============

document.addEventListener('DOMContentLoaded', () => {
    // 登录
    $('#login-form').addEventListener('submit', async e => {
        e.preventDefault();
        try {
            await login($('#username').value, $('#password').value);
            showPage('main');
            showToast('登录成功', 'success');
        } catch (error) {
            $('#login-error').textContent = error.message;
        }
    });

    $('#btn-logout').addEventListener('click', logout);

    // 标签页
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // 文件操作
    $('#btn-refresh-files').addEventListener('click', () => {
        if (state.currentPath) loadFiles(state.currentPath);
        else loadDrives();
    });
    $('#btn-new-file').addEventListener('click', () => switchTab('editor'));
    $('#btn-create-dir').addEventListener('click', () => {
        if (!state.currentPath) {
            showToast('请先进入一个目录', 'error');
            return;
        }
        $('#new-dir-name').value = '';
        showModal('modal-new-dir');
    });
    $('#file-list').addEventListener('click', handleFileListClick);

    // 编辑器
    $('#btn-save').addEventListener('click', saveFile);
    $('#btn-new-doc').addEventListener('click', newDocument);
    $('#btn-preview').addEventListener('click', togglePreview);

    // 日志
    $('#btn-refresh-logs').addEventListener('click', loadLogs);

    // 用户管理
    $('#btn-users').addEventListener('click', () => {
        usersPage = 1;
        usersSearch = '';
        $('#user-search').value = '';
        loadUsers(1);
        loadUserLogs(1);
        showModal('modal-users');
    });

    $('#user-form').addEventListener('submit', e => {
        e.preventDefault();
        createUser({
            username: $('#new-username').value,
            password: $('#new-password').value,
            email: $('#new-email').value || null,
            display_name: $('#new-display-name').value || null
        });
    });

    $('#edit-user-form').addEventListener('submit', e => {
        e.preventDefault();
        updateUser();
    });

    // 模态框
    $$('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => hideModal(btn.dataset.modal));
    });

    $$('.modal').forEach(modal => {
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });

    $('#btn-confirm-new-dir').addEventListener('click', createDirectory);
    $('#btn-confirm-yes').addEventListener('click', () => {
        if (state.confirmCallback) {
            state.confirmCallback();
            state.confirmCallback = null;
        }
    });
    $('#btn-confirm-no').addEventListener('click', () => hideModal('modal-confirm'));
    $('#btn-logs').addEventListener('click', () => switchTab('logs'));

    // 初始化
    if (checkAuth()) {
        showPage('main');
    } else {
        showPage('login');
    }
});

// 暴露全局函数
window.editUser = editUser;
window.confirmDeleteUser = confirmDeleteUser;
window.loadUsers = loadUsers;
window.loadUserLogs = loadUserLogs;
window.searchUsers = searchUsers;
