// ==================================================================
// 🔥 PREMVPN — СБАЛАНСИРОВАННЫЙ КОД (УДОБСТВО + ЭКОНОМИЯ)
// ==================================================================
// - Веб-панель управления (лёгкая)
// - KV только для хранения user-объектов (без записи статистики)
// - Нет демо-пользователя
// - Минимальное потребление ресурсов Deno Deploy
// ==================================================================

const BACKUP_URL = "https://raw.githubusercontent.com/PremVPN/PremVPN/refs/heads/main/Karing_1.2.16.backup.zip";

const CONFIG = {
  BRAND_NAME: "PremVPN",
  PAYMENT_URL: "https://t.me/PremVPN_bot",
  ADMIN_PASSWORD: "admin123", // ⚠️ СМЕНИ ПАРОЛЬ!
};

// Тип пользователя (только необходимые поля)
interface UserData {
  active: boolean;
  note: string;
  expireDate: string; // YYYY-MM-DD
}

// KV хранилище (только для основных данных, без статистики)
const kv = await Deno.openKv();

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

// ==================== ЛЁГКАЯ АДМИН-ПАНЕЛЬ (СТАТИЧЕСКИЙ ШАБЛОН) ====================
const ADMIN_HTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CONFIG.BRAND_NAME} Admin</title>
    <style>
        body { font-family: system-ui, sans-serif; margin: 20px; background: #f0f2f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
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
        .badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 12px; }
        .badge.active { background: #d4edda; color: #155724; }
        .badge.blocked { background: #f8d7da; color: #721c24; }
        .badge.expired { background: #fff3cd; color: #856404; }
    </style>
</head>
<body>
<div class="container">
    <h1>🚀 ${CONFIG.BRAND_NAME} — Панель управления</h1>
    <p style="color:#666;margin-top:-10px">Экономичный режим: без записи статистики, только управление доступом</p>
    
    <div class="add-form">
        <input type="text" id="newToken" placeholder="Токен (авто)" style="width:150px">
        <input type="text" id="newNote" placeholder="Заметка">
        <input type="date" id="newExpire" value="${new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]}">
        <select id="expirePreset">
            <option value="30">30 дней</option>
            <option value="7">7 дней</option>
            <option value="90">90 дней</option>
        </select>
        <button id="addUserBtn">➕ Добавить</button>
    </div>

    <div class="link-box">
        <strong>🔗 Ссылка для Karing:</strong>
        <select id="tokenSelect" style="margin-left:10px; width:200px">
            <option value="">-- Выбери пользователя --</option>
        </select>
        <div style="margin-top:10px">
            <code id="generatedLink" style="word-break:break-all">karing://restore-backup?url=\${location.origin}/config?token=ТОКЕН</code>
        </div>
        <button id="copyLinkBtn">📋 Копировать</button>
    </div>

    <table>
        <thead>
            <tr><th>Токен</th><th>Статус</th><th>Заметка</th><th>Срок</th><th>Действия</th></tr>
        </thead>
        <tbody id="users-body">
            <tr><td colspan="5" style="text-align:center">Загрузка...</td></tr>
        </tbody>
    </table>
    <div style="margin-top:10px; font-size:12px; color:#666;">
        ⚡ Статистика не записывается — лимиты Deno в безопасности.
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
        usersData = data;
        renderTable();
        updateTokenSelect();
    }

    function renderTable() {
        const tbody = document.getElementById('users-body');
        if (!usersData.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Нет пользователей. Добавьте первого!</td></tr>';
            return;
        }
        tbody.innerHTML = usersData.map(u => {
            const exp = new Date(u.data.expireDate);
            const now = new Date();
            const daysLeft = Math.ceil((exp - now)/(86400000));
            let status = '', badgeClass = '';
            if (!u.data.active) { status = '🚫 Заблокирован'; badgeClass = 'blocked'; }
            else if (daysLeft < 0) { status = '⚠️ Истёк'; badgeClass = 'expired'; }
            else { status = '✅ Активен (' + daysLeft + ' дн.)'; badgeClass = 'active'; }
            
            return '<tr>' +
                '<td><span class="token">' + escapeHtml(u.token) + '</span></td>' +
                '<td><span class="badge ' + badgeClass + '">' + status + '</span></td>' +
                '<td>' + escapeHtml(u.data.note || '—') + '</td>' +
                '<td>' + u.data.expireDate + '</td>' +
                '<td>' +
                    '<button data-action="toggle" data-token="' + escapeHtml(u.token) + '" data-active="' + u.data.active + '">' + (u.data.active ? 'Заблокировать' : 'Разблокировать') + '</button> ' +
                    '<button data-action="delete" data-token="' + escapeHtml(u.token) + '" class="danger">Удалить</button>' +
                '</td>' +
            '</tr>';
        }).join('');
        
        document.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = btn.dataset.action;
                const token = btn.dataset.token;
                if (action === 'toggle') {
                    const currentActive = btn.dataset.active === 'true';
                    if (!confirm('Точно?')) return;
                    const res = await api('/admin/toggle', 'POST', {token, active: !currentActive});
                    if (res.success) loadUsers(); else alert(res.error);
                } else if (action === 'delete') {
                    if (!confirm('Удалить ' + token + '?')) return;
                    const res = await api('/admin/delete', 'POST', {token});
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
        sel.innerHTML = '<option value="">-- Выбери --</option>' + 
            usersData.map(u => '<option value="' + escapeHtml(u.token) + '">' + escapeHtml(u.token) + ' (' + escapeHtml(u.data.note || '—') + ')</option>').join('');
    }

    document.getElementById('tokenSelect').addEventListener('change', function() {
        const token = this.value;
        document.getElementById('generatedLink').textContent = token ? 
            'karing://restore-backup?url=' + location.origin + '/config?token=' + token :
            'karing://restore-backup?url=' + location.origin + '/config?token=ТОКЕН';
    });

    document.getElementById('copyLinkBtn').addEventListener('click', function() {
        navigator.clipboard.writeText(document.getElementById('generatedLink').textContent);
        alert('Скопировано!');
    });

    document.getElementById('addUserBtn').addEventListener('click', async function() {
        const token = document.getElementById('newToken').value;
        const note = document.getElementById('newNote').value;
        const expire = document.getElementById('newExpire').value;
        const res = await api('/admin/add', 'POST', {token: token || undefined, note, expireDate: expire});
        if (res.success) { alert('Добавлен: '+res.token); loadUsers(); }
        else alert(res.error);
    });

    document.getElementById('expirePreset').addEventListener('change', function() {
        const days = parseInt(this.value);
        const date = new Date(Date.now() + days*24*60*60*1000);
        document.getElementById('newExpire').value = date.toISOString().split('T')[0];
    });

    loadUsers();
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
    const users = await getAllUsers();
    const safeUsers = users.map(u => ({
      token: u.token,
      data: {
        active: u.data.active,
        note: u.data.note,
        expireDate: u.data.expireDate,
      }
    }));
    return Response.json(safeUsers);
  }

  // API: добавить
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
    };
    await kv.set(["users", token], user);
    return Response.json({ success: true, token });
  }

  // API: переключить active
  if (url.pathname === "/admin/toggle" && req.method === "POST") {
    const body = await req.json();
    if (body.password !== CONFIG.ADMIN_PASSWORD) return Response.json({ success: false, error: "Неверный пароль" }, { status: 401 });
    const userRes = await kv.get<UserData>(["users", body.token]);
    if (!userRes.value) return Response.json({ success: false, error: "Не найден" }, { status: 404 });
    userRes.value.active = body.active;
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

  if (!user.active) return new Response("Account blocked", { status: 403 });

  const expireDate = new Date(user.expireDate);
  if (new Date() > expireDate) {
    return new Response("Subscription expired", {
      status: 403,
      headers: {
        "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${Math.floor(expireDate.getTime() / 1000)}`,
        "isp-name": CONFIG.BRAND_NAME,
        "isp-url": CONFIG.PAYMENT_URL,
      },
    });
  }

  // Проксируем файл (без какой-либо записи в KV)
  try {
    const backupResp = await fetch(BACKUP_URL);
    if (!backupResp.ok) throw new Error("Backup fetch failed");
    return new Response(backupResp.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="PremVPN.backup.zip"',
        "Cache-Control": "public, max-age=3600",
        "isp-name": CONFIG.BRAND_NAME,
        "isp-url": CONFIG.PAYMENT_URL,
      },
    });
  } catch (e) {
    return new Response("Backup unavailable", { status: 502 });
  }
});
