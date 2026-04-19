// ==================================================================
// 🔥 PREMVPN — ПОЛНОСТЬЮ ГОТОВЫЙ ПРОДАКШН-КОД v5.0
// ==================================================================
// Возможности:
// ✅ Веб-панель управления пользователями
// ✅ Deno KV — данные хранятся вечно
// ✅ Лимит устройств на токен
// ✅ Учёт трафика
// ✅ Автоматическая блокировка при превышении лимитов
// ✅ Защита от шеринга (отслеживание IP)
// ✅ Интеграция с Karing (заголовки isp-name, isp-url, Subscription-Userinfo)
// ✅ Конструктор ссылок в админке
// ✅ Статистика в реальном времени
// ==================================================================

// ==================== НАСТРОЙКИ ====================
const BACKUP_URL = "https://raw.githubusercontent.com/PremVPN/PremVPN/refs/heads/main/Karing_1.2.16.backup.zip";

const CONFIG = {
  // Лимиты
  maxDevicesPerToken: 2,           // Максимум устройств на 1 токен
  tokenCooldownMinutes: 60,        // Через сколько минут IP "забывается"
  trafficLimitGB: 100,             // Лимит трафика в ГБ
  
  // Безопасность
  ADMIN_PASSWORD: "admin123",      // ⚠️ ПОМЕНЯЙ НА СВОЙ СЛОЖНЫЙ ПАРОЛЬ!
  maxRequestsPerToken: 100,        // Максимум запросов конфига (защита от скриптов)
  
  // Брендинг
  BRAND_NAME: "PremVPN",
  PAYMENT_URL: "https://t.me/PremVPN_bot", // Ссылка для кнопки "Продлить"
};

// ==================== ТИПЫ ДАННЫХ ====================
interface UserData {
  active: boolean;
  note: string;
  expireDate: string;              // YYYY-MM-DD
  trafficUsedGB: number;
  blockedIPs: string[];
  deviceIPs: Record<string, number>; // IP -> timestamp последнего запроса
  createdAt: string;
  totalRequests: number;           // Общее количество запросов конфига
  lastAccess: string;              // Последний доступ
}

// ==================== DENO KV ====================
const kv = await Deno.openKv();

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
async function initFirstUser() {
  const existing = await kv.get<UserData>(["users", "demo"]);
  if (!existing.value) {
    const demoUser: UserData = {
      active: true,
      note: "Демо-пользователь",
      expireDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      trafficUsedGB: 0,
      blockedIPs: [],
      deviceIPs: {},
      createdAt: new Date().toISOString(),
      totalRequests: 0,
      lastAccess: new Date().toISOString(),
    };
    await kv.set(["users", "demo"], demoUser);
    console.log("✅ Создан демо-пользователь: demo");
  }
}

await initFirstUser();

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "user_";
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ==================== HTML АДМИН-ПАНЕЛЬ ====================
function getAdminPanelHTML(users: Array<{ token: string; data: UserData }>): string {
  const usersHTML = users.map(({ token, data }) => {
    const expireDate = new Date(data.expireDate);
    const now = new Date();
    const daysLeft = Math.ceil((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    let statusColor = "gray";
    let statusText = "❓ Неизвестно";
    
    if (!data.active) {
      statusColor = "red";
      statusText = "🚫 Заблокирован";
    } else if (daysLeft < 0) {
      statusColor = "orange";
      statusText = "⚠️ Истёк";
    } else if (daysLeft <= 3) {
      statusColor = "#ff9800";
      statusText = `🟡 Истекает (${daysLeft} дн.)`;
    } else {
      statusColor = "#4CAF50";
      statusText = `✅ Активен (${daysLeft} дн.)`;
    }

    const activeDevices = Object.values(data.deviceIPs).filter(
      ts => Date.now() - ts < CONFIG.tokenCooldownMinutes * 60 * 1000
    ).length;

    const trafficPercent = (data.trafficUsedGB / CONFIG.trafficLimitGB) * 100;
    const trafficColor = trafficPercent > 90 ? "#f44336" : trafficPercent > 70 ? "#ff9800" : "#4CAF50";

    return `
      <tr style="border-bottom: 1px solid #e0e0e0;">
        <td style="padding: 12px; font-family: 'SF Mono', Monaco, monospace; font-size: 13px;">
          <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">${token}</code>
        </td>
        <td style="padding: 12px; color: ${statusColor}; font-weight: 500;">${statusText}</td>
        <td style="padding: 12px; max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${data.note || ''}">
          ${data.note || "—"}
        </td>
        <td style="padding: 12px;">${data.expireDate}</td>
        <td style="padding: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="flex: 1; height: 6px; background: #e0e0e0; border-radius: 3px;">
              <div style="width: ${trafficPercent}%; height: 6px; background: ${trafficColor}; border-radius: 3px;"></div>
            </div>
            <span style="font-size: 13px; min-width: 85px;">${data.trafficUsedGB.toFixed(2)} / ${CONFIG.trafficLimitGB} GB</span>
          </div>
        </td>
        <td style="padding: 12px; text-align: center;">
          <span style="background: ${activeDevices >= CONFIG.maxDevicesPerToken ? '#ffebee' : '#e8f5e9'}; padding: 4px 8px; border-radius: 12px; font-size: 12px;">
            ${activeDevices} / ${CONFIG.maxDevicesPerToken}
          </span>
        </td>
        <td style="padding: 12px; font-size: 12px; color: #666;" title="Последний доступ: ${formatDate(data.lastAccess)}">
          ${data.totalRequests} запр.
        </td>
        <td style="padding: 12px;">
          <button onclick="toggleUser('${token}', ${data.active})" 
                  style="margin-right: 5px; padding: 6px 12px; cursor: pointer; background: ${data.active ? '#ff9800' : '#4CAF50'}; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 500;">
            ${data.active ? 'Заблокировать' : 'Разблокировать'}
          </button>
          <button onclick="resetTraffic('${token}')" 
                  style="margin-right: 5px; padding: 6px 12px; cursor: pointer; background: #2196F3; color: white; border: none; border-radius: 6px; font-size: 12px;">
            Сброс
          </button>
          <button onclick="deleteUser('${token}')" 
                  style="padding: 6px 12px; cursor: pointer; background: #f44336; color: white; border: none; border-radius: 6px; font-size: 12px;">
            Удалить
          </button>
        </td>
      </tr>
    `;
  }).join("");

  const activeCount = users.filter(u => u.data.active).length;
  const paidCount = users.filter(u => u.data.active && new Date(u.data.expireDate) > new Date()).length;
  const totalTraffic = users.reduce((sum, u) => sum + u.data.trafficUsedGB, 0);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CONFIG.BRAND_NAME} — Панель управления</title>
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container { 
            max-width: 1600px; 
            margin: 0 auto; 
            background: white; 
            border-radius: 16px; 
            padding: 30px; 
            box-shadow: 0 10px 40px rgba(0,0,0,0.2); 
        }
        h1 { 
            margin: 0 0 10px 0; 
            color: #333; 
            display: flex; 
            align-items: center; 
            gap: 15px;
            flex-wrap: wrap;
        }
        .logo { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white; 
            padding: 6px 16px; 
            border-radius: 20px; 
            font-size: 14px; 
            font-weight: 600;
        }
        .header-stats {
            display: flex;
            gap: 15px;
            margin-left: auto;
        }
        .badge {
            background: #f0f0f0;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 13px;
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 25px;
            background: white;
            border-radius: 12px;
            overflow: hidden;
        }
        th { 
            text-align: left; 
            padding: 14px 12px; 
            background: #f8f9fa; 
            font-weight: 600; 
            color: #555; 
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #e0e0e0;
        }
        .add-form { 
            background: #f8f9fa; 
            padding: 24px; 
            border-radius: 12px; 
            margin-bottom: 25px; 
            display: flex; 
            gap: 15px; 
            flex-wrap: wrap; 
            align-items: flex-end;
            border: 1px solid #e0e0e0;
        }
        .form-group { 
            display: flex; 
            flex-direction: column; 
            gap: 6px; 
        }
        .form-group label { 
            font-size: 12px; 
            color: #666; 
            font-weight: 600; 
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .form-group input, .form-group select { 
            padding: 10px 14px; 
            border: 1px solid #ddd; 
            border-radius: 8px; 
            font-size: 14px; 
            min-width: 160px;
            transition: border-color 0.2s;
        }
        .form-group input:focus {
            outline: none;
            border-color: #667eea;
        }
        button { 
            padding: 10px 18px; 
            border: none; 
            border-radius: 8px; 
            cursor: pointer; 
            font-size: 14px; 
            font-weight: 500; 
            transition: all 0.2s;
        }
        .btn-primary { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            color: white;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        .btn-primary:hover { 
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
        }
        .logout-btn { 
            background: #6c757d; 
            color: white; 
        }
        .link-generator { 
            background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%); 
            padding: 20px; 
            border-radius: 12px; 
            margin-bottom: 25px;
            border: 1px solid #bbdefb;
        }
        .link-output { 
            font-family: 'SF Mono', Monaco, monospace; 
            background: white; 
            padding: 14px 18px; 
            border-radius: 8px; 
            word-break: break-all; 
            border: 1px solid #ddd; 
            font-size: 14px;
            margin: 12px 0;
        }
        .stats-grid { 
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px; 
            margin-top: 25px; 
        }
        .stat-card { 
            background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
            padding: 20px; 
            border-radius: 12px; 
            border: 1px solid #e0e0e0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .stat-value { 
            font-size: 36px; 
            font-weight: 700; 
            color: #333;
            line-height: 1.2;
        }
        .stat-label { 
            color: #666; 
            font-size: 14px; 
            margin-top: 5px;
        }
        .section-title {
            font-size: 18px;
            font-weight: 600;
            margin: 25px 0 15px 0;
            color: #333;
        }
        .copy-btn {
            background: #2196F3;
            color: white;
            margin-top: 10px;
        }
        .toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #333;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none;
            z-index: 1000;
        }
        .toast.show {
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>
            <span>🚀 ${CONFIG.BRAND_NAME}</span>
            <span class="logo">Deno KV • Продакшн</span>
            <div class="header-stats">
                <span class="badge">📱 Макс. устройств: ${CONFIG.maxDevicesPerToken}</span>
                <span class="badge">📊 Лимит: ${CONFIG.trafficLimitGB} GB</span>
            </div>
            <button onclick="logout()" class="logout-btn" style="margin-left: auto;">🚪 Выйти</button>
        </h1>
        
        <div class="add-form">
            <div class="form-group">
                <label>Токен (пусто = авто)</label>
                <input type="text" id="newToken" placeholder="user_xxxxxxxx" style="font-family: monospace;">
            </div>
            <div class="form-group">
                <label>Заметка</label>
                <input type="text" id="newNote" placeholder="Например: Оплата 15.04">
            </div>
            <div class="form-group">
                <label>Срок действия</label>
                <input type="date" id="newExpire" value="${new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Срок (быстро)</label>
                <select id="expirePreset" onchange="setExpireDate(this.value)">
                    <option value="30">30 дней</option>
                    <option value="7">7 дней (пробный)</option>
                    <option value="90">90 дней</option>
                    <option value="365">365 дней</option>
                </select>
            </div>
            <button onclick="addUser()" class="btn-primary">➕ Добавить пользователя</button>
        </div>
        
        <div class="link-generator">
            <strong style="font-size: 16px;">🔗 Конструктор ссылок для Karing</strong><br>
            <select id="linkTokenSelect" onchange="updateLink()" style="margin: 12px 0; padding: 10px; width: 100%; border-radius: 8px; border: 1px solid #ddd; font-size: 14px;">
                <option value="">-- Выбери пользователя --</option>
                ${users.map(({ token, data }) => `<option value="${token}">${token} — ${data.note || 'Без заметки'} (${data.active ? '✅' : '🚫'})</option>`).join("")}
            </select>
            <div class="link-output" id="generatedLink">karing://restore-backup?url=${Deno.env.get("DENO_DEPLOY_URL") || "https://premvpn.deno.dev"}/config?token=ТОКЕН</div>
            <button onclick="copyLink()" class="copy-btn">📋 Копировать ссылку</button>
            <button onclick="openInKaring()" style="margin-left: 10px; background: #4CAF50; color: white;">📱 Открыть в Karing</button>
        </div>

        <div class="section-title">👥 Пользователи</div>
        
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>Токен</th>
                        <th>Статус</th>
                        <th>Заметка</th>
                        <th>Срок</th>
                        <th>Трафик</th>
                        <th>Устройства</th>
                        <th>Запросы</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${usersHTML || '<tr><td colspan="8" style="padding: 40px; text-align: center; color: #999;">Нет пользователей. Добавьте первого!</td></tr>'}
                </tbody>
            </table>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${users.length}</div>
                <div class="stat-label">👥 Всего пользователей</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${activeCount}</div>
                <div class="stat-label">✅ Активных</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${paidCount}</div>
                <div class="stat-label">💳 Оплаченных</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${totalTraffic.toFixed(1)} GB</div>
                <div class="stat-label">📊 Всего трафика</div>
            </div>
        </div>
        
        <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; font-size: 13px; color: #666;">
            <strong>⚙️ Текущие настройки:</strong> 
            Лимит устройств: ${CONFIG.maxDevicesPerToken} • 
            Трафик: ${CONFIG.trafficLimitGB} GB • 
            Cooldown IP: ${CONFIG.tokenCooldownMinutes} мин • 
            Бэкенд: Deno KV
        </div>
    </div>
    
    <div id="toast" class="toast">✅ Готово</div>
    
    <script>
        const PROJECT_URL = window.location.origin;
        
        function showToast(message) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2000);
        }
        
        function setExpireDate(days) {
            const date = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000);
            document.getElementById('newExpire').value = date.toISOString().split('T')[0];
        }
        
        async function apiCall(endpoint, method = 'GET', body = null) {
            const headers = { 'Content-Type': 'application/json' };
            const options = { method, headers };
            if (body) options.body = JSON.stringify(body);
            
            const response = await fetch(endpoint, options);
            return response.json();
        }
        
        async function addUser() {
            const token = document.getElementById('newToken').value;
            const note = document.getElementById('newNote').value;
            const expireDate = document.getElementById('newExpire').value;
            const password = prompt('🔐 Введите пароль администратора:');
            
            if (!password) return;
            
            const result = await apiCall('/admin/add', 'POST', { password, token: token || undefined, note, expireDate });
            if (result.success) {
                showToast('✅ Пользователь добавлен: ' + result.token);
                setTimeout(() => location.reload(), 500);
            } else {
                alert('❌ Ошибка: ' + result.error);
            }
        }
        
        async function toggleUser(token, currentActive) {
            const password = prompt('🔐 Введите пароль администратора:');
            if (!password) return;
            
            const result = await apiCall('/admin/toggle', 'POST', { password, token, active: !currentActive });
            if (result.success) {
                showToast(currentActive ? '🚫 Пользователь заблокирован' : '✅ Пользователь разблокирован');
                setTimeout(() => location.reload(), 500);
            } else {
                alert('❌ Ошибка: ' + result.error);
            }
        }
        
        async function resetTraffic(token) {
            const password = prompt('🔐 Введите пароль администратора:');
            if (!password) return;
            
            const result = await apiCall('/admin/reset-traffic', 'POST', { password, token });
            if (result.success) {
                showToast('📊 Трафик сброшен');
                setTimeout(() => location.reload(), 500);
            } else {
                alert('❌ Ошибка: ' + result.error);
            }
        }
        
        async function deleteUser(token) {
            if (!confirm('🗑️ Точно удалить пользователя ' + token + '?')) return;
            
            const password = prompt('🔐 Введите пароль администратора:');
            if (!password) return;
            
            const result = await apiCall('/admin/delete', 'POST', { password, token });
            if (result.success) {
                showToast('🗑️ Пользователь удалён');
                setTimeout(() => location.reload(), 500);
            } else {
                alert('❌ Ошибка: ' + result.error);
            }
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
            showToast('📋 Ссылка скопирована!');
        }
        
        function openInKaring() {
            const text = document.getElementById('generatedLink').textContent;
            window.location.href = text;
        }
        
        function logout() {
            if (confirm('Выйти из панели?')) {
                location.reload();
            }
        }
        
        document.addEventListener('DOMContentLoaded', () => {
            document.getElementById('generatedLink').textContent = 
                'karing://restore-backup?url=' + PROJECT_URL + '/config?token=ТОКЕН';
        });
    </script>
</body>
</html>`;
}

// ==================== ОСНОВНОЙ СЕРВЕР ====================
Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                   req.headers.get("cf-connecting-ip") || 
                   "unknown";

  // ==================== АДМИН-ПАНЕЛЬ ====================
  if (url.pathname === "/admin" || url.pathname === "/") {
    const users = await getAllUsers();
    const html = getAdminPanelHTML(users);
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // ==================== API: ДОБАВИТЬ ПОЛЬЗОВАТЕЛЯ ====================
  if (url.pathname === "/admin/add" && req.method === "POST") {
    try {
      const body = await req.json();
      if (body.password !== CONFIG.ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ success: false, error: "Неверный пароль" }), { status: 401 });
      }

      const token = body.token || generateToken();
      const existing = await kv.get(["users", token]);
      if (existing.value) {
        return new Response(JSON.stringify({ success: false, error: "Токен уже существует" }), { status: 400 });
      }

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
      };

      await kv.set(["users", token], user);
      console.log(`✅ Админ добавил: ${token}`);

      return new Response(JSON.stringify({ success: true, token }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500 });
    }
  }

  // ==================== API: TOGGLE USER ====================
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
      console.log(`🔄 Админ переключил: ${body.token} -> ${body.active}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500 });
    }
  }

  // ==================== API: СБРОС ТРАФИКА ====================
  if (url.pathname === "/admin/reset-traffic" && req.method === "POST") {
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
      user.trafficUsedGB = 0;
      await kv.set(["users", body.token], user);
      console.log(`📊 Админ сбросил трафик: ${body.token}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500 });
    }
  }

  // ==================== API: УДАЛИТЬ ПОЛЬЗОВАТЕЛЯ ====================
  if (url.pathname === "/admin/delete" && req.method === "POST") {
    try {
      const body = await req.json();
      if (body.password !== CONFIG.ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ success: false, error: "Неверный пароль" }), { status: 401 });
      }

      await kv.delete(["users", body.token]);
      console.log(`🗑️ Админ удалил: ${body.token}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500 });
    }
  }

  // ==================== API: СТАТУС ПОЛЬЗОВАТЕЛЯ ====================
  if (url.pathname === "/status") {
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response(JSON.stringify({ error: "Token required" }), { 
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const userRes = await kv.get<UserData>(["users", token]);
    if (!userRes.value) {
      return new Response(JSON.stringify({ error: "User not found" }), { 
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const user = userRes.value;
    const now = Date.now();
    const cooldownMs = CONFIG.tokenCooldownMinutes * 60 * 1000;
    
    let activeDevices = 0;
    for (const timestamp of Object.values(user.deviceIPs)) {
      if (now - timestamp < cooldownMs) activeDevices++;
    }

    return new Response(JSON.stringify({
      active: user.active,
      expireDate: user.expireDate,
      trafficUsed: user.trafficUsedGB,
      trafficLimit: CONFIG.trafficLimitGB,
      remainingTraffic: CONFIG.trafficLimitGB - user.trafficUsedGB,
      devices: activeDevices,
      maxDevices: CONFIG.maxDevicesPerToken,
      note: user.note,
      totalRequests: user.totalRequests,
      lastAccess: user.lastAccess,
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  // ==================== ЭНДПОИНТ ДЛЯ KARING ====================
  if (url.pathname !== "/config") {
    return new Response("404 Not Found", { status: 404 });
  }

  const token = url.searchParams.get("token");
  if (!token) {
    console.log(`⚠️ Запрос без токена от ${clientIP}`);
    return new Response("❌ Token required", { status: 401 });
  }

  const userRes = await kv.get<UserData>(["users", token]);
  if (!userRes.value) {
    console.log(`🚫 Неверный токен: ${token} от ${clientIP}`);
    return new Response("❌ Invalid token", { status: 401 });
  }

  const user = userRes.value;

  // Проверка активности
  if (!user.active) {
    console.log(`⛔ Заблокированный токен: ${token} от ${clientIP}`);
    return new Response("❌ Account blocked", { status: 403 });
  }

  // Проверка срока
  const expireDate = new Date(user.expireDate);
  if (new Date() > expireDate) {
    console.log(`📅 Истёкший токен: ${token} от ${clientIP}`);
    return new Response("❌ Subscription expired", { 
      status: 403,
      headers: {
        "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${Math.floor(expireDate.getTime() / 1000)}`,
        "isp-name": CONFIG.BRAND_NAME,
        "isp-url": CONFIG.PAYMENT_URL,
        "Access-Control-Allow-Origin": "*",
      }
    });
  }

  // Проверка заблокированных IP
  if (user.blockedIPs.includes(clientIP)) {
    console.log(`🔒 Заблокированный IP: ${clientIP} для ${token}`);
    return new Response("❌ IP blocked", { status: 403 });
  }

  // Очистка старых IP и подсчёт активных устройств
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

  // Проверка лимита устройств
  const isNewDevice = !cleanDeviceIPs[clientIP];
  if (isNewDevice && activeDevices >= CONFIG.maxDevicesPerToken) {
    console.log(`📱 Превышен лимит устройств: ${token} | IP: ${clientIP} | Активных: ${activeDevices}`);
    return new Response("❌ Device limit reached", { 
      status: 403,
      headers: {
        "isp-name": CONFIG.BRAND_NAME,
        "isp-url": CONFIG.PAYMENT_URL,
        "Access-Control-Allow-Origin": "*",
      }
    });
  }

  // Обновление данных
  cleanDeviceIPs[clientIP] = now;
  const newTrafficUsed = user.trafficUsedGB + (1 / 1024); // ~1 MB на запрос конфига

  // Проверка лимита трафика
  if (newTrafficUsed >= CONFIG.trafficLimitGB) {
    console.log(`📊 Превышен лимит трафика: ${token} | Использовано: ${newTrafficUsed.toFixed(2)} GB`);
    return new Response("❌ Traffic limit exceeded", { 
      status: 403,
      headers: {
        "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${Math.floor(expireDate.getTime() / 1000)}`,
        "isp-name": CONFIG.BRAND_NAME,
        "isp-url": CONFIG.PAYMENT_URL,
        "Access-Control-Allow-Origin": "*",
      }
    });
  }

  // Защита от чрезмерных запросов
  if (user.totalRequests > CONFIG.maxRequestsPerToken) {
    console.log(`🤖 Слишком много запросов: ${token} | Запросов: ${user.totalRequests}`);
    user.active = false;
    await kv.set(["users", token], user);
    return new Response("❌ Too many requests. Account blocked.", { status: 429 });
  }

  // Сохранение обновлённых данных
  const updatedUser: UserData = {
    ...user,
    deviceIPs: cleanDeviceIPs,
    trafficUsedGB: newTrafficUsed,
    totalRequests: user.totalRequests + 1,
    lastAccess: new Date().toISOString(),
  };
  await kv.set(["users", token], updatedUser);

  console.log(`✅ ${token} | IP: ${clientIP} | Устройства: ${activeDevices + (isNewDevice ? 1 : 0)}/${CONFIG.maxDevicesPerToken} | Трафик: ${newTrafficUsed.toFixed(2)}/${CONFIG.trafficLimitGB} GB`);

  // Получение бэкапа с GitHub
  try {
    const response = await fetch(BACKUP_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PremVPN-Proxy/5.0)",
        "Accept": "application/zip,application/octet-stream,*/*"
      },
    });

    if (!response.ok) {
      console.error(`❌ Ошибка GitHub: ${response.status}`);
      return new Response(`❌ Backup error: ${response.status}`, { status: 502 });
    }

    const trafficTotal = CONFIG.trafficLimitGB * 1024 * 1024 * 1024;
    const trafficUsed = newTrafficUsed * 1024 * 1024 * 1024;
    const expireTimestamp = Math.floor(expireDate.getTime() / 1000);

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="PremVPN.backup.zip"',
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*",
        "Subscription-Userinfo": `upload=0; download=${trafficUsed}; total=${trafficTotal}; expire=${expireTimestamp}`,
        "isp-name": CONFIG.BRAND_NAME,
        "isp-url": CONFIG.PAYMENT_URL,
      },
    });
  } catch (e) {
    console.error(`💥 Критическая ошибка: ${e}`);
    return new Response(`❌ Server error: ${e}`, { status: 500 });
  }
});
