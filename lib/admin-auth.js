const crypto = require('crypto');
const { telegramConfigurado, enviarMensagemTelegram } = require('./telegram');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_TENTATIVAS = 5;

const adminSessions = new Map();
const adminChallenges = new Map();

function limparExpirados() {
    const agora = Date.now();
    for (const [token, sessao] of adminSessions) {
        if (sessao.expiresAt <= agora) adminSessions.delete(token);
    }
    for (const [id, desafio] of adminChallenges) {
        if (desafio.expiresAt <= agora) adminChallenges.delete(id);
    }
}

function criarTokenSessao() {
    return crypto.randomBytes(32).toString('hex');
}

function criarDesafioId() {
    return crypto.randomBytes(16).toString('hex');
}

function gerarCodigoOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

function registrarSessao(ip) {
    limparExpirados();
    const token = criarTokenSessao();
    const agora = Date.now();
    adminSessions.set(token, {
        ip: ip || null,
        createdAt: agora,
        expiresAt: agora + SESSION_TTL_MS
    });
    return token;
}

function sessaoAdminValida(token) {
    if (!token) return false;
    limparExpirados();
    return adminSessions.has(token);
}

function revogarSessao(token) {
    adminSessions.delete(token);
}

async function iniciarDesafioTelegram(ip) {
    if (!telegramConfigurado()) {
        throw new Error('Telegram não configurado no servidor');
    }

    limparExpirados();
    const challengeId = criarDesafioId();
    const code = gerarCodigoOtp();
    const agora = Date.now();

    adminChallenges.set(challengeId, {
        code,
        ip: ip || null,
        tentativas: 0,
        createdAt: agora,
        expiresAt: agora + OTP_TTL_MS
    });

    await enviarMensagemTelegram(
        `🔐 Código de acesso ao painel admin: ${code}\n\nVálido por 5 minutos. Não compartilhe.`
    );

    return { challengeId, expiresInSeconds: Math.floor(OTP_TTL_MS / 1000) };
}

function verificarDesafioTelegram(challengeId, code, ip) {
    limparExpirados();
    const desafio = adminChallenges.get(challengeId);

    if (!desafio) {
        return { ok: false, error: 'Código expirado ou inválido. Faça login novamente.' };
    }

    if (desafio.expiresAt <= Date.now()) {
        adminChallenges.delete(challengeId);
        return { ok: false, error: 'Código expirado. Faça login novamente.' };
    }

    desafio.tentativas += 1;
    if (desafio.tentativas > OTP_MAX_TENTATIVAS) {
        adminChallenges.delete(challengeId);
        return { ok: false, error: 'Muitas tentativas. Faça login novamente.' };
    }

    const codigoInformado = String(code || '').trim();
    if (codigoInformado !== desafio.code) {
        const restantes = OTP_MAX_TENTATIVAS - desafio.tentativas;
        return {
            ok: false,
            error: restantes > 0
                ? `Código incorreto. Restam ${restantes} tentativa(s).`
                : 'Código incorreto. Faça login novamente.'
        };
    }

    adminChallenges.delete(challengeId);
    const token = registrarSessao(ip);
    return { ok: true, token };
}

function exigir2faTelegram() {
    return telegramConfigurado();
}

module.exports = {
    exigir2faTelegram,
    sessaoAdminValida,
    revogarSessao,
    registrarSessao,
    iniciarDesafioTelegram,
    verificarDesafioTelegram
};
