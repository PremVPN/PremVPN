// =============================================
// ТЕСТОВЫЙ КОД v2 — С ПРАВИЛЬНЫМ USER-AGENT
// =============================================

const BACKUP_URL = "https://github.com/PremVPN/PremVPN/raw/refs/heads/main/Karing_1.2.16.backup.zip";

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

  console.log(`📥 Запрос: ${url.pathname} | IP: ${clientIP}`);

  // Главная страница
  if (url.pathname === "/" || url.pathname === "/admin") {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>PremVPN — Тест</title>
    <style>
        body { font-family: system-ui; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .success { color: #4CAF50; font-weight: bold; }
        .link { background: #f0f0f0; padding: 15px; border-radius: 8px; word-break: break-all; font-family: monospace; margin: 15px 0; }
        button { background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 16px; }
        button:hover { background: #45a049; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 PremVPN — Тестовый режим</h1>
        <p class="success">✅ Сервер работает!</p>
        <p>Backup URL: <code>${BACKUP_URL}</code></p>
        
        <h2>📱 Ссылка для Karing:</h2>
        <div class="link" id="karingLink">karing://restore-backup?url=${url.origin}/config?token=test123</div>
        <button onclick="copyLink()">📋 Копировать ссылку</button>
        
        <h2>🧪 Тестовые токены:</h2>
        <ul>
            <li><a href="/config?token=test123">/config?token=test123</a> (должно скачать zip)</li>
            <li><a href="/config?token=user_jhb4fe06">/config?token=user_jhb4fe06</a></li>
        </ul>
        
        <h2>🚫 Невалидный токен:</h2>
        <ul>
            <li><a href="/config?token=invalid">/config?token=invalid</a> (должно выдать 401)</li>
        </ul>
        
        <p><small>Твой IP: ${clientIP}</small></p>
    </div>
    <script>
        function copyLink() {
            navigator.clipboard.writeText(document.getElementById('karingLink').textContent);
            alert('✅ Ссылка скопирована!');
        }
    </script>
</body>
</html>`;
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Эндпоинт для Karing
  if (url.pathname !== "/config") {
    return new Response("404 Not Found", { status: 404 });
  }

  const token = url.searchParams.get("token");
  console.log(`🔑 Запрошен токен: ${token}`);

  // Валидные токены
  const validTokens = ["test123", "test456", "user_jhb4fe06"];
  if (!token || !validTokens.includes(token)) {
    console.log(`❌ Неверный токен: ${token}`);
    return new Response("❌ Invalid token", { 
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  console.log(`📥 Скачиваю бэкап с: ${BACKUP_URL}`);

  try {
    // ВАЖНО: Добавляем User-Agent, чтобы GitHub не блокировал
    const response = await fetch(BACKUP_URL, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (compatible; PremVPN-Proxy/1.0)",
        "Accept": "application/zip,application/octet-stream,*/*"
      },
    });

    console.log(`📊 GitHub ответил: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error(`❌ GitHub error: ${response.status}`);
      return new Response(`❌ Backup file error: GitHub returned ${response.status}`, { 
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    const contentLength = response.headers.get("content-length") || "неизвестно";
    console.log(`✅ Бэкап получен! Размер: ${contentLength} байт`);

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="Karing.backup.zip"',
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*",
        "isp-name": "PremVPN",
        "isp-url": "https://t.me/PremVPN_bot",
      },
    });
  } catch (e) {
    console.error(`💥 КРИТИЧЕСКАЯ ОШИБКА: ${e}`);
    return new Response(`❌ Server error: ${e}`, { 
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
});
