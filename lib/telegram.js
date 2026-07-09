const https = require('https');

function telegramConfigurado() {
    return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID);
}

function enviarMensagemTelegram(texto) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

    if (!botToken || !chatId) {
        return Promise.reject(new Error('Telegram não configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID)'));
    }

    const body = new URLSearchParams({
        chat_id: chatId,
        text: String(texto)
    }).toString();

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.ok) return resolve(json);
                    reject(new Error(json.description || 'Falha ao enviar mensagem no Telegram'));
                } catch (e) {
                    reject(new Error('Resposta inválida do Telegram'));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

module.exports = {
    telegramConfigurado,
    enviarMensagemTelegram
};
