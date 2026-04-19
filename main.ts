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
            <code id="generatedLink" style="word-break:break-all">karing://restore-backup?url=${location.origin}/config?token=ТОКЕН</code>
        </div>
        <button id="copyLinkBtn">📋 Копировать</button>
    </div>

    <table>
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
        usersData = data;
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
            
            return '<tr>' +
                '<td><span class="token">' + escapeHtml(u.token) + '</span></td>' +
                '<td><span class="badge ' + badgeClass + '">' + status + ' (' + daysLeft + ' дн.)</span></td>' +
                '<td>' + escapeHtml(u.data.note || '—') + '</td>' +
                '<td>' + u.data.expireDate + '</td>' +
                '<td>' + u.data.trafficUsedGB.toFixed(2) + ' / ${CONFIG.trafficLimitGB}</td>' +
                '<td>' + activeDevices + ' / ${CONFIG.maxDevicesPerToken}</td>' +
                '<td>' +
                    '<button data-action="toggle" data-token="' + escapeHtml(u.token) + '" data-active="' + u.data.active + '">' + (u.data.active ? 'Заблокировать' : 'Разблокировать') + '</button> ' +
                    '<button data-action="reset" data-token="' + escapeHtml(u.token) + '" class="success">Сброс</button> ' +
                    '<button data-action="delete" data-token="' + escapeHtml(u.token) + '" class="danger">Удалить</button>' +
                '</td>' +
            '</tr>';
        }).join('');
        
        // Навешиваем обработчики событий на кнопки
        document.querySelectorAll('button[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = btn.dataset.action;
                const token = btn.dataset.token;
                if (action === 'toggle') {
                    const currentActive = btn.dataset.active === 'true';
                    if (!confirm('Точно?')) return;
                    const res = await api('/admin/toggle', 'POST', {token, active: !currentActive});
                    if (res.success) loadUsers(); else alert(res.error);
                } else if (action === 'reset') {
                    const res = await api('/admin/reset-traffic', 'POST', {token});
                    if (res.success) loadUsers(); else alert(res.error);
                } else if (action === 'delete') {
                    if (!confirm('Удалить '+token+'?')) return;
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
