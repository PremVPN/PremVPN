// ==================================================================
// 🔥 PREMVPN — ИСПРАВЛЕННАЯ ВЕРСИЯ
// ==================================================================

const BACKUP_URL = "https://github.com/PremVPN/PremVPN/raw/refs/heads/main/Karing_09_05.zip";

const CONFIG = {
  BRAND_NAME: "PremVPN",
  PAYMENT_URL: "https://t.me/PremVPN_bot",
  ADMIN_PASSWORD: "admin123",
  DEFAULT_MAX_DEVICES: 3,
  MAX_DEVICES_LIMIT: 25,
  CACHE_TTL: 60000,
  BACKUP_CACHE_TTL: 86400000
};

interface DeviceInfo {
  id: string;
  connectedAt: string;
  lastSeen: string;
  userAgent?: string;
  ip?: string;
}

interface UserData {
  active: boolean;
  note: string;
  expireDate: string;
  maxDevices: number;
  devices: DeviceInfo[];
  totalConnections: number;
  createdAt: string;
}

interface CachedUsers {
  data: Array<{ token: string; data: UserData }>;
  timestamp: number;
}

let cachedUsers: CachedUsers | null = null;
let cachedBackup: { data: Uint8Array; timestamp: number } | null = null;

const kv = await Deno.openKv();

function generateToken(): string {
  return "user_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

async function getUsers(forceRefresh = false): Promise<Array<{ token: string; data: UserData }>> {
  if (!forceRefresh && cachedUsers && (Date.now() - cachedUsers.timestamp) < CONFIG.CACHE_TTL) {
    return cachedUsers.data;
  }
  
  const users: Array<{ token: string; data: UserData }> = [];
  const iter = kv.list<UserData>({ prefix: ["users"] });
  for await (const entry of iter) {
    users.push({ token: entry.key[1] as string, data: entry.value });
  }
  users.sort((a, b) => a.token.localeCompare(b.token));
  
  cachedUsers = { data: users, timestamp: Date.now() };
  return users;
}

async function saveUser(token: string, data: UserData): Promise<void> {
  await kv.set(["users", token], data);
  cachedUsers = null;
}

async function deleteUser(token: string): Promise<void> {
  await kv.delete(["users", token]);
  cachedUsers = null;
}

async function getBackup(): Promise<Uint8Array> {
  if (cachedBackup && (Date.now() - cachedBackup.timestamp) < CONFIG.BACKUP_CACHE_TTL) {
    return cachedBackup.data;
  }
  
  const resp = await fetch(BACKUP_URL);
  if (!resp.ok) throw new Error("Backup fetch failed");
  const data = new Uint8Array(await resp.arrayBuffer());
  cachedBackup = { data, timestamp: Date.now() };
  return data;
}

// ==================== АДМИН-ПАНЕЛЬ ====================
const ADMIN_HTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CONFIG.BRAND_NAME} Admin</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 20px; background: #f0f2f5; }
        .container { max-width: 1600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-top: 0; }
        h2 { color: #555; margin: 20px 0 10px 0; font-size: 18px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: 600; }
        .add-form { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; align-items: flex-end; }
        .form-group { display: flex; flex-direction: column; gap: 4px; }
        .form-group label { font-size: 12px; color: #555; font-weight: 500; }
        input, select, button { padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
        button { background: #007bff; color: white; border: none; cursor: pointer; transition: all 0.2s; }
        button:hover { background: #0056b3; transform: translateY(-1px); }
        button.danger { background: #dc3545; }
        button.danger:hover { background: #c82333; }
        button.success { background: #28a745; }
        button.success:hover { background: #218838; }
        .token { font-family: 'Courier New', monospace; background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
        .link-box { background: #e9ecef; padding: 15px; border-radius: 4px; margin: 15px 0; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
        .badge.active { background: #d4edda; color: #155724; }
        .badge.blocked { background: #f8d7da; color: #721c24; }
        .badge.expired { background: #fff3cd; color: #856404; }
        .note { font-size: 12px; color: #666; margin-top: 10px; }
        .device-list { font-size: 11px; max-width: 250px; }
        .device-item { background: #f8f9fa; padding: 4px 6px; margin: 2px 0; border-radius: 4px; border-left: 3px solid #007bff; }
        .device-id { font-family: monospace; font-size: 10px; color: #666; }
        .device-time { font-size: 9px; color: #999; }
        .stats { display: inline-block; background: #e3f2fd; padding: 2px 6px; border-radius: 4px; margin-left: 5px; font-size: 10px; }
        .expand-btn { cursor: pointer; color: #007bff; font-size: 11px; margin-left: 5px; text-decoration: underline; }
        .devices-detail { display: none; margin-top: 5px; }
        .devices-detail.show { display: block; }
        .search-box { margin-bottom: 15px; padding: 8px; width: 300px; border: 1px solid #ddd; border-radius: 4px; }
        .error-message { color: red; padding: 10px; margin: 10px 0; background: #fee; border-radius: 4px; display: none; }
        .success-message { color: green; padding: 10px; margin: 10px 0; background: #efe; border-radius: 4px; display: none; }
    </style>
</head>
<body>
<div class="container">
    <h1>🚀 ${CONFIG.BRAND_NAME} — Панель управления</h1>
    <p class="note">⚡ Супер-эконом режим | 📊 Полная статистика подключений | 🔌 До ${CONFIG.MAX_DEVICES_LIMIT} устройств</p>
    
    <div id="errorMsg" class="error-message"></div>
    <div id="successMsg" class="success-message"></div>
    
    <input type="text" id="searchBox" class="search-box" placeholder="🔍 Поиск по токену или заметке...">
    
    <div class="add-form">
        <div class="form-group">
            <label>Токен (пусто = авто)</label>
            <input type="text" id="newToken" placeholder="user_xxxxxxxx" style="font-family:monospace;width:160px">
        </div>
        <div class="form-group">
            <label>Заметка</label>
            <input type="text" id="newNote" placeholder="Клиент / Telegram / Email">
        </div>
        <div class="form-group">
            <label>Срок действия</label>
            <input type="datetime-local" id="newExpire" value="${new Date(Date.now() + 24*60*60*1000).toISOString().slice(0,16)}">
        </div>
        <div class="form-group">
            <label>Быстрый выбор</label>
            <select id="expirePreset">
                <option value="12">12 часов</option>
                <option value="24" selected>24 часа</option>
                <option value="36">36 часов</option>
                <option value="48">48 часов</option>
                <option value="60">60 часов</option>
            </select>
        </div>
        <div class="form-group">
            <label>Макс. устройств (1-${CONFIG.MAX_DEVICES_LIMIT})</label>
            <input type="number" id="maxDevices" value="${CONFIG.DEFAULT_MAX_DEVICES}" min="1" max="${CONFIG.MAX_DEVICES_LIMIT}" style="width:80px">
        </div>
        <button id="addUserBtn">➕ Добавить пользователя</button>
    </div>

    <div class="link-box">
        <strong>🔗 Ссылка для Karing:</strong>
        <select id="tokenSelect" style="margin-left:10px; width:250px">
            <option value="">-- Выбери пользователя --</option>
        </select>
        <div style="margin-top:10px">
            <code id="generatedLink" style="word-break:break-all; background:#fff; padding:8px; display:block; border-radius:4px;">karing://restore-backup?url=\${location.origin}/config?token=ТОКЕН</code>
        </div>
        <button id="copyLinkBtn">📋 Копировать ссылку</button>
        <button id="copyAllLinksBtn" class="success" style="margin-left:10px">📋 Скопировать все ссылки</button>
    </div>

    <h2>📊 Статистика</h2>
    <div id="statsPanel" style="background:#f8f9fa; padding:10px; border-radius:4px; margin-bottom:20px; display:flex; gap:20px; flex-wrap:wrap;">
        <div>👥 Всего пользователей: <strong id="totalUsers">0</strong></div>
        <div>✅ Активных: <strong id="activeUsers">0</strong></div>
        <div>🔌 Всего устройств: <strong id="totalDevices">0</strong></div>
        <div>📱 Уникальных подключений: <strong id="totalConnections">0</strong></div>
        <div>⚠️ Истекших: <strong id="expiredUsers">0</strong></div>
    </div>

    <h2>📋 Список пользователей</h2>
    <table>
        <thead>
            <tr>
                <th style="width:15%">Токен</th>
                <th style="width:10%">Статус</th>
                <th style="width:15%">Заметка</th>
                <th style="width:12%">Срок действия</th>
                <th style="width:15%">Устройства</th>
                <th style="width:18%">Действия</th>
            </tr>
        </thead>
        <tbody id="users-body">
            <tr><td colspan="6" style="text-align:center">Загрузка...</td></tr>
        </tbody>
    </table>
</div>
<script>
    const PASSWORD = prompt("🔐 Пароль администратора") || "";
    let usersData = [];

    function showError(msg) {
        const errorDiv = document.getElementById('errorMsg');
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
        setTimeout(() => errorDiv.style.display = 'none', 3000);
    }

    function showSuccess(msg) {
        const successDiv = document.getElementById('successMsg');
        successDiv.textContent = msg;
        successDiv.style.display = 'block';
        setTimeout(() => successDiv.style.display = 'none', 3000);
    }

    async function api(endpoint, method='GET', body=null) {
        try {
            const headers = {'Content-Type':'application/json'};
            const opts = {method, headers};
            if (body) opts.body = JSON.stringify({...body, password: PASSWORD});
            const res = await fetch(endpoint, opts);
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(errorText || 'HTTP ' + res.status);
            }
            return await res.json();
        } catch (e) {
            showError('Ошибка: ' + e.message);
            throw e;
        }
    }

    async function loadUsers() {
        try {
            const data = await api('/admin/users');
            if (data.error) { showError(data.error); return; }
            usersData = data;
            renderTable();
            updateTokenSelect();
            updateStats();
        } catch (e) {
            console.error('Load users error:', e);
        }
    }

    function updateStats() {
        const total = usersData.length;
        const active = usersData.filter(u => {
            const exp = new Date(u.data.expireDate);
            return u.data.active && exp > new Date();
        }).length;
        const totalDevices = usersData.reduce((sum, u) => sum + (u.data.devices?.length || 0), 0);
        const totalConnections = usersData.reduce((sum, u) => sum + (u.data.totalConnections || 0), 0);
        const expired = usersData.filter(u => {
            const exp = new Date(u.data.expireDate);
            return exp < new Date();
        }).length;
        
        document.getElementById('totalUsers').textContent = total;
        document.getElementById('activeUsers').textContent = active;
        document.getElementById('totalDevices').textContent = totalDevices;
        document.getElementById('totalConnections').textContent = totalConnections;
        document.getElementById('expiredUsers').textContent = expired;
    }

    function getTimeLeft(expireStr) {
        const exp = new Date(expireStr);
        const now = new Date();
        const diff = exp - now;
        if (diff < 0) return { text: 'Истёк', expired: true };
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours < 24) return { text: hours + ' ч', expired: false };
        const days = Math.floor(hours / 24);
        return { text: days + ' дн', expired: false };
    }

    function formatDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    }

    window.toggleDevices = function(token) {
        const detailDiv = document.getElementById('devices-' + token.replace(/[^a-zA-Z0-9]/g, '_'));
        if (detailDiv) {
            detailDiv.classList.toggle('show');
        }
    };

    function renderTable() {
        const tbody = document.getElementById('users-body');
        const searchTerm = document.getElementById('searchBox')?.value.toLowerCase() || '';
        
        let filteredUsers = usersData;
        if (searchTerm) {
            filteredUsers = usersData.filter(u => 
                u.token.toLowerCase().includes(searchTerm) || 
                (u.data.note || '').toLowerCase().includes(searchTerm)
            );
        }
        
        if (!filteredUsers.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Нет пользователей. Добавьте первого!</td></tr>';
            return;
        }
        
        tbody.innerHTML = filteredUsers.map((u) => {
            const exp = new Date(u.data.expireDate);
            const now = new Date();
            const timeLeft = getTimeLeft(u.data.expireDate);
            const isExpired = exp < now;
            const devicesCount = u.data.devices?.length || 0;
            const maxDevices = u.data.maxDevices || ${CONFIG.DEFAULT_MAX_DEVICES};
            const totalConns = u.data.totalConnections || 0;
            
            let status = '', badgeClass = '';
            if (!u.data.active) { status = '🚫 Заблокирован'; badgeClass = 'blocked'; }
            else if (isExpired) { status = '⚠️ Истёк'; badgeClass = 'expired'; }
            else { 
                status = '✅ Активен (' + timeLeft.text + ')'; 
                badgeClass = 'active'; 
            }
            
            const expireFormatted = formatDate(u.data.expireDate);
            const createdFormatted = formatDate(u.data.createdAt);
            
            let devicesHtml = '<div style="font-size:11px">';
            devicesHtml += '📱 ' + devicesCount + '/' + maxDevices;
            devicesHtml += ' <span class="stats">📊 ' + totalConns + ' всего</span>';
            
            if (u.data.devices && u.data.devices.length > 0) {
                const safeToken = u.token.replace(/[^a-zA-Z0-9]/g, '_');
                devicesHtml += ' <span class="expand-btn" onclick="toggleDevices(\'' + u.token.replace(/'/g, "\\'") + '\')">▼ показать</span>';
                devicesHtml += '<div id="devices-' + safeToken + '" class="devices-detail">';
                u.data.devices.forEach(dev => {
                    devicesHtml += '<div class="device-item">';
                    devicesHtml += '<div class="device-id">🖥️ ' + (dev.id || 'unknown').substring(0, 12) + '...</div>';
                    devicesHtml += '<div class="device-time">📅 Первое: ' + formatDate(dev.connectedAt) + '</div>';
                    devicesHtml += '<div class="device-time">🕐 Последнее: ' + formatDate(dev.lastSeen) + '</div>';
                    if (dev.userAgent) devicesHtml += '<div style="font-size:9px;color:#999">' + dev.userAgent.substring(0, 40) + '</div>';
                    devicesHtml += '</div>';
                });
                devicesHtml += '</div>';
            } else {
                devicesHtml += '<div style="color:#999;margin-top:4px">Нет подключений</div>';
            }
            devicesHtml += '</div>';
            
            const noteDisplay = escapeHtml(u.data.note || '—');
            const tokenDisplay = escapeHtml(u.token);
            
            return '<tr>' +
                '<td><span class="token">' + tokenDisplay + '</span><br><span style="font-size:10px;color:#999">Создан: ' + createdFormatted + '</span></td>' +
                '<td><span class="badge ' + badgeClass + '">' + status + '</span></td>' +
                '<td>' + noteDisplay + '</td>' +
                '<td>' + expireFormatted + '</td>' +
                '<td class="device-list">' + devicesHtml + '</td>' +
                '<td>' +
                    '<button data-action="toggle" data-token="' + escapeHtml(u.token) + '" data-active="' + u.data.active + '" style="margin-right:5px">' + (u.data.active ? '🔒 Блок' : '🔓 Разблок') + '</button> ' +
                    '<button data-action="devices" data-token="' + escapeHtml(u.token) + '" style="background:#28a745;margin-right:5px">🗑️ Сброс устройств</button> ' +
                    '<button data-action="delete" data-token="' + escapeHtml(u.token) + '" class="danger">🗑️ Удалить</button>' +
                '</td>' +
            '</tr>';
        }).join('');
        
        document.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = btn.dataset.action;
                const token = btn.dataset.token;
                if (action === 'toggle') {
                    const currentActive = btn.dataset.active === 'true';
                    if (!confirm('Точно изменить статус?')) return;
                    const res = await api('/admin/toggle', 'POST', {token, active: !currentActive});
                    if (res.success) { showSuccess('Статус изменён'); loadUsers(); } 
                    else showError(res.error);
                } else if (action === 'delete') {
                    if (!confirm('Удалить ' + token + '? Данные будут потеряны навсегда!')) return;
                    const res = await api('/admin/delete', 'POST', {token});
                    if (res.success) { showSuccess('Пользователь удалён'); loadUsers(); } 
                    else showError(res.error);
                } else if (action === 'devices') {
                    if (!confirm('Сбросить все устройства для ' + token + '? Пользователь сможет подключиться заново.')) return;
                    const res = await api('/admin/reset-devices', 'POST', {token});
                    if (res.success) { showSuccess('Устройства сброшены'); loadUsers(); } 
                    else showError(res.error);
                }
            });
        });
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function updateTokenSelect() {
        const sel = document.getElementById('tokenSelect');
        if (!sel) return;
        sel.innerHTML = '<option value="">-- Выбери пользователя --</option>' + 
            usersData.map(u => '<option value="' + escapeHtml(u.token) + '">' + escapeHtml(u.token) + ' (' + escapeHtml(u.data.note || '—') + ') - ' + (u.data.devices?.length || 0) + '/' + (u.data.maxDevices || ${CONFIG.DEFAULT_MAX_DEVICES}) + ' устр.</option>').join('');
    }

    document.getElementById('tokenSelect')?.addEventListener('change', function() {
        const token = this.value;
        const link = token ? 
            'karing://restore-backup?url=' + location.origin + '/config?token=' + encodeURIComponent(token) + '&device=' + Date.now() :
            'karing://restore-backup?url=' + location.origin + '/config?token=ТОКЕН&device=ID_УСТРОЙСТВА';
        document.getElementById('generatedLink').textContent = link;
    });

    document.getElementById('copyLinkBtn')?.addEventListener('click', function() {
        const link = document.getElementById('generatedLink').textContent;
        navigator.clipboard.writeText(link);
        showSuccess('✅ Ссылка скопирована!');
    });

    document.getElementById('copyAllLinksBtn')?.addEventListener('click', function() {
        let links = '';
        usersData.forEach(u => {
            const link = location.origin + '/config?token=' + encodeURIComponent(u.token) + '&device=ID_УСТРОЙСТВА';
            links += (u.data.note || 'Без имени') + ': ' + link + '\n';
        });
        navigator.clipboard.writeText(links);
        showSuccess('✅ Скопировано ' + usersData.length + ' ссылок!');
    });

    document.getElementById('expirePreset')?.addEventListener('change', function() {
        const hours = parseInt(this.value);
        let date = new Date();
        date.setHours(date.getHours() + hours);
        document.getElementById('newExpire').value = date.toISOString().slice(0,16);
    });

    document.getElementById('addUserBtn')?.addEventListener('click', async function() {
        try {
            const token = document.getElementById('newToken').value;
            const note = document.getElementById('newNote').value;
            const expire = document.getElementById('newExpire').value;
            const maxDevices = parseInt(document.getElementById('maxDevices').value);
            
            if (isNaN(maxDevices) || maxDevices < 1 || maxDevices > ${CONFIG.MAX_DEVICES_LIMIT}) {
                showError('Максимум устройств должен быть от 1 до ' + ${CONFIG.MAX_DEVICES_LIMIT});
                return;
            }
            
            if (!expire) {
                showError('Выберите дату и время окончания подписки');
                return;
            }
            
            showSuccess('Добавление пользователя...');
            
            const res = await api('/admin/add', 'POST', {
                token: token || undefined, 
                note: note || '', 
                expireDate: expire,
                maxDevices: maxDevices
            });
            
            if (res.success) { 
                showSuccess('✅ Добавлен пользователь: ' + res.token); 
                document.getElementById('newToken').value = '';
                document.getElementById('newNote').value = '';
                await loadUsers(); 
            } else {
                showError('Ошибка: ' + (res.error || 'Неизвестная ошибка'));
            }
        } catch (e) {
            console.error('Add user error:', e);
            showError('Ошибка при добавлении: ' + e.message);
        }
    });

    document.getElementById('searchBox')?.addEventListener('input', () => renderTable());
    
    // Загружаем пользователей
    loadUsers();
    setInterval(() => loadUsers(), 30000);
</script>
</body>
</html>`;

// ==================== ОСНОВНОЙ СЕРВЕР ====================
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  console.log(`📥 ${method} ${pathname}`);

  // Админ-панель
  if (pathname === "/" || pathname === "/admin") {
    return new Response(ADMIN_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // API: список пользователей
  if (pathname === "/admin/users" && method === "GET") {
    try {
      const users = await getUsers();
      const safeUsers = users.map(u => ({
        token: u.token,
        data: {
          active: u.data.active,
          note: u.data.note,
          expireDate: u.data.expireDate,
          maxDevices: u.data.maxDevices,
          devices: u.data.devices || [],
          totalConnections: u.data.totalConnections || 0,
          createdAt: u.data.createdAt
        }
      }));
      return Response.json(safeUsers);
    } catch (e) {
      console.error("Error getting users:", e);
      return Response.json({ error: "Failed to get users" }, { status: 500 });
    }
  }

  // API: добавить пользователя
  if (pathname === "/admin/add" && method === "POST") {
    try {
      const body = await req.json();
      console.log("Add user request:", { ...body, password: "***" });
      
      if (body.password !== CONFIG.ADMIN_PASSWORD) {
        return Response.json({ success: false, error: "Неверный пароль" }, { status: 401 });
      }
      
      const token = body.token || generateToken();
      console.log("Generated token:", token);
      
      const existing = await kv.get(["users", token]);
      if (existing.value) {
        return Response.json({ success: false, error: "Токен уже существует" }, { status: 400 });
      }
      
      const user: UserData = {
        active: true,
        note: body.note || "",
        expireDate: body.expireDate || new Date(Date.now() + 24*60*60*1000).toISOString(),
        maxDevices: Math.min(CONFIG.MAX_DEVICES_LIMIT, Math.max(1, body.maxDevices || CONFIG.DEFAULT_MAX_DEVICES)),
        devices: [],
        totalConnections: 0,
        createdAt: new Date().toISOString()
      };
      
      await saveUser(token, user);
      console.log("User saved successfully:", token);
      
      return Response.json({ success: true, token });
    } catch (e) {
      console.error("Error adding user:", e);
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  // API: переключить active
  if (pathname === "/admin/toggle" && method === "POST") {
    try {
      const body = await req.json();
      if (body.password !== CONFIG.ADMIN_PASSWORD) {
        return Response.json({ success: false, error: "Неверный пароль" }, { status: 401 });
      }
      const users = await getUsers(true);
      const user = users.find(u => u.token === body.token);
      if (!user) {
        return Response.json({ success: false, error: "Пользователь не найден" }, { status: 404 });
      }
      user.data.active = body.active;
      await saveUser(body.token, user.data);
      return Response.json({ success: true });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  // API: сбросить устройства
  if (pathname === "/admin/reset-devices" && method === "POST") {
    try {
      const body = await req.json();
      if (body.password !== CONFIG.ADMIN_PASSWORD) {
        return Response.json({ success: false, error: "Неверный пароль" }, { status: 401 });
      }
      const users = await getUsers(true);
      const user = users.find(u => u.token === body.token);
      if (!user) {
        return Response.json({ success: false, error: "Пользователь не найден" }, { status: 404 });
      }
      user.data.devices = [];
      await saveUser(body.token, user.data);
      return Response.json({ success: true });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  // API: удалить пользователя
  if (pathname === "/admin/delete" && method === "POST") {
    try {
      const body = await req.json();
      if (body.password !== CONFIG.ADMIN_PASSWORD) {
        return Response.json({ success: false, error: "Неверный пароль" }, { status: 401 });
      }
      await deleteUser(body.token);
      return Response.json({ success: true });
    } catch (e) {
      return Response.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  // Эндпоинт для Karing
  if (pathname === "/config") {
    const token = url.searchParams.get("token");
    const deviceId = url.searchParams.get("device");
    
    if (!token) {
      return new Response("Token required", { status: 401 });
    }

    try {
      const users = await getUsers(true);
      const userEntry = users.find(u => u.token === token);
      if (!userEntry) {
        return new Response("Invalid token", { status: 401 });
      }
      
      const user = userEntry.data;

      if (!user.active) {
        return new Response("Account blocked", { status: 403 });
      }

      const expireDate = new Date(user.expireDate);
      if (new Date() > expireDate) {
        return new Response("Subscription expired", { status: 403 });
      }

      const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
      const userAgent = req.headers.get("user-agent") || "unknown";
      
      if (deviceId) {
        const existingDevice = user.devices.find(d => d.id === deviceId);
        
        if (!existingDevice) {
          if (user.devices.length >= user.maxDevices) {
            return new Response(`Maximum ${user.maxDevices} devices reached`, { status: 403 });
          }
          
          user.devices.push({
            id: deviceId,
            connectedAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            userAgent: userAgent.substring(0, 200),
            ip: clientIP
          });
          user.totalConnections = (user.totalConnections || 0) + 1;
          await saveUser(token, user);
        } else {
          existingDevice.lastSeen = new Date().toISOString();
          existingDevice.userAgent = userAgent.substring(0, 200);
          existingDevice.ip = clientIP;
          await saveUser(token, user);
        }
      }

      const backupData = await getBackup();
      return new Response(backupData, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="PremVPN.backup.zip"',
          "Cache-Control": "public, max-age=3600",
          "isp-name": CONFIG.BRAND_NAME,
          "isp-url": CONFIG.PAYMENT_URL,
          "X-Devices-Count": user.devices.length.toString(),
          "X-Max-Devices": user.maxDevices.toString(),
          "X-Total-Connections": (user.totalConnections || 0).toString()
        },
      });
    } catch (e) {
      console.error("Config error:", e);
      return new Response("Internal error", { status: 500 });
    }
  }

  return new Response("Not Found", { status: 404 });
});
