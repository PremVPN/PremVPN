// ==================================================================
// 🔥 PREMVPN — ФИНАЛЬНАЯ ЭНЕРГОЭФФЕКТИВНАЯ ВЕРСИЯ (40% оригинала)
// ==================================================================
// - Подписки: 12ч, 24ч, 36ч, 48ч, 60ч
// - Максимум устройств: до 25 (настраивается для каждого пользователя)
// - Полная статистика: сколько устройств, когда подключились, последний активность
// - Кэширование данных (60 сек пользователи, 24ч бэкап)
// - Минимум операций с KV
// ==================================================================

const BACKUP_URL = "https://github.com/PremVPN/PremVPN/raw/refs/heads/main/Karing_1.2.18.2102_ios_2026-05-02-1145.backup.zip";

const CONFIG = {
  BRAND_NAME: "PremVPN",
  PAYMENT_URL: "https://t.me/PremVPN_bot",
  ADMIN_PASSWORD: "admin123", // ⚠️ СМЕНИ ПАРОЛЬ!
  DEFAULT_MAX_DEVICES: 3, // Значение по умолчанию
  MAX_DEVICES_LIMIT: 25, // Абсолютный максимум
  CACHE_TTL: 60000, // 60 секунд кэш пользователей
  BACKUP_CACHE_TTL: 86400000 // 24 часа кэш бэкапа
};

interface DeviceInfo {
  id: string;
  connectedAt: string; // ISO строка первого подключения
  lastSeen: string; // ISO строка последнего запроса
  userAgent?: string; // Опционально: информация о браузере/приложении
  ip?: string; // Опционально: IP адрес
}

interface UserData {
  active: boolean;
  note: string;
  expireDate: string;
  maxDevices: number; // Максимум устройств для этого пользователя (1-25)
  devices: DeviceInfo[]; // Массив устройств с полной информацией
  totalConnections: number; // Общее количество уникальных подключений за всё время
  createdAt: string; // Дата создания аккаунта
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

function generateDeviceId(): string {
  return "dev_" + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
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
  cachedUsers = null; // Инвалидируем кэш
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
        .badge.warning { background: #ffc107; color: #212529; }
        .note { font-size: 12px; color: #666; margin-top: 10px; }
        .device-list { font-size: 11px; max-width: 250px; }
        .device-item { background: #f8f9fa; padding: 4px 6px; margin: 2px 0; border-radius: 4px; border-left: 3px solid #007bff; }
        .device-id { font-family: monospace; font-size: 10px; color: #666; }
        .device-time { font-size: 9px; color: #999; }
        .stats { display: inline-block; background: #e3f2fd; padding: 2px 6px; border-radius: 4px; margin-left: 5px; font-size: 10px; }
        .expand-btn { cursor: pointer; color: #007bff; font-size: 11px; margin-left: 5px; }
        .devices-detail { display: none; margin-top: 5px; }
        .devices-detail.show { display: block; }
        .search-box { margin-bottom: 15px; padding: 8px; width: 300px; border: 1px solid #ddd; border-radius: 4px; }
    </style>
</head>
<body>
<div class="container">
    <h1>🚀 ${CONFIG.BRAND_NAME} — Панель управления</h1>
    <p class="note">⚡ Супер-эконом режим | 📊 Полная статистика подключений | 🔌 До ${CONFIG.MAX_DEVICES_LIMIT} устройств</p>
    
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
                <option value="12h">12 часов</option>
                <option value="24h" selected>24 часа</option>
                <option value="36h">36 часов</option>
                <option value="48h">48 часов</option>
                <option value="60h">60 часов</option>
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

    async function api(endpoint, method='GET', body=null) {
        const headers = {'Content-Type':'application/json'};
        const opts = {method, headers};
        if (body) opts.body = JSON.stringify({...body, password: PASSWORD});
        const res = await fetch(endpoint, opts);
        return res.json();
    }

    async function loadUsers() {
        const data = await api('/admin/users');
        if (data.error) { alert(data.error); return; }
        usersData = data;
        renderTable();
        updateTokenSelect();
        updateStats();
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
        if (diff < 0) return { text: 'Истёк', expired: true, hours: 0 };
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        if (hours < 24) return { text: hours + 'ч ' + minutes + 'м', expired: false, hours };
        const days = Math.floor(hours / 24);
        return { text: days + 'д ' + (hours % 24) + 'ч', expired: false, hours };
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        return d.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    }

    function toggleDevices(deviceId) {
        const detailDiv = document.getElementById('devices-' + deviceId);
        if (detailDiv) {
            detailDiv.classList.toggle('show');
        }
    }

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
        
        tbody.innerHTML = filteredUsers.map((u, idx) => {
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
                const percent = Math.min(100, (devicesCount / maxDevices) * 100);
                const warning = percent >= 90 ? '⚠️' : '';
                status = '✅ Активен ' + warning + ' (' + timeLeft.text + ')'; 
                badgeClass = 'active'; 
            }
            
            const expireFormatted = formatDate(u.data.expireDate);
            const createdFormatted = u.data.createdAt ? formatDate(u.data.createdAt) : '—';
            
            let devicesHtml = '<div style="font-size:11px">';
            devicesHtml += '📱 ' + devicesCount + '/' + maxDevices;
            devicesHtml += ' <span class="stats">📊 ' + totalConns + ' всего</span>';
            
            if (u.data.devices && u.data.devices.length > 0) {
                devicesHtml += ' <span class="expand-btn" onclick="toggleDevices(\'' + u.token.replace(/'/g, "\\'") + '\')">▼ показать</span>';
                devicesHtml += '<div id="devices-' + u.token.replace(/'/g, "\\'") + '" class="devices-detail">';
                u.data.devices.forEach(dev => {
                    devicesHtml += '<div class="device-item">';
                    devicesHtml += '<div class="device-id">🖥️ ' + dev.id.substring(0, 12) + '...</div>';
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
            
            return '<tr>' +
                '<td><span class="token">' + escapeHtml(u.token) + '</span><br><span style="font-size:10px;color:#999">Создан: ' + createdFormatted + '</span></td>' +
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
                    if (res.success) loadUsers(); else alert(res.error);
                } else if (action === 'delete') {
                    if (!confirm('Удалить ' + token + '? Данные будут потеряны навсегда!')) return;
                    const res = await api('/admin/delete', 'POST', {token});
                    if (res.success) loadUsers(); else alert(res.error);
                } else if (action === 'devices') {
                    if (!confirm('Сбросить все устройства для ' + token + '? Пользователь сможет подключиться заново.')) return;
                    const res = await api('/admin/reset-devices', 'POST', {token});
                    if (res.success) loadUsers(); else alert(res.error);
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
        sel.innerHTML = '<option value="">-- Выбери пользователя --</option>' + 
            usersData.map(u => '<option value="' + escapeHtml(u.token) + '">' + escapeHtml(u.token) + ' (' + escapeHtml(u.data.note || '—') + ') - ' + (u.data.devices?.length || 0) + '/' + (u.data.maxDevices || ${CONFIG.DEFAULT_MAX_DEVICES}) + ' устр.</option>').join('');
    }

    document.getElementById('tokenSelect').addEventListener('change', function() {
        const token = this.value;
        const link = token ? 
            'karing://restore-backup?url=' + location.origin + '/config?token=' + encodeURIComponent(token) + '&device=' + Date.now() :
            'karing://restore-backup?url=' + location.origin + '/config?token=ТОКЕН&device=ID_УСТРОЙСТВА';
        document.getElementById('generatedLink').textContent = link;
    });

    document.getElementById('copyLinkBtn').addEventListener('click', function() {
        navigator.clipboard.writeText(document.getElementById('generatedLink').textContent);
        alert('✅ Ссылка скопирована!');
    });

    document.getElementById('copyAllLinksBtn').addEventListener('click', function() {
        let links = '';
        usersData.forEach(u => {
            const link = location.origin + '/config?token=' + encodeURIComponent(u.token) + '&device=ID_УСТРОЙСТВА';
            links += u.data.note + ': ' + link + '\n';
        });
        navigator.clipboard.writeText(links);
        alert('✅ Скопировано ' + usersData.length + ' ссылок!');
    });

    document.getElementById('expirePreset').addEventListener('change', function() {
        const val = this.value;
        let date = new Date();
        const hours = parseInt(val);
        date.setHours(date.getHours() + hours);
        document.getElementById('newExpire').value = date.toISOString().slice(0,16);
    });

    document.getElementById('addUserBtn').addEventListener('click', async function() {
        const token = document.getElementById('newToken').value;
        const note = document.getElementById('newNote').value;
        const expire = document.getElementById('newExpire').value;
        const maxDevices = parseInt(document.getElementById('maxDevices').value);
        
        if (maxDevices < 1 || maxDevices > ${CONFIG.MAX_DEVICES_LIMIT}) {
            alert('Максимум устройств должен быть от 1 до ' + ${CONFIG.MAX_DEVICES_LIMIT});
            return;
        }
        
        const res = await api('/admin/add', 'POST', {
            token: token || undefined, 
            note, 
            expireDate: expire,
            maxDevices
        });
        if (res.success) { 
            alert('✅ Добавлен: ' + res.token); 
            document.getElementById('newToken').value = '';
            document.getElementById('newNote').value = '';
            loadUsers(); 
        } else alert(res.error);
    });

    document.getElementById('searchBox').addEventListener('input', () => renderTable());
    
    loadUsers();
    setInterval(() => loadUsers(), 30000);
</script>
</body>
</html>`;

// ==================== ОСНОВНОЙ СЕРВЕР ====================
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Админ-панель
  if (url.pathname === "/" || url.pathname === "/admin") {
    return new Response(ADMIN_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // API: список пользователей
  if (url.pathname === "/admin/users") {
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
  }

  // API: добавить пользователя
  if (url.pathname === "/admin/add" && req.method === "POST") {
    const body = await req.json();
    if (body.password !== CONFIG.ADMIN_PASSWORD) {
      return Response.json({ success: false, error: "Неверный пароль" }, { status: 401 });
    }
    const token = body.token || generateToken();
    const existing = await kv.get(["users", token]);
    if (existing.value) return Response.json({ success: false, error: "Токен существует" }, { status: 400 });
    
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
    return Response.json({ success: true, token });
  }

  // API: переключить active
  if (url.pathname === "/admin/toggle" && req.method === "POST") {
    const body = await req.json();
    if (body.password !== CONFIG.ADMIN_PASSWORD) return Response.json({ success: false, error: "Неверный пароль" }, { status: 401 });
    const users = await getUsers(true);
    const user = users.find(u => u.token === body.token);
    if (!user) return Response.json({ success: false, error: "Не найден" }, { status: 404 });
    user.data.active = body.active;
    await saveUser(body.token, user.data);
    return Response.json({ success: true });
  }

  // API: сбросить устройства
  if (url.pathname === "/admin/reset-devices" && req.method === "POST") {
    const body = await req.json();
    if (body.password !== CONFIG.ADMIN_PASSWORD) return Response.json({ success: false, error: "Неверный пароль" }, { status: 401 });
    const users = await getUsers(true);
    const user = users.find(u => u.token === body.token);
    if (!user) return Response.json({ success: false, error: "Не найден" }, { status: 404 });
    user.data.devices = [];
    await saveUser(body.token, user.data);
    return Response.json({ success: true });
  }

  // API: удалить пользователя
  if (url.pathname === "/admin/delete" && req.method === "POST") {
    const body = await req.json();
    if (body.password !== CONFIG.ADMIN_PASSWORD) return Response.json({ success: false, error: "Неверный пароль" }, { status: 401 });
    await deleteUser(body.token);
    return Response.json({ success: true });
  }

  // ==================== ЭНДПОИНТ ДЛЯ KARING ====================
  if (url.pathname !== "/config") {
    return new Response("Not Found", { status: 404 });
  }

  const token = url.searchParams.get("token");
  const deviceId = url.searchParams.get("device");
  
  if (!token) return new Response("Token required", { status: 401 });

  const users = await getUsers(true); // Принудительно обновляем для свежих данных
  const userEntry = users.find(u => u.token === token);
  if (!userEntry) return new Response("Invalid token", { status: 401 });
  
  const user = userEntry.data;

  // Проверка на блокировку
  if (!user.active) return new Response("Account blocked", { status: 403 });

  // Проверка срока действия
  const expireDate = new Date(user.expireDate);
  if (new Date() > expireDate) {
    return new Response("Subscription expired", { status: 403 });
  }

  // Управление устройствами
  const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  
  if (deviceId) {
    const existingDevice = user.devices.find(d => d.id === deviceId);
    
    if (!existingDevice) {
      if (user.devices.length >= user.maxDevices) {
        return new Response(`Maximum ${user.maxDevices} devices reached. Remove some devices first.`, { status: 403 });
      }
      
      // Добавляем новое устройство
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
      // Обновляем время последнего посещения
      existingDevice.lastSeen = new Date().toISOString();
      existingDevice.userAgent = userAgent.substring(0, 200);
      existingDevice.ip = clientIP;
      await saveUser(token, user);
    }
  }

  // Отдаём бэкап
  try {
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
    console.error("Backup error:", e);
    return new Response("Backup unavailable", { status: 502 });
  }
});
