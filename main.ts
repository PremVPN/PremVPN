// =============================================
// ТЕСТОВЫЙ КОД — ТОЛЬКО ПРОКСИ БЕЗ KV
// =============================================

const BACKUP_URL = "https://raw.githubusercontent.com/PremVPN/PremVPN/refs/heads/main/Karing_1.2.16.backup.zip";

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

  console.log(`📥 Запрос: ${url.pathname} | IP: ${clientIP}`);

  // Главная страница — простая панель
  if (url.pathname === "/" || url.pathname === "/admin") {
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head><title>PremVPN Test</title></head>
      <body>
        <h1>PremVPN — Тестовый режим</h1>
        <p>Статус: ✅ Сервер работает</p>
        <p>Backup URL: <code>${BACKUP_URL}</code></p>
        <h2>Тестовые токены:</h2>
        <ul>
          <li><a href="/config?token=test123">/config?token=test123</a></li>
          <li><a href="/config?token=test456">/config?token=test456</a></li>
        </ul>
        <p><small>IP: ${clientIP}</small></p>
      </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Эндпоинт для Karing
  if (url.pathname !== "/config") {
    return new Response("404 Not Found", { status: 404 });
  }

  const token = url.searchParams.get("token");
  console.log(`🔑 Токен: ${token}`);

  // Простая проверка токенов (без KV)
  const validTokens = ["test123", "test456", "user_jhb4fe06"];
  if (!token || !validTokens.includes(token)) {
    console.log(`❌ Неверный токен: ${token}`);
    return new Response("❌ Invalid token", { status: 401 });
  }

  console.log(`📥 Скачиваю бэкап с GitHub...`);

  try {
    const response = await fetch(BACKUP_URL, {
      headers: { "User-Agent": "PremVPN-Proxy/1.0" },
    });

    if (!response.ok) {
      console.error(`❌ GitHub error: ${response.status}`);
      return new Response(`❌ Backup error: ${response.status}`, { status: 502 });
    }

    console.log(`✅ Бэкап получен, отправляю клиенту`);

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="Karing.backup.zip"',
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "isp-name": "PremVPN",
        "isp-url": "https://t.me/PremVPN_bot",
      },
    });
  } catch (e) {
    console.error(`❌ Ошибка: ${e}`);
    return new Response(`❌ Server error: ${e}`, { status: 500 });
  }
});
