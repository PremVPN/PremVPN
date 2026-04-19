// =============================================
// Karing Deno Deploy Auth Proxy v3.0
// С постоянным хранилищем Deno KV
// =============================================

const BACKUP_URL = "https://github.com/PremVPN/PremV2PN/raw/main/Karing_1.2.16.1912_ios_2026-04-18-1749.backup.zip";

// Настройки
const CONFIG = {
  maxDevicesPerToken: 2,
  tokenCooldownMinutes: 60,
  maxRequestsPerToken: 50,
  trafficLimitGB: 100,
};

// Интерфейс пользователя (сохраняется в KV)
interface UserData {
  active: boolean;
  note: string;
  expireDate: string;
  trafficUsedGB: number;
  blockedIPs: string[];
  deviceIPs: Record<string, number>; // IP -> timestamp последнего запроса
}

// Открываем KV-хранилище (автоматически подключается к привязанной базе)
const kv = await Deno.openKv();

// Функция для инициализации тестового пользователя (выполнится один раз)
async function initDefaultUser() {
  const existing = await kv.get<UserData>(["users", "abc123"]);
  if (!existing.value) {
    const user: UserData = {
      active: true,
      note: "Тестовый пользователь",
      expireDate: "2026-05-19",
      trafficUsedGB: 0,
      blockedIPs: [],
      deviceIPs: {},
    };
    await kv.set(["users", "abc123"], user);
    console.log("✅ Создан тестовый пользователь abc123");
  }
}

// Запускаем инициализацию
await initDefaultUser();

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                   req.headers.get("cf-connecting-ip") || 
                   "unknown";

  // Эндпоинт для просмотра статистики
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
    
    // Считаем активные устройства
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
      blockedIPs: user.blockedIPs,
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  // Основной эндпоинт для Karing
  if (url.pathname !== "/config") {
    return new Response("404 Not Found", { status: 404 });
  }

  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("❌ Token required", { status: 401 });
  }

  // Получаем пользователя из KV
  const userRes = await kv.get<UserData>(["users", token]);
  if (!userRes.value) {
    console.log(`🚫 Invalid token: ${token} from ${clientIP}`);
    return new Response("❌ Invalid token", { status: 401 });
  }

  const user = userRes.value;

  // Проверка активности
  if (!user.active) {
    return new Response("❌ Account blocked", { status: 403 });
  }

  // Проверка срока подписки
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

  // Проверка блокировки IP
  if (user.blockedIPs.includes(clientIP)) {
    console.log(`🔒 Blocked IP: ${clientIP} | Token: ${token}`);
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
    console.log(`📱 Device limit: ${token} | IP: ${clientIP} | Active: ${activeDevices}`);
    return new Response("❌ Device limit reached", { 
      status: 403,
      headers: {
        "isp-name": "PremVPN",
        "isp-url": "https://t.me/PremVPN_bot",
      }
    });
  }

  // Обновляем timestamp для текущего IP
  cleanDeviceIPs[clientIP] = now;

  // Увеличиваем трафик (~1 МБ на запрос конфига)
  const newTrafficUsed = user.trafficUsedGB + (1 / 1024);

  // Проверка лимита трафика
  if (newTrafficUsed >= CONFIG.trafficLimitGB) {
    console.log(`📊 Traffic limit: ${token} | Used: ${newTrafficUsed.toFixed(2)}GB`);
    return new Response("❌ Traffic limit exceeded", { 
      status: 403,
      headers: {
        "Subscription-Userinfo": `upload=0; download=0; total=0; expire=${Math.floor(expireDate.getTime() / 1000)}`,
        "isp-name": "PremVPN",
        "isp-url": "https://t.me/PremVPN_bot",
      }
    });
  }

  // Сохраняем обновлённые данные в KV
  const updatedUser: UserData = {
    ...user,
    deviceIPs: cleanDeviceIPs,
    trafficUsedGB: newTrafficUsed,
  };
  await kv.set(["users", token], updatedUser);

  console.log(`✅ ${token} | IP: ${clientIP} | Devices: ${activeDevices}/${CONFIG.maxDevicesPerToken} | Traffic: ${newTrafficUsed.toFixed(2)}GB`);

  // Получаем бэкап
  const response = await fetch(BACKUP_URL);
  if (!response.ok) {
    return new Response("❌ Backup error", { status: 502 });
  }

  // Заголовки для Karing
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
