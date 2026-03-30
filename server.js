require('dotenv').config();
const express    = require('express');
const mysql      = require('mysql2/promise');
const path       = require('path');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Banco de dados ──────────────────────────────────────────────────────────
const DB_URL_FALLBACK = 'mysql://root:DnfWVyYtTnGNnbwKlKbqegCOZeTvSlin@gondola.proxy.rlwy.net:25921/railway';

function resolveDbUrl() {
  const envUrl = (process.env.DATABASE_URL || '').trim();
  if (!envUrl || envUrl.includes('SENHA') || envUrl.includes('PORTA') || envUrl.startsWith('${{')) {
    return DB_URL_FALLBACK;
  }
  try {
    const u = new URL(envUrl);
    if (u.protocol === 'mysql:' && u.hostname && u.hostname !== 'host') return envUrl;
  } catch (_) {}
  return DB_URL_FALLBACK;
}

const DB_URL = resolveDbUrl();
let pool;
function db() {
  if (!pool) pool = mysql.createPool(DB_URL);
  return pool;
}

// ─── Filtro: só provas da Segunda Chamada ────────────────────────────────────
const FILTRO = '%Segunda Prova%';
const LOGIN_MAX_TENTATIVAS = Number(process.env.ADMIN_LOGIN_MAX_TENTATIVAS || 5);
const LOGIN_BLOQUEIO_MINUTOS = Number(process.env.ADMIN_LOGIN_BLOQUEIO_MINUTOS || 2);
const adminLoginEstadoPorIp = new Map();

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || 'ip-desconhecido';
}

// Mesma lógica do sistema-provas original:
// 1) ADMIN_PASSWORD
// 2) senha do DB em DATABASE_URL
// 3) fallback admin123
function determineAdminPassword() {
  return process.env.ADMIN_PASSWORD || '433455aA#';
}

function checkPassword(raw) {
  if (!raw) return false;
  return raw.trim() === determineAdminPassword().trim();
}

function requireAdmin(req, res, next) {
  if (!checkPassword(req.headers['x-admin-password'])) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  return next();
}

// ─── Mapeamento matrícula → índice da turma (0=I … 4=V) ─────────────────────
const MAPA_MATRICULA = {
  '0': 0, '1': 0,   // Turma I
  '2': 1, '3': 1,   // Turma II
  '4': 2, '5': 2,   // Turma III
  '6': 3, '7': 3,   // Turma IV
  '8': 4, '9': 4,   // Turma V
};

// ─── POST /api/tentativas — iniciar prova via matrícula ──────────────────────
app.post('/api/tentativas', async (req, res) => {
  const { matricula, nome_aluno, email } = req.body;
  if (!matricula || !nome_aluno)
    return res.status(400).json({ error: 'Informe nome e matrícula.' });

  const matriculaStr = matricula.toString().trim().replace(/\D/g, '');
  if (matriculaStr.length < 3)
    return res.status(400).json({ error: 'Matrícula inválida.' });

  const ultimoDigito = matriculaStr.slice(-1);
  const idx = MAPA_MATRICULA[ultimoDigito];
  if (idx === undefined)
    return res.status(400).json({ error: 'Dígito de matrícula não reconhecido.' });

  try {
    // Buscar as 5 provas ordenadas (I → V)
    const [provas] = await db().query(
      `SELECT id, COALESCE(titulo_publico, titulo) AS titulo, tempo_limite
       FROM provas WHERE titulo LIKE ? ORDER BY titulo`,
      [FILTRO]
    );
    if (provas.length < 5)
      return res.status(500).json({ error: 'Provas não configuradas corretamente.' });

    const prova = provas[idx];
    const ip    = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    const ua    = req.headers['user-agent'] || '';

    let tentativaId;
    try {
      const [r] = await db().query(
        'INSERT INTO tentativas (prova_id, nome_aluno, matricula, email, ip_origem, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
        [prova.id, nome_aluno.trim(), matriculaStr, email || null, ip, ua]
      );
      tentativaId = r.insertId;
    } catch (dupErr) {
      if (dupErr.code === 'ER_DUP_ENTRY') {
        // Matrícula já tem tentativa — verifica se está finalizada
        const [[exist]] = await db().query(
          'SELECT id, finalizado_em FROM tentativas WHERE matricula = ? LIMIT 1',
          [matriculaStr]
        );
        if (!exist) return res.status(500).json({ error: 'Erro inesperado.' });
        if (exist.finalizado_em) {
          return res.status(409).json({ error: 'Você já realizou esta prova. Entre em contato com o professor caso precise de suporte.' });
        }
        // Tentativa em aberto — permite retomar
        tentativaId = exist.id;
      } else {
        throw dupErr;
      }
    }

    // Exibe apenas "2ª Avaliação — Estatística II" — sem turma nem variante
    const tituloPublico = '2ª Avaliação — Estatística II';

    res.json({
      id:           tentativaId,
      prova_id:     prova.id,
      prova_titulo: tituloPublico,
      tempo_limite: prova.tempo_limite || 120,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/tentativas/:id/questoes ────────────────────────────────────────
app.get('/api/tentativas/:id/questoes', async (req, res) => {
  try {
    const [[tent]] = await db().query(
      'SELECT prova_id, finalizado_em FROM tentativas WHERE id = ?',
      [req.params.id]
    );
    if (!tent) return res.status(404).json({ error: 'Tentativa não encontrada.' });
    if (tent.finalizado_em) return res.status(403).json({ error: 'Prova já finalizada.' });

    const [questoes] = await db().query(
      `SELECT q.id, q.enunciado, pq.ordem, pq.valor_questao
       FROM provas_questoes pq
       JOIN questoes q ON q.id = pq.questao_id
       WHERE pq.prova_id = ?
       ORDER BY pq.ordem`,
      [tent.prova_id]
    );

    for (const q of questoes) {
      const [alts] = await db().query(
        'SELECT id, texto, ordem FROM alternativas WHERE questao_id = ? ORDER BY ordem',
        [q.id]
      );
      q.alternativas = alts;
    }
    res.json(questoes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/tentativas/:id/responder ──────────────────────────────────────
app.post('/api/tentativas/:id/responder', async (req, res) => {
  const { questao_id, alternativa_id } = req.body;
  if (!questao_id || !alternativa_id) return res.status(400).json({ error: 'Dados incompletos.' });
  try {
    const [[tent]] = await db().query(
      'SELECT id, finalizado_em FROM tentativas WHERE id = ?',
      [req.params.id]
    );
    if (!tent) return res.status(404).json({ error: 'Tentativa não encontrada.' });
    if (tent.finalizado_em) return res.status(403).json({ error: 'Prova já finalizada.' });

    // Upsert manual (sem UNIQUE constraint na tabela)
    await db().query(
      'DELETE FROM respostas WHERE tentativa_id = ? AND questao_id = ?',
      [req.params.id, questao_id]
    );
    await db().query(
      'INSERT INTO respostas (tentativa_id, questao_id, alternativa_id) VALUES (?, ?, ?)',
      [req.params.id, questao_id, alternativa_id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/tentativas/:id/troca-aba ──────────────────────────────────────
app.post('/api/tentativas/:id/troca-aba', async (req, res) => {
  try {
    await db().query(
      'UPDATE tentativas SET trocas_aba = trocas_aba + 1 WHERE id = ?',
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── POST /api/tentativas/:id/finalizar ──────────────────────────────────────
app.post('/api/tentativas/:id/finalizar', async (req, res) => {
  const tentId = req.params.id;
  try {
    const [[tent]] = await db().query(
      'SELECT prova_id, finalizado_em FROM tentativas WHERE id = ?',
      [tentId]
    );
    if (!tent) return res.status(404).json({ error: 'Tentativa não encontrada.' });
    if (tent.finalizado_em) return res.status(403).json({ error: 'Prova já finalizada.' });

    // Calcular pontuação com base nas respostas e valor de cada questão
    const [respostas] = await db().query(
      `SELECT al.correta, pq.valor_questao
       FROM respostas r
       JOIN alternativas al ON al.id = r.alternativa_id
       JOIN provas_questoes pq ON pq.prova_id = ? AND pq.questao_id = r.questao_id
       WHERE r.tentativa_id = ?`,
      [tent.prova_id, tentId]
    );

    const [[{ total_pontos }]] = await db().query(
      'SELECT SUM(valor_questao) AS total_pontos FROM provas_questoes WHERE prova_id = ?',
      [tent.prova_id]
    );

    const acertos = respostas.reduce((s, r) => s + (r.correta ? parseFloat(r.valor_questao) : 0), 0);
    const pontuacao = total_pontos > 0 ? (acertos / total_pontos) * 100 : 0;

    await db().query(
      'UPDATE tentativas SET finalizado_em = NOW(), pontuacao = ?, tempo_total = ? WHERE id = ?',
      [pontuacao.toFixed(2), req.body.tempo_total || null, tentId]
    );

    res.json({ pontuacao: pontuacao.toFixed(2) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/tentativas/:id/resultado ───────────────────────────────────────
app.get('/api/tentativas/:id/resultado', async (req, res) => {
  try {
    const [[tent]] = await db().query(
      `SELECT t.id, t.nome_aluno, t.pontuacao, t.trocas_aba, t.tempo_total,
              t.iniciado_em, t.finalizado_em,
              COALESCE(p.titulo_publico, p.titulo) AS prova_titulo_raw
       FROM tentativas t JOIN provas p ON p.id = t.prova_id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (!tent) return res.status(404).json({ error: 'Tentativa não encontrada.' });

    tent.prova_titulo = '2ª Avaliação — Estatística II';
    delete tent.prova_titulo_raw;

    const [respostas] = await db().query(
      `SELECT pq.ordem,
              q.enunciado,
              a_resp.texto   AS resposta_dada,
              a_resp.correta AS acertou,
              a_cert.texto   AS resposta_correta,
              pq.valor_questao
       FROM respostas r
       JOIN tentativas t ON t.id = r.tentativa_id
       JOIN provas_questoes pq ON pq.prova_id = t.prova_id AND pq.questao_id = r.questao_id
       JOIN questoes q ON q.id = r.questao_id
       JOIN alternativas a_resp ON a_resp.id = r.alternativa_id
       JOIN alternativas a_cert ON a_cert.questao_id = r.questao_id AND a_cert.correta = 1
       WHERE r.tentativa_id = ?
       ORDER BY pq.ordem`,
      [req.params.id]
    );

    res.json({ tentativa: tent, respostas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET /api/debug/db — diagnóstico da conexão do banco ─────────────────────
app.get('/api/debug/db', async (req, res) => {
  try {
    const envRaw = process.env.DATABASE_URL || '(não definida)';
    const envSafe = envRaw.startsWith('mysql://') ? envRaw.replace(/:([^@]+)@/, ':****@') : envRaw.substring(0, 60);
    const [[r]] = await db().query('SELECT 1 AS ok');
    res.json({ db_ok: true, url_usada: DB_URL.replace(/:([^@]+)@/, ':****@'), env_raw: envSafe });
  } catch (e) {
    const envRaw = process.env.DATABASE_URL || '(não definida)';
    const envSafe = envRaw.startsWith('mysql://') ? envRaw.replace(/:([^@]+)@/, ':****@') : envRaw.substring(0, 60);
    res.status(500).json({ db_ok: false, error: e.message, url_usada: DB_URL.replace(/:([^@]+)@/, ':****@'), env_raw: envSafe });
  }
});

// ─── GET /api/auth/info — diagnóstico sem revelar a senha completa ───────────
app.get('/api/auth/info', (req, res) => {
  const adm = determineAdminPassword();
  const fonte = process.env.ADMIN_PASSWORD
    ? 'ADMIN_PASSWORD (env var)'
    : (process.env.DATABASE_URL ? 'DATABASE_URL (senha do banco)' : 'hardcoded');
  res.json({
    ADMIN_PASSWORD_definida: !!process.env.ADMIN_PASSWORD,
    fonte,
    senha_tamanho: adm.length,
    senha_inicio: adm.slice(0, 4),
    senha_fim: adm.slice(-2),
  });
});

// ─── POST /api/auth/login — login admin (mesmo padrão do original) ───────────
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  const adminPassword = determineAdminPassword();
  const ip = getClientIp(req);
  const agora = Date.now();
  const estado = adminLoginEstadoPorIp.get(ip) || { tentativas: 0, bloqueadoAte: 0 };

  if (estado.bloqueadoAte && agora < estado.bloqueadoAte) {
    const minutosRestantes = Math.ceil((estado.bloqueadoAte - agora) / 60000);
    return res.status(429).json({
      success: false,
      error: `Login admin temporariamente bloqueado por tentativas inválidas. Tente novamente em ${minutosRestantes} minuto(s).`
    });
  }

  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  if (isLocal && password === 'admin') {
    adminLoginEstadoPorIp.delete(ip);
    return res.json({ success: true, token: 'admin-session-active' });
  }

  if ((password || '').trim() === adminPassword.trim()) {
    adminLoginEstadoPorIp.delete(ip);
    return res.json({ success: true, token: 'admin-session-active' });
  }

  estado.tentativas += 1;
  if (estado.tentativas >= LOGIN_MAX_TENTATIVAS) {
    estado.tentativas = 0;
    estado.bloqueadoAte = agora + (LOGIN_BLOQUEIO_MINUTOS * 60000);
    adminLoginEstadoPorIp.set(ip, estado);
    return res.status(429).json({
      success: false,
      error: `Bloqueado após ${LOGIN_MAX_TENTATIVAS} tentativas inválidas. Aguarde ${LOGIN_BLOQUEIO_MINUTOS} minuto(s).`
    });
  }

  adminLoginEstadoPorIp.set(ip, estado);
  const restantes = LOGIN_MAX_TENTATIVAS - estado.tentativas;
  return res.status(401).json({
    success: false,
    error: `Senha incorreta. Restam ${restantes} tentativa(s) antes do bloqueio temporário.`
  });
});

// ─── GET /api/admin/tentativas — painel administrativo ───────────────────────
app.get('/api/admin/tentativas', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db().query(
      `SELECT t.id, t.nome_aluno, t.matricula, t.email, t.iniciado_em, t.finalizado_em,
              t.pontuacao, t.tempo_total, t.trocas_aba,
              COALESCE(p.titulo_publico, p.titulo) AS prova_titulo
       FROM tentativas t
       JOIN provas p ON p.id = t.prova_id
       WHERE p.titulo LIKE ?
       ORDER BY t.iniciado_em DESC`,
      [FILTRO]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/admin/tentativas/:id — detalhes da tentativa ───────────────────
app.get('/api/admin/tentativas/:id', requireAdmin, async (req, res) => {
  try {
    const [[tentativa]] = await db().query(
      `SELECT t.id, t.nome_aluno, t.matricula, t.email, t.iniciado_em, t.finalizado_em,
              t.pontuacao, t.tempo_total, t.trocas_aba,
              COALESCE(p.titulo_publico, p.titulo) AS prova_titulo
       FROM tentativas t
       JOIN provas p ON p.id = t.prova_id
       WHERE t.id = ? AND p.titulo LIKE ?`,
      [req.params.id, FILTRO]
    );

    if (!tentativa) {
      return res.status(404).json({ error: 'Tentativa não encontrada.' });
    }

    const [respostas] = await db().query(
      `SELECT pq.ordem,
              q.enunciado,
              a_resp.texto AS resposta_dada,
              a_resp.correta AS acertou,
              a_cert.texto AS resposta_correta,
              pq.valor_questao
       FROM respostas r
       JOIN tentativas t ON t.id = r.tentativa_id
       JOIN provas_questoes pq ON pq.prova_id = t.prova_id AND pq.questao_id = r.questao_id
       JOIN questoes q ON q.id = r.questao_id
       JOIN alternativas a_resp ON a_resp.id = r.alternativa_id
       JOIN alternativas a_cert ON a_cert.questao_id = r.questao_id AND a_cert.correta = 1
       WHERE r.tentativa_id = ?
       ORDER BY pq.ordem`,
      [req.params.id]
    );

    res.json({ tentativa, respostas });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /api/admin/tentativas/:id — excluir tentativa ─────────────────────
app.delete('/api/admin/tentativas/:id', requireAdmin, async (req, res) => {
  const tentId = req.params.id;
  try {
    await db().query('DELETE FROM respostas WHERE tentativa_id = ?', [tentId]);
    const [result] = await db().query('DELETE FROM tentativas WHERE id = ?', [tentId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Tentativa não encontrada.' });
    }
    res.json({ ok: true, message: `Tentativa #${tentId} excluída.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /api/admin/tentativas/:id/enviar — enviar resultado por e-mail ─────
app.post('/api/admin/tentativas/:id/enviar', requireAdmin, async (req, res) => {
  const tentId = req.params.id;
  try {
    const [[tentativa]] = await db().query(
      `SELECT t.id, t.nome_aluno, t.matricula, t.email, t.pontuacao,
              t.iniciado_em, t.finalizado_em, t.prova_id,
              COALESCE(p.titulo_publico, p.titulo) AS prova_titulo
       FROM tentativas t JOIN provas p ON p.id = t.prova_id
       WHERE t.id = ?`,
      [tentId]
    );
    if (!tentativa) return res.status(404).json({ error: 'Tentativa não encontrada.' });
    if (!tentativa.email || !tentativa.email.includes('@')) {
      return res.status(400).json({ error: 'Aluno sem e-mail cadastrado.' });
    }
    if (!tentativa.finalizado_em) {
      return res.status(400).json({ error: 'Prova ainda não finalizada.' });
    }

    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = process.env.SMTP_USER || 'vinicius.sacramento@ufca.edu.br';
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || '"Prof. Vinicius Sacramento" <vinicius.sacramento@ufca.edu.br>';

    if (!smtpPass) {
      return res.status(500).json({ error: 'SMTP_PASS não configurado. Adicione a senha de app do Google nas variáveis de ambiente do Railway (SMTP_PASS).' });
    }

    const [respostas] = await db().query(
      `SELECT pq.ordem, q.enunciado,
              a_resp.texto AS resposta_dada, a_resp.correta AS acertou,
              a_cert.texto AS resposta_correta, pq.valor_questao
       FROM respostas r
       JOIN tentativas t ON t.id = r.tentativa_id
       JOIN provas_questoes pq ON pq.prova_id = t.prova_id AND pq.questao_id = r.questao_id
       JOIN questoes q ON q.id = r.questao_id
       JOIN alternativas a_resp ON a_resp.id = r.alternativa_id
       JOIN alternativas a_cert ON a_cert.questao_id = r.questao_id AND a_cert.correta = 1
       WHERE r.tentativa_id = ?
       ORDER BY pq.ordem`,
      [tentId]
    );

    const total = respostas.length;
    const corretas = respostas.filter(r => !!r.acertou).length;
    const percentual = total > 0 ? ((corretas / total) * 100).toFixed(1) : '0.0';

    function esc(v) {
      return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function fmtBr(v) {
      if (!v) return '-';
      return new Date(v).toLocaleString('pt-BR');
    }

    const rows = respostas.map((r, i) => {
      const cor = r.acertou ? '#166534' : '#991b1b';
      const ico = r.acertou ? '✅ Correta' : '❌ Incorreta';
      return `<tr>
        <td style="padding:8px;border:1px solid #ddd">${i + 1}</td>
        <td style="padding:8px;border:1px solid #ddd">${esc(r.resposta_dada || 'Não respondida')}</td>
        <td style="padding:8px;border:1px solid #ddd">${esc(r.resposta_correta)}</td>
        <td style="padding:8px;border:1px solid #ddd;color:${cor};font-weight:700">${ico}</td>
      </tr>`;
    }).join('');

    const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h2 style="margin:0 0 12px">Resultado — 2ª Avaliação — Estatística II</h2>
      <p><strong>Aluno:</strong> ${esc(tentativa.nome_aluno)}</p>
      <p><strong>Matrícula:</strong> ${esc(tentativa.matricula)}</p>
      <p><strong>Início:</strong> ${esc(fmtBr(tentativa.iniciado_em))}</p>
      <p><strong>Finalização:</strong> ${esc(fmtBr(tentativa.finalizado_em))}</p>
      <p><strong>Pontuação:</strong> ${esc(tentativa.pontuacao)}%</p>
      <p><strong>Acertos:</strong> ${corretas}/${total} (${percentual}%)</p>
      <hr style="margin:16px 0">
      <h3 style="margin:0 0 8px">Respostas</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f3f4f6">
          <th style="padding:8px;border:1px solid #ddd">#</th>
          <th style="padding:8px;border:1px solid #ddd">Resposta do aluno</th>
          <th style="padding:8px;border:1px solid #ddd">Gabarito</th>
          <th style="padding:8px;border:1px solid #ddd">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <hr style="margin:16px 0">
      <p style="color:#64748b;font-size:12px">Universidade Federal do Cariri · Prof. Vinicius Sacramento</p>
    </div>`;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: tentativa.email,
      subject: `Resultado — 2ª Avaliação — Estatística II — ${tentativa.nome_aluno}`,
      html,
    });

    res.json({ ok: true, message: `E-mail enviado para ${tentativa.email}` });
  } catch (e) {
    console.error('Erro ao enviar e-mail:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── Painel /admin ────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── Fallback SPA ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  const adm = determineAdminPassword();
  const hint = adm.slice(0, 4) + '*'.repeat(Math.max(0, adm.length - 4));
  console.log(`✓ Segunda Prova PAdm II rodando na porta ${PORT}`);
  console.log(`🔑 Senha admin (hint): ${hint}  |  fonte: ${process.env.ADMIN_PASSWORD ? 'ADMIN_PASSWORD' : (process.env.DATABASE_URL ? 'DATABASE_URL' : 'hardcoded')}`);
  console.log(`   → Para definir uma senha própria, adicione ADMIN_PASSWORD nas variáveis do Railway.`);
});
