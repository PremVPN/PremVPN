// ==================================================================
// 🔥 PREMVPN — ОПТИМИЗИРОВАННЫЙ КОД (ЭКОНОМИЯ ЛИМИТОВ DENO)
// ==================================================================

const BACKUP_URL = "https://raw.githubusercontent.com/PremVPN/PremVPN/refs/heads/main/Karing_1.2.16.backup.zip";

const CONFIG = {
  maxDevicesPerToken: 2,
  tokenCooldownMinutes: 60,
  trafficLimitGB: 100,
  ADMIN_PASSWORD: "admin123", // ПОМЕНЯЙ!
  maxRequestsPerToken: 100,
  BRAND_NAME: "PremVPN",
  PAYMENT_URL: "https://t.me/PremVPN_bot",
  // Интервал записи статистики в KV (минут)
  STATS_WRITE_INTERVAL_MIN: 10,
};

interface UserData {
  active: boolean;
  note: string;
  expireDate: string;
  trafficUsedGB: number;
  blockedIPs: string[];
  deviceIPs: Record<string, number>;
  createdAt: string;
  totalRequests: number;
  lastAccess: string;
  lastKVWrite: string; // время последней записи в KV
}

const kv = await Deno.openKv();

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
async function initFirstUser() {
  const existing = await kv.get<UserData>(["users", "demo"]);
  if (!existing.value) {
    const demoUser: UserData = {
      active: true,
      note: "Демо",
      expireDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      trafficUsedGB: 0,
      blockedIPs: [],
      deviceIPs: {},
      createdAt: new Date().toISOString(),
      totalRequests: 0,
      lastAccess: new Date().toISOString(),
      lastKVWrite: new Date().toISOString(),
    };
    await kv.set(["users", "demo"], demoUser);
    console.log("✅ Демо-пользователь создан");
  }
}
await initFirstUser();

// ==================== УТИЛИТЫ ====================
function generateToken(): string {
  return "user_" + Math.random().toString(36).substring(2, 10);
}

async function getAllUsers(): Promise<Array<{ token: string; data: UserData }>> {
  const users: Array<{ token: string; data: UserData }> = [];
  const iter = kv.list<UserData>({ prefix: ["users"] });
  for await (const entry of iter) {
    users.push({ token: entry.key[1] as string, data: entry.value });
  }
  return users.sort((a, b) => a.token.localeCompare(b.token));
}

// ==================== ЛЁГКАЯ HTML-ПАНЕЛЬ (СТАТИЧЕСКИЙ ШАБЛОН) ====================
const ADMIN_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CONFIG.BRAND_NAME} Admin</title>
    <style>
        body { font-family: system-ui, sans-serif; margin: 20px; background: #f0f2f5; }
        .container { max-width: 1400px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; }
        .add-form { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
        input, select, button { padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; }
        button { background: #007bff; color: white; border: none; cursor: pointer; }
        button.danger { background: #dc3545; }
        button.success { background: #28a745; }
        .token { font-family: monospace; background: #eee; padding: 2px 6px; border-radius: 4px; }
        .link-box { background: #e9ecef; padding: 10px; border-radius: 4px; margin: 15px 0; }
        #users-table { width: 100%; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 12px; }
        .badge.active { background: #d4edda; color: #155724; }
        .badge.blocked { background: #f8d7da; color: #721c24; }
        .badge.expired { background: #fff3cd; color: #856404; }
    </style>
</head>
<body>
<div class="container">
    <h1>🚀 ${CONFIG.BRAND_NAME} — Панель управления</h1>
    
    <div class="add-form">
        <input type="text" id="newToken" placeholder="Токен (авто)" style="width:150px">
        <input type="text" id="newNote" placeholder="Заметка">
        <input type="date" id="newExpire" value="${new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]}">
        <select id="expirePreset" onchange="document.getElementById('newExpire').value=this.value">
            <option value="${new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]}">30 дней</option>
            <option value="${new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0]}">7 дней</option>
            <option value="${new Date(Date.now() + 90*24*60*60*1000).toISOString().split('T')[0]}">90 дней</option>
        </select>
        <button onclick="addUser()">➕ Добавить</button>
    </div>

    <div class="link-box">
        <strong>🔗 Ссылка для Karing:</strong>
        <select id="tokenSelect" onchange="updateLink()" style="margin-left:10px; width:200px">
            <option value="">-- Выбери пользователя --</option>
        </select>
        <div style="margin-top:10px">
            <code id="generatedLink" style="word-break:break-all">karing://restore-backup?url=${location.origin}/config?token=ТОКЕН</code>
        </div>
        <button onclick="copyLink()">📋 Копировать</button>
    </div>

    <table id="users-table">
        <thead>
            <tr><th>Токен</th><th>Статус</th><th>Заметка</th><th>Срок</th><th>Трафик (ГБ)</th><th>Устр.</th><th>Действия</th></tr>
        </thead>
        <tbody id="users-body">
            <tr><td colspan="7" style="text-align:center">Загрузка...</td></tr>
        </tbody>
    </table>
    <div style="margin-top:10px">
        <small>⚙️ Лимиты: ${CONFIG.maxDevicesPerToken} устр., ${CONFIG.trafficLimitGB} ГБ</small>
    </div>
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
        usersData = data.users;
        renderTable();
        updateTokenSelect();
    }

    function renderTable() {
        const tbody = document.getElementById('users-body');
        if (!usersData.length) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center">Нет пользователей</td></tr>';
            return;
        }
        tbody.innerHTML = usersData.map(u => {
            const exp = new Date(u.data.expireDate);
            const now = new Date();
            const daysLeft = Math.ceil((exp - now)/(86400000));
            let status = '', badgeClass = '';
            if (!u.data.active) { status = '🚫 Заблокирован'; badgeClass = 'blocked'; }
            else if (daysLeft < 0) { status = '⚠️ Истёк'; badgeClass = 'expired'; }
            else { status = '✅ Активен'; badgeClass = 'active'; }
            
            const activeDevices = Object.values(u.data.deviceIPs || {}).filter(ts => Date.now() - ts < ${CONFIG.tokenCooldownMinutes * 60 * 1000}).length;
            
            return `<tr>
                <td><span class="token">${u.token}</span></td>
                <td><span class="badge ${badgeClass}">${status} (${daysLeft} дн.)</span></td>
                <td>${u.data.note || '—'}</td>
                <td>${u.data.expireDate}</td>
                <td>${u.data.trafficUsedGB.toFixed(2)} / ${CONFIG.trafficLimitGB}</td>
                <td>${activeDevices} / ${CONFIG.maxDevicesPerToken}</td>
                <td>
                    <button onclick="toggleUser('${u.token}', ${u.data.active})">${u.data.active ? 'Заблокировать' : 'Разблокировать'}</button>
                    <button onclick="resetTraffic('${u.token}')" class="success">Сброс</button>
                    <button onclick="deleteUser('${u.token}')" class="danger">Удалить</button>
                </td>
            </tr>`;
        }).join('');
    }

    function updateTokenSelect() {
        const sel = document.getElementById('tokenSelect');
        sel.innerHTML = '<option value="">-- Выбери --</option>' + 
            usersData.map(u => `<option value="${u.token}">${u.token} (${u.data.note || '—'})</option>`).join('');
    }

    function updateLink() {
        const token = document.getElementById('tokenSelect').value;
        const linkEl = document.getElementById('generatedLink');
        linkEl.textContent = token ? `karing://restore-backup?url=${location.origin}/config?token=${token}` : `karing://restore-backup?url=${location.origin}/config?token=ТОКЕН`;
    }

    function copyLink() {
        navigator.clipboard.writeText(document.getElementById('generatedLink').textContent);
        alert('Скопировано!');
    }

    async function addUser() {
        const token = document.getElementById('newToken').value;
        const note = document.getElementById('newNote').value;
        const expire = document.getElementById('newExpire').value;
        const res = await api('/admin/add', 'POST', {token: token || undefined, note, expireDate: expire});
        if (res.success) { alert('Добавлен: '+res.token); loadUsers(); }
        else alert(res.error);
    }

    async function toggleUser(token, currentActive) {
        if (!confirm('Точно?')) return;
        const res = await api('/admin/toggle', 'POST', {token, active: !currentActive});
        if (res.success) loadUsers(); else alert(res.error);
    }

    async function resetTraffic(token) {
        const res = await api('/admin/reset-traffic', 'POST', {token});
        if (res.success) loadUsers(); else alert(res.error);
    }

    async function deleteUser(token) {
        if (!confirm('Удалить '+token+'?')) return;
        const res = await api('/admin/delete', 'POST', {token});
        if (res.success) loadUsers(); else alert(res.error);
    }

    loadUsers();
</script>
</body>
</html>`;

// ==================== ОСНОВНОЙ СЕРВЕР ====================
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

  // Админ-панель (статический HTML)
  if (url.pathname === "/" || url.pathname === "/admin") {
    return new Response(ADMIN_HTML_TEMPLATE, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // API: получить всех пользователей (для админки)
  if (url.pathname === "/admin/users") {
    const users = await getAllUsers();
    // Не возвращаем лишние поля для экономии трафика
    const safeUsers = users.map(u => ({
      token: u.token,
      data: {
        active: u.data.active,
        note: u.data.note,
        expireDate: u.data.expireDate,
        trafficUsedGB: u.data.trafficUsedGB,
        deviceIPs: u.data.deviceIPs,
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
      expireDate: body.expireDate || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
      trafficUsedGB: 0,
      blockedIPs: [],
      deviceIPs: {},
      createdAt: new Date().toISOString(),
      totalRequests: 0,
      lastAccess: new Date().toISOString(),
      lastKVWrite: new Date().toISOString(),
    };
    await kv.set(["users", token], user);
    return Response.json({ success: true, token });
  }

  // API: toggle active
  if (url.pathname === "/admin/toggle" && req.method === "POST") {
    const body = await req.json();
    if (body.password !== CONFIG.ADMIN_PASSWORD) return Response.json({ success: false, error: "Неверный пароль" }, { status: 401 });
    const userRes = await kv.get<UserData>(["users", body.token]);
    if (!userRes.value) return Response.json({ success: false, error: "Не найден" }, { status: 404 });
    userRes.value.active = body.active;
    await kv.set(["users", body.token], userRes.value);
    return Response.json({ success: true });
  }

  // API: сброс трафика
  if (url.pathname === "/admin/reset-traffic" && req.method === "POST") {
    const body = await req.json();
    if (body.password !== CONFIG.ADMIN_PASSWORD) return Response.json({ success: false, error: "Неверный пароль" }, { status: 401 });
    const userRes = await kv.get<UserData>(["users", body.token]);
    if (!userRes.value) return Response.json({ success: false, error: "Не найден" }, { status: 404 });
    userRes.value.trafficUsedGB = 0;
    await kv.set(["users", body.token], userRes.value);
    return Response.json({ success: true });
  }

  // API: удалить
  if (url.pathname === "/admin/delete" && req.method === "POST") {
    const body = await req.json();
    if (body.password !== CONFIG.ADMIN_PASSWORD) return Response.json({ success: false, error: "Неверный пароль" }, { status: 401 });
    await kv.delete(["users", body.token]);
    return Response.json({ success: true });
  }

  // ==================== ЭНДПОИНТ ДЛЯ KARING ====================
  if (url.pathname !== "/config") {
    return new Response("Not Found", { status: 404 });
  }

  const token = url.searchParams.get("token");
  if (!token) return new Response("Token required", { status: 401 });

  const userRes = await kv.get<UserData>(["users", token]);
  if (!userRes.value) return new Response("Invalid token", { status: 401 });
  const user = userRes.value;

  // Проверки
  if (!user.active) return new Response("Account blocked", { status: 403 });
  if (new Date(user.expireDate) < new Date()) {
    return new Response("Subscription expired", {
      status: 403,
      headers: {
        "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${Math.floor(new Date(user.expireDate).getTime() / 1000)}`,
        "isp-name": CONFIG.BRAND_NAME,
        "isp-url": CONFIG.PAYMENT_URL,
      }
    });
  }
  if (user.blockedIPs.includes(clientIP)) return new Response("IP blocked", { status: 403 });

  // Очистка старых IP и подсчёт устройств
  const now = Date.now();
  const cooldown = CONFIG.tokenCooldownMinutes * 60 * 1000;
  const cleanIPs: Record<string, number> = {};
  let activeDevices = 0;
  for (const [ip, ts] of Object.entries(user.deviceIPs)) {
    if (now - ts < cooldown) { cleanIPs[ip] = ts; activeDevices++; }
  }

  const isNewDevice = !cleanIPs[clientIP];
  if (isNewDevice && activeDevices >= CONFIG.maxDevicesPerToken) {
    return new Response("Device limit reached", {
      status: 403,
      headers: { "isp-name": CONFIG.BRAND_NAME, "isp-url": CONFIG.PAYMENT_URL }
    });
  }

  // Обновляем данные в памяти, но НЕ пишем в KV при каждом запросе
  cleanIPs[clientIP] = now;
  
  // Трафик: добавляем 5 МБ раз в 10 минут (или при первом запросе за интервал)
  const lastWrite = new Date(user.lastKVWrite).getTime();
  const writeIntervalMs = CONFIG.STATS_WRITE_INTERVAL_MIN * 60 * 1000;
  let needKVWrite = false;
  let newTraffic = user.trafficUsedGB;
  
  if (now - lastWrite > writeIntervalMs) {
    // Прошло больше интервала — начисляем трафик и запланируем запись
    newTraffic = Math.min(user.trafficUsedGB + 0.005, CONFIG.trafficLimitGB); // ~5 MB
    needKVWrite = true;
  }

  if (newTraffic >= CONFIG.trafficLimitGB) {
    return new Response("Traffic limit exceeded", {
      status: 403,
      headers: {
        "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${Math.floor(new Date(user.expireDate).getTime() / 1000)}`,
        "isp-name": CONFIG.BRAND_NAME,
        "isp-url": CONFIG.PAYMENT_URL,
      }
    });
  }

  // Проверка на превышение общего числа запросов (защита от скриптов)
  if (user.totalRequests > CONFIG.maxRequestsPerToken) {
    user.active = false;
    await kv.set(["users", token], user);
    return new Response("Too many requests", { status: 429 });
  }

  // Если нужно — пишем в KV
  if (needKVWrite || isNewDevice) {
    const updated: UserData = {
      ...user,
      deviceIPs: cleanIPs,
      trafficUsedGB: newTraffic,
      totalRequests: user.totalRequests + 1,
      lastAccess: new Date().toISOString(),
      lastKVWrite: new Date().toISOString(),
    };
    await kv.set(["users", token], updated);
    console.log(`💾 KV write: ${token} | трафик: ${newTraffic.toFixed(3)} GB | устр: ${activeDevices + (isNewDevice?1:0)}`);
  } else {
    // Лёгкое логирование без записи
    console.log(`✅ ${token} | IP: ${clientIP} | устр: ${activeDevices + (isNewDevice?1:0)} (no KV write)`);
  }

  // Проксирование бэкапа
  try {
    const backupResp = await fetch(BACKUP_URL);
    if (!backupResp.ok) throw new Error(`GitHub ${backupResp.status}`);
    
    const trafficTotal = CONFIG.trafficLimitGB * 1024 * 1024 * 1024;
    const trafficUsed = (needKVWrite ? newTraffic : user.trafficUsedGB) * 1024 * 1024 * 1024;
    const expireTimestamp = Math.floor(new Date(user.expireDate).getTime() / 1000);

    return new Response(backupResp.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="PremVPN.backup.zip"',
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Subscription-Userinfo": `upload=0; download=${trafficUsed}; total=${trafficTotal}; expire=${expireTimestamp}`,
        "isp-name": CONFIG.BRAND_NAME,
        "isp-url": CONFIG.PAYMENT_URL,
      }
    });
  } catch (e) {
    return new Response(`Backup error: ${e}`, { status: 502 });
  }
});
