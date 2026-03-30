require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2/promise');
const path    = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Banco de dados ──────────────────────────────────────────────────────────
const DB_URL = process.env.DATABASE_URL ||
  'mysql://root:DnfWVyYtTnGNnbwKlKbqegCOZeTvSlin@gondola.proxy.rlwy.net:25921/railway';

let pool;
function db() {
  if (!pool) pool = mysql.createPool(DB_URL);
  return pool;
}

// ─── Filtro: só provas da Segunda Chamada ────────────────────────────────────
const FILTRO = '%Segunda Prova%';

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
  const { matricula, nome_aluno } = req.body;
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
        'INSERT INTO tentativas (prova_id, nome_aluno, matricula, ip_origem, user_agent) VALUES (?, ?, ?, ?, ?)',
        [prova.id, nome_aluno.trim(), matriculaStr, ip, ua]
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

    res.json({
      id:           tentativaId,
      prova_id:     prova.id,
      prova_titulo: prova.titulo,
      tempo_limite: prova.tempo_limite || 90,
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
              COALESCE(p.titulo_publico, p.titulo) AS prova_titulo
       FROM tentativas t JOIN provas p ON p.id = t.prova_id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (!tent) return res.status(404).json({ error: 'Tentativa não encontrada.' });

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

// ─── Fallback SPA ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✓ Segunda Chamada PCont II rodando na porta ${PORT}`));
