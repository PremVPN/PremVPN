// =============================================
// Karing Deno Deploy Auth Proxy v2.0
// Защита от шеринга + лимиты + монетизация
// =============================================

const BACKUP_URL = "https://github.com/PremVPN/PremV2PN/raw/main/Karing_1.2.16.1912_ios_2026-04-18-1749.backup.zip";

// Настройки безопасности
const CONFIG = {
  maxDevicesPerToken: 2,        // Максимум устройств на 1 токен
  tokenCooldownMinutes: 60,     // Через сколько "забываем" IP устройства
  maxRequestsPerToken: 50,      // Лимит скачиваний (защита от автоматических скриптов)
  trafficLimitGB: 100,          // Лимит трафика в ГБ (будет отображаться в Karing)
};

// === ТВОЯ БАЗА ПОЛЬЗОВАТЕЛЕЙ (редактируй здесь) ===
interface UserData {
  active: boolean;
  note?: string;
  expireDate: string;           // Дата окончания подписки (YYYY-MM-DD)
  trafficUsedGB: number;        // Сколько уже использовано трафика
  blockedIPs?: string[];        // Заблокированные IP (если юзер пытался шарить)
  deviceIPs: Map<string, number>; // IP -> timestamp последнего запроса
}

// Хранилище в памяти (Deno Deploy сбрасывает при деплое, но для MVP ок)
// Для продакшена лучше использовать Deno KV (напишу отдельно если нужно)
const users = new Map<string, UserData>([
  ["abc123", {
    active: true,
    note: "Тестовый пользователь",
    expireDate: "2026-05-19",
    trafficUsedGB: 0,
    deviceIPs: new Map(),
  }],
  ["premium456", {
    active: true,
    note: "VIP на 3 месяца",
    expireDate: "2026-07-19",
    trafficUsedGB: 12.5,
    deviceIPs: new Map(),
  }],
  ["blocked789", {
    active: false,
    note: "Заблокирован за шеринг",
    expireDate: "2026-04-19",
    trafficUsedGB: 50,
    deviceIPs: new Map(),
  }],
]);

// Счетчик запросов (Rate Limiting)
const requestCounter = new Map<string, number>();

// Очистка старых IP каждые 5 минут
setInterval(() => {
  const now = Date.now();
  const cooldownMs = CONFIG.tokenCooldownMinutes * 60 * 1000;
  
  for (const [token, user] of users) {
    for (const [ip, timestamp] of user.deviceIPs) {
      if (now - timestamp > cooldownMs) {
        user.deviceIPs.delete(ip);
      }
    }
  }
}, 5 * 60 * 1000);

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                   req.headers.get("cf-connecting-ip") || 
                   "unknown";

  // Маршрут для проверки статуса (для отладки)
  if (url.pathname === "/status") {
    const token = url.searchParams.get("token");
    if (!token || !users.has(token)) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { 
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const user = users.get(token)!;
    const deviceCount = user.deviceIPs.size;
    const remainingTraffic = CONFIG.trafficLimitGB - user.trafficUsedGB;
    
    return new Response(JSON.stringify({
      active: user.active,
      expireDate: user.expireDate,
      trafficUsed: user.trafficUsedGB,
      trafficLimit: CONFIG.trafficLimitGB,
      remainingTraffic: remainingTraffic,
      devices: deviceCount,
      maxDevices: CONFIG.maxDevicesPerToken,
      note: user.note,
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  // Основной эндпоинт для Karing
  if (url.pathname !== "/config") {
    return new Response("404 Not Found", { status: 404 });
  }

  const token = url.searchParams.get("token");

  // Защита от брутфорса
  if (!token) {
    console.log(`⚠️ [${new Date().toISOString()}] No token from IP: ${clientIP}`);
    return new Response("❌ Token required", { status: 401 });
  }

  const user = users.get(token);

  if (!user) {
    console.log(`🚫 [${new Date().toISOString()}] Invalid token attempt: ${token} from IP: ${clientIP}`);
    return new Response("❌ Invalid token", { status: 401 });
  }

  // Проверка блокировки пользователя
  if (!user.active) {
    console.log(`⛔ [${new Date().toISOString()}] Blocked user: ${token} | IP: ${clientIP}`);
    return new Response("❌ Access blocked by admin", { status: 403 });
  }

  // Проверка срока подписки
  const now = new Date();
  const expireDate = new Date(user.expireDate);
  if (now > expireDate) {
    console.log(`📅 [${new Date().toISOString()}] Expired: ${token} | IP: ${clientIP}`);
    return new Response("❌ Subscription expired", { 
      status: 403,
      headers: {
        "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${Math.floor(expireDate.getTime() / 1000)}`,
        "isp-name": encodeURIComponent("PremVPN"),
        "isp-url": "https://t.me/PremVPN_bot",
      }
    });
  }

  // Проверка лимита устройств
  const now2 = Date.now();
  const cooldownMs = CONFIG.tokenCooldownMinutes * 60 * 1000;
  
  // Очищаем старые IP
  for (const [ip, timestamp] of user.deviceIPs) {
    if (now2 - timestamp > cooldownMs) {
      user.deviceIPs.delete(ip);
    }
  }

  // Проверяем, не заблокирован ли этот IP
  if (user.blockedIPs?.includes(clientIP)) {
    console.log(`🔒 [${new Date().toISOString()}] Blocked IP attempt: ${clientIP} | Token: ${token}`);
    return new Response("❌ IP blocked due to suspicious activity", { status: 403 });
  }

  // Если это новое устройство и лимит превышен
  if (!user.deviceIPs.has(clientIP) && user.deviceIPs.size >= CONFIG.maxDevicesPerToken) {
    console.log(`📱 [${new Date().toISOString()}] Device limit exceeded: ${token} | IP: ${clientIP} | Current devices: ${Array.from(user.deviceIPs.keys()).join(", ")}`);
    
    // Опционально: можно автоматически блокировать токен при частых превышениях
    // if (превышений > 3) user.active = false;
    
    return new Response("❌ Device limit reached. Upgrade your plan for more devices.", { 
      status: 403,
      headers: {
        "isp-name": encodeURIComponent("PremVPN"),
        "isp-url": "https://t.me/PremVPN_bot",
      }
    });
  }

  // Rate Limiting (защита от скачивания скриптами)
  const reqCount = (requestCounter.get(token) || 0) + 1;
  requestCounter.set(token, reqCount);
  
  if (reqCount > CONFIG.maxRequestsPerToken) {
    console.log(`🤖 [${new Date().toISOString()}] Rate limit exceeded: ${token} | Requests: ${reqCount}`);
    user.active = false; // Автоматическая блокировка
    return new Response("❌ Too many requests. Account blocked.", { status: 429 });
  }

  // Обновляем время последнего запроса для этого IP
  user.deviceIPs.set(clientIP, now2);

  // Увеличиваем использованный трафик (примерно 1 МБ на запрос конфига)
  const trafficMB = 1;
  user.trafficUsedGB += trafficMB / 1024;

  // Проверка лимита трафика
  if (user.trafficUsedGB >= CONFIG.trafficLimitGB) {
    console.log(`📊 [${new Date().toISOString()}] Traffic limit exceeded: ${token} | Used: ${user.trafficUsedGB.toFixed(2)} GB`);
    return new Response("❌ Traffic limit exceeded", { 
      status: 403,
      headers: {
        "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${Math.floor(expireDate.getTime() / 1000)}`,
        "isp-name": encodeURIComponent("PremVPN"),
        "isp-url": "https://t.me/PremVPN_bot",
      }
    });
  }

  // Логирование успешного доступа
  console.log(`✅ [${new Date().toISOString()}] Token: ${token} | IP: ${clientIP} | Devices: ${user.deviceIPs.size}/${CONFIG.maxDevicesPerToken} | Traffic: ${user.trafficUsedGB.toFixed(2)}/${CONFIG.trafficLimitGB}GB`);

  // Получаем бэкап
  const response = await fetch(BACKUP_URL, {
    headers: {
      "User-Agent": "Karing-Proxy/2.0",
    },
  });

  if (!response.ok) {
    return new Response("❌ Backup file error", { status: 502 });
  }

  // Подготовка заголовков для Karing
  const trafficTotal = CONFIG.trafficLimitGB * 1024 * 1024 * 1024; // в байтах
  const trafficUsed = user.trafficUsedGB * 1024 * 1024 * 1024;
  const trafficRemaining = trafficTotal - trafficUsed;
  const expireTimestamp = Math.floor(expireDate.getTime() / 1000);

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Karing_backup.zip"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*",
      
      // Заголовки для Karing (показывают статус подписки)
      "Subscription-Userinfo": `upload=0; download=${trafficUsed}; total=${trafficTotal}; expire=${expireTimestamp}`,
      "isp-name": encodeURIComponent("PremVPN"),
      "isp-url": "https://t.me/PremVPN_bot", // Замени на свой канал/сайт оплаты
    },
  });
});

// Сброс счетчика запросов каждый час
setInterval(() => {
  requestCounter.clear();
}, 60 * 60 * 1000);
