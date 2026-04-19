// =============================================
// Karing Deno Deploy Auth Proxy v4.0
// С веб-панелью управления пользователями
// =============================================

const BACKUP_URL = "https://github.com/PremVPN/Moskow-univer/raw/refs/heads/main/Karing_1.2.16.1912_ios_2026-04-18-1749.backup.zip";

// ========== НАСТРОЙКИ ==========
const CONFIG = {
  maxDevicesPerToken: 2,
  tokenCooldownMinutes: 60,
  maxRequestsPerToken: 50,
  trafficLimitGB: 100,
  ADMIN_PASSWORD: "admin123",  // ← ПОМЕНЯЙ НА СВОЙ ПАРОЛЬ!
};

interface UserData {
  active: boolean;
  note: string;
  expireDate: string;
  trafficUsedGB: number;
  blockedIPs: string[];
  deviceIPs: Record<string, number>;
  createdAt: string;
}

const kv = await Deno.openKv();

// ========== HTML ПАНЕЛЬ УПРАВЛЕНИЯ ==========
function getAdminPanelHTML(users: Array<{ token: string; data: UserData }>): string {
  const usersHTML = users.map(({ token, data }) => {
    const expireDate = new Date(data.expireDate);
    const now = new Date();
    const daysLeft = Math.ceil((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const statusColor = data.active ? (daysLeft > 0 ? "green" : "orange") : "red";
    const statusText = data.active ? (daysLeft > 0 ? "✅ Активен" : "⚠️ Истёк") : "🚫 Заблокирован";
    
    const activeDevices = Object.values(data.deviceIPs).filter(
      ts => Date.now() - ts < CONFIG.tokenCooldownMinutes * 60 * 1000
    ).length;

    return `
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 12px; font-family: monospace;">${token}</td>
        <td style="padding: 12px; color: ${statusColor};">${statusText}</td>
        <td style="padding: 12px;">${data.note || "—"}</td>
        <td style="padding: 12px;">${data.expireDate} (${daysLeft} дн.)</td>
        <td style="padding: 12px;">${data.trafficUsedGB.toFixed(2)} / ${CONFIG.trafficLimitGB} GB</td>
        <td style="padding: 12px;">${activeDevices} / ${CONFIG.maxDevicesPerToken}</td>
        <td style="padding: 12px;">
          <button onclick="toggleUser('${token}', ${data.active})" style="margin-right: 5px; padding: 5px 10px; cursor: pointer; background: ${data.active ? '#ff9800' : '#4CAF50'}; color: white; border: none; border-radius: 4px;">
            ${data.active ? 'Заблокировать' : 'Разблокировать'}
          </button>
          <button onclick="deleteUser('${token}')" style="padding: 5px 10px; cursor: pointer; background: #f44336; color: white; border: none; border-radius: 4px;">
            Удалить
          </button>
        </td>
      </tr>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PremVPN — Панель управления</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1400px; margin: 0 auto; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        h1 { margin-top: 0; color: #333; display: flex; align-items: center; gap: 10px; }
        .logo { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { text-align: left; padding: 12px; background: #f8f9fa; font-weight: 600; color: #555; }
        .add-form { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
        .form-group { display: flex; flex-direction: column; gap: 5px; }
        .form-group label { font-size: 12px; color: #666; font-weight: 500; }
        .form-group input { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; min-width: 150px; }
        button { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
        .btn-primary { background: #4CAF50; color: white; }
        .btn-primary:hover { background: #45a049; }
        .btn-danger { background: #f44336; color: white; }
        .btn-danger:hover { background: #da190b; }
        .logout-btn { margin-left: auto; background: #6c757d; color: white; }
        .stats { display: flex; gap: 20px; margin-top: 20px; }
        .stat-card { background: #f8f9fa; padding: 15px 20px; border-radius: 8px; flex: 1; }
        .stat-value { font-size: 28px; font-weight: bold; color: #333; }
        .stat-label { color: #666; font-size: 14px; }
        .link-generator { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-top: 15px; }
        .link-output { font-family: monospace; background: white; padding: 10px; border-radius: 6px; word-break: break-all; border: 1px solid #ddd; }
    </style>
</head>
<body>
    <div class="container">
        <h1>
            🚀 PremVPN — Панель управления
            <span class="logo">Deno KV</span>
            <button onclick="logout()" class="logout-btn">🚪 Выйти</button>
        </h1>
        
        <div class="add-form">
            <div class="form-group">
                <label>Токен (оставь пустым для автогенерации)</label>
                <input type="text" id="newToken" placeholder="user123" style="font-family: monospace;">
            </div>
            <div class="form-group">
                <label>Заметка</label>
                <input type="text" id="newNote" placeholder="Клиент">
            </div>
            <div class="form-group">
                <label>Срок действия</label>
                <input type="date" id="newExpire" value="${new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]}">
            </div>
            <button onclick="addUser()" class="btn-primary">➕ Добавить пользователя</button>
        </div>
        
        <div class="link-generator">
            <strong>🔗 Конструктор ссылок:</strong><br>
            <select id="linkTokenSelect" onchange="updateLink()" style="margin: 10px 0; padding: 8px; width: 100%; border-radius: 6px; border: 1px solid #ddd;">
                <option value="">Выбери пользователя...</option>
                ${users.map(({ token, data }) => `<option value="${token}">${token} — ${data.note || 'Без заметки'}</option>`).join("")}
            </select>
            <div class="link-output" id="generatedLink">karing://restore-backup?url=https://ТВОЙ_ПРОЕКТ.deno.dev/config?token=ТОКЕН</div>
            <button onclick="copyLink()" style="margin-top: 10px; background: #2196F3; color: white;">📋 Копировать ссылку</button>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Токен</th>
                    <th>Статус</th>
                    <th>Заметка</th>
                    <th>Срок действия</th>
                    <th>Трафик</th>
                    <th>Устройства</th>
                    <th>Действия</th>
                </tr>
            </thead>
            <tbody>
                ${usersHTML}
            </tbody>
        </table>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">${users.length}</div>
                <div class="stat-label">Всего пользователей</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${users.filter(u => u.data.active).length}</div>
                <div class="stat-label">Активных</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${users.filter(u => u.data.active && new Date(u.data.expireDate) > new Date()).length}</div>
                <div class="stat-label">Оплаченных</div>
            </div>
        </div>
    </div>
    
    <script>
        const PROJECT_URL = window.location.origin;
        
        async function apiCall(endpoint, method = 'GET', body = null) {
            const headers = { 'Content-Type': 'application/json' };
            const options = { method, headers };
            if (body) options.body = JSON.stringify(body);
            
            const response = await fetch(endpoint, options);
            return response.json();
        }
        
        async function addUser() {
            const token = document.getElementById('newToken').value || generateToken();
            const note = document.getElementById('newNote').value;
            const expireDate = document.getElementById('newExpire').value;
            const password = prompt('Введите пароль администратора:');
            
            const result = await apiCall('/admin/add', 'POST', { password, token, note, expireDate });
            if (result.success) {
                alert('✅ Пользователь добавлен!');
                location.reload();
            } else {
                alert('❌ Ошибка: ' + result.error);
            }
        }
        
        async function toggleUser(token, currentActive) {
            const password = prompt('Введите пароль администратора:');
            const result = await apiCall('/admin/toggle', 'POST', { password, token, active: !currentActive });
            if (result.success) {
                location.reload();
            } else {
                alert('❌ Ошибка: ' + result.error);
            }
        }
        
        async function deleteUser(token) {
            if (!confirm('Точно удалить пользователя ' + token + '?')) return;
            const password = prompt('Введите пароль администратора:');
            const result = await apiCall('/admin/delete', 'POST', { password, token });
            if (result.success) {
                location.reload();
            } else {
                alert('❌ Ошибка: ' + result.error);
            }
        }
        
        function generateToken() {
            return 'user_' + Math.random().toString(36).substring(2, 10);
        }
        
        function updateLink() {
            const select = document.getElementById('linkTokenSelect');
            const token = select.value;
            const linkDiv = document.getElementById('generatedLink');
            if (token) {
                linkDiv.textContent = 'karing://restore-backup?url=' + PROJECT_URL + '/config?token=' + token;
            } else {
                linkDiv.textContent = 'karing://restore-backup?url=' + PROJECT_URL + '/config?token=ТОКЕН';
            }
        }
        
        function copyLink() {
            const text = document.getElementById('generatedLink').textContent;
            navigator.clipboard.writeText(text);
            alert('✅ Ссылка скопирована!');
        }
        
        function logout() {
            localStorage.removeItem('admin_auth');
            location.reload();
        }
        
        // Обновляем ссылку при загрузке
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('generatedLink').textContent = 
                'karing://restore-backup?url=' + PROJECT_URL + '/config?token=ТОКЕН';
        });
    </script>
</body>
</html>`;
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function generateToken(): string {
  return 'user_' + Math.random().toString(36).substring(2, 10);
}

async function getAllUsers(): Promise<Array<{ token: string; data: UserData }>> {
  const users: Array<{ token: string; data: UserData }> = [];
  const iter = kv.list<UserData>({ prefix: ["users"] });
  for await (const entry of iter) {
    const token = entry.key[1] as string;
    users.push({ token, data: entry.value });
  }
  return users.sort((a, b) => a.token.localeCompare(b.token));
}

// ========== ОСНОВНОЙ СЕРВЕР ==========
Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                   req.headers.get("cf-connecting-ip") || 
                   "unknown";

  // ========== АДМИН-ПАНЕЛЬ ==========
  if (url.pathname === "/admin" || url.pathname === "/") {
    const users = await getAllUsers();
    const html = getAdminPanelHTML(users);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // ========== API ДЛЯ АДМИН-ПАНЕЛИ ==========
  if (url.pathname === "/admin/add" && req.method === "POST") {
    try {
      const body = await req.json();
      if (body.password !== CONFIG.ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ success: false, error: "Неверный пароль" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }

      const token = body.token || generateToken();
      const existing = await kv.get(["users", token]);
      if (existing.value) {
        return new Response(JSON.stringify({ success: false, error: "Токен уже существует" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const user: UserData = {
        active: true,
        note: body.note || "",
        expireDate: body.expireDate || new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
        trafficUsedGB: 0,
        blockedIPs: [],
        deviceIPs: {},
        createdAt: new Date().toISOString(),
      };

      await kv.set(["users", token], user);
      console.log(`✅ Админ добавил пользователя: ${token}`);

      return new Response(JSON.stringify({ success: true, token }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: String(e) }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  if (url.pathname === "/admin/toggle" && req.method === "POST") {
    try {
      const body = await req.json();
      if (body.password !== CONFIG.ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ success: false, error: "Неверный пароль" }), { status: 401 });
      }

      const userRes = await kv.get<UserData>(["users", body.token]);
      if (!userRes.value) {
        return new Response(JSON.stringify({ success: false, error: "Пользователь не найден" }), { status: 404 });
      }

      const user = userRes.value;
      user.active = body.active;
      await kv.set(["users", body.token], user);

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500 });
    }
  }

  if (url.pathname === "/admin/delete" && req.method === "POST") {
    try {
      const body = await req.json();
      if (body.password !== CONFIG.ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ success: false, error: "Неверный пароль" }), { status: 401 });
      }

      await kv.delete(["users", body.token]);
      console.log(`🗑️ Админ удалил пользователя: ${body.token}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500 });
    }
  }

  // ========== ЭНДПОИНТ ДЛЯ KARING ==========
  if (url.pathname !== "/config") {
    return new Response("404 Not Found", { status: 404 });
  }

  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("❌ Token required", { status: 401 });
  }

  const userRes = await kv.get<UserData>(["users", token]);
  if (!userRes.value) {
    return new Response("❌ Invalid token", { status: 401 });
  }

  const user = userRes.value;

  if (!user.active) {
    return new Response("❌ Account blocked", { status: 403 });
  }

  const expireDate = new Date(user.expireDate);
  if (new Date() > expireDate) {
    return new Response("❌ Subscription expired", { 
      status: 403,
      headers: {
        "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${Math.floor(expireDate.getTime() / 1000)}`,
        "isp-name": "PremVPN",
        "isp-url": "https://t.me/PremVPN_bot",
      }
    });
  }

  if (user.blockedIPs.includes(clientIP)) {
    return new Response("❌ IP blocked", { status: 403 });
  }

  const now = Date.now();
  const cooldownMs = CONFIG.tokenCooldownMinutes * 60 * 1000;
  const cleanDeviceIPs: Record<string, number> = {};
  let activeDevices = 0;

  for (const [ip, timestamp] of Object.entries(user.deviceIPs)) {
    if (now - timestamp < cooldownMs) {
      cleanDeviceIPs[ip] = timestamp;
      activeDevices++;
    }
  }

  const isNewDevice = !cleanDeviceIPs[clientIP];
  if (isNewDevice && activeDevices >= CONFIG.maxDevicesPerToken) {
    return new Response("❌ Device limit reached", { 
      status: 403,
      headers: {
        "isp-name": "PremVPN",
        "isp-url": "https://t.me/PremVPN_bot",
      }
    });
  }

  cleanDeviceIPs[clientIP] = now;
  const newTrafficUsed = user.trafficUsedGB + (1 / 1024);

  if (newTrafficUsed >= CONFIG.trafficLimitGB) {
    return new Response("❌ Traffic limit exceeded", { 
      status: 403,
      headers: {
        "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${Math.floor(expireDate.getTime() / 1000)}`,
        "isp-name": "PremVPN",
        "isp-url": "https://t.me/PremVPN_bot",
      }
    });
  }

  const updatedUser: UserData = {
    ...user,
    deviceIPs: cleanDeviceIPs,
    trafficUsedGB: newTrafficUsed,
  };
  await kv.set(["users", token], updatedUser);

  console.log(`✅ ${token} | IP: ${clientIP} | Devices: ${activeDevices}/${CONFIG.maxDevicesPerToken} | Traffic: ${newTrafficUsed.toFixed(2)}GB`);

  const response = await fetch(BACKUP_URL);
  if (!response.ok) {
    return new Response("❌ Backup error", { status: 502 });
  }

  const trafficTotal = CONFIG.trafficLimitGB * 1024 * 1024 * 1024;
  const trafficUsed = newTrafficUsed * 1024 * 1024 * 1024;
  const expireTimestamp = Math.floor(expireDate.getTime() / 1000);

  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="Karing_backup.zip"',
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Subscription-Userinfo": `upload=0; download=${trafficUsed}; total=${trafficTotal}; expire=${expireTimestamp}`,
      "isp-name": "PremVPN",
      "isp-url": "https://t.me/PremVPN_bot",
    },
  });
});
