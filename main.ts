// ==================================================================
// 🔥 PREMVPN — ULTRA LITE (БЕРЕЖЁМ ЛИМИТЫ DENO)
// ==================================================================

const BACKUP_URL = "https://raw.githubusercontent.com/PremVPN/PremVPN/refs/heads/main/Karing_1.2.16.backup.zip";
const BRAND_NAME = "PremVPN";
const PAYMENT_URL = "https://t.me/PremVPN_bot";

// Открываем KV только на чтение
const kv = await Deno.openKv();

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // 1. На корневой запрос показываем заглушку (чтобы не 404, но без тяжёлого HTML)
  if (url.pathname === "/") {
    return new Response("🟢 PremVPN Light is running. Use /config?token=...", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // 2. Основной эндпоинт для Karing
  if (url.pathname !== "/config") {
    return new Response("404 Not Found", { status: 404 });
  }

  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("❌ Token required", { status: 401 });
  }

  try {
    // ТОЛЬКО ЧТЕНИЕ ИЗ KV (не тратим лимиты на запись)
    const userRes = await kv.get(["users", token]);
    
    if (!userRes.value) {
      return new Response("❌ Invalid token", { status: 401 });
    }

    const user = userRes.value as any;

    // Проверяем только флаг активности (остальное убрали для экономии CPU)
    if (!user.active) {
      return new Response("❌ Account blocked", { status: 403 });
    }

    // Проверка срока (опционально, можно убрать если не критично)
    if (user.expireDate) {
        const expireDate = new Date(user.expireDate);
        if (new Date() > expireDate) {
            return new Response("❌ Subscription expired", { 
                status: 403,
                headers: {
                    "isp-name": BRAND_NAME,
                    "isp-url": PAYMENT_URL,
                }
            });
        }
    }

    // --- ВАЖНО: НИКАКОЙ ЗАПИСИ В KV! ---
    // Мы не обновляем трафик, не пишем IP.
    // Это экономит 90% ресурсов.

    console.log(`✅ Доступ разрешён: ${token}`);

    // Проксируем файл
    const response = await fetch(BACKUP_URL, {
      headers: { "User-Agent": "PremVPN-Lite/1.0" },
    });

    if (!response.ok) {
      return new Response("❌ Backup fetch error", { status: 502 });
    }

    // Отдаём файл с нужными заголовками для Karing
    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="PremVPN.backup.zip"',
        "Cache-Control": "public, max-age=3600", // Кэшируем ответ на час
        "isp-name": BRAND_NAME,
        "isp-url": PAYMENT_URL,
        // Заглушка для трафика, чтобы Karing не ругался
        "Subscription-Userinfo": `upload=0; download=0; total=107374182400; expire=${Math.floor(Date.now() / 1000) + 86400 * 30}`,
      },
    });
  } catch (e) {
    return new Response(`❌ Server error: ${e}`, { status: 500 });
  }
});
