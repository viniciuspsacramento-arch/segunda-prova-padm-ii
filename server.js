const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const nodemailer = require('nodemailer');
const { promisePool, dbConfig } = require('./db');
require('dotenv').config();

function escapeHtml(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toBrDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('pt-BR');
}

function buildHtmlEmail(tentativa, respostas) {
    const total = respostas.length;
    const corretas = respostas.filter(r => !!r.correta).length;
    const percentual = total > 0 ? ((corretas / total) * 100).toFixed(2) : '0.00';

    const rows = respostas.map((r, idx) => {
        const acertou = r.correta ? '✅ Correta' : '❌ Incorreta';
        const cor = r.correta ? '#166534' : '#991b1b';
        return `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;vertical-align:top;">${idx + 1}</td>
          <td style="padding:8px;border:1px solid #ddd;vertical-align:top;">${escapeHtml(r.enunciado || '')}</td>
          <td style="padding:8px;border:1px solid #ddd;vertical-align:top;">${escapeHtml(r.resposta_texto_alt || 'Não respondida')}</td>
          <td style="padding:8px;border:1px solid #ddd;vertical-align:top;">${escapeHtml(r.gabarito_texto || '-')}</td>
          <td style="padding:8px;border:1px solid #ddd;color:${cor};font-weight:700;vertical-align:top;">${acertou}</td>
        </tr>`;
    }).join('');

    return `
  <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.4;">
    <h2 style="margin:0 0 12px 0;">Resultado da prova - ${escapeHtml(tentativa.prova_titulo || `Prova ${tentativa.prova_id}`)}</h2>
    <p><strong>Aluno:</strong> ${escapeHtml(tentativa.nome_aluno || '-')}</p>
    <p><strong>Matrícula:</strong> ${escapeHtml(tentativa.matricula || '-')}</p>
    <p><strong>Início:</strong> ${escapeHtml(toBrDateTime(tentativa.iniciado_em))}</p>
    <p><strong>Finalização:</strong> ${escapeHtml(toBrDateTime(tentativa.finalizado_em))}</p>
    <p><strong>Pontuação:</strong> ${escapeHtml((tentativa.pontuacao ?? 0).toString())}</p>
    <p><strong>Acertos:</strong> ${corretas}/${total} (${percentual}%)</p>
    <hr style="margin:16px 0;" />
    <h3 style="margin:0 0 8px 0;">Respostas</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px;border:1px solid #ddd;">#</th>
          <th style="padding:8px;border:1px solid #ddd;">Questão</th>
          <th style="padding:8px;border:1px solid #ddd;">Resposta do aluno</th>
          <th style="padding:8px;border:1px solid #ddd;">Gabarito</th>
          <th style="padding:8px;border:1px solid #ddd;">Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

const app = express();
const PORT = process.env.PORT || 3000;
const TURMA_PROVAS_TITULOS = ['Prova I', 'Prova II', 'Prova III', 'Prova IV', 'Prova V'];
// NOTA: IDs fixos mantidos como fallback, mas o sistema agora usa a coluna 'ativo' da tabela provas.
const TURMA_PROVAS_IDS_FIXOS = [17, 26, 27, 28, 29];
const BLOQUEAR_POR_REGIAO = ['1', 'true', 'sim', 'yes'].includes(String(process.env.BLOQUEAR_POR_REGIAO || '').toLowerCase());
const BLOQUEAR_SE_GEO_INDISPONIVEL = ['1', 'true', 'sim', 'yes'].includes(String(process.env.BLOQUEAR_SE_GEO_INDISPONIVEL || '').toLowerCase());
const ALUNO_ALLOWED_COUNTRY = String(process.env.ALUNO_ALLOWED_COUNTRY || 'BR').toUpperCase();
const ALUNO_ALLOWED_REGION_CODES = String(process.env.ALUNO_ALLOWED_REGION_CODES || 'CE')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
const ALUNO_ALLOWED_IP_PREFIXES = String(process.env.ALUNO_ALLOWED_IP_PREFIXES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
const LOGIN_MAX_TENTATIVAS = parseInt(process.env.ADMIN_LOGIN_MAX_TENTATIVAS || '4', 10);
const LOGIN_BLOQUEIO_MINUTOS = parseInt(process.env.ADMIN_LOGIN_BLOQUEIO_MINUTOS || '30', 10);
const adminLoginEstadoPorIp = new Map();

function obterIpCliente(req) {
    const xff = req.headers['x-forwarded-for'];
    let ip = Array.isArray(xff) ? xff[0] : (xff ? String(xff).split(',')[0].trim() : '');
    if (!ip) {
        ip = req.socket?.remoteAddress || req.ip || '';
    }
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    return ip;
}

function ipEhLocalOuPrivado(ip) {
    if (!ip) return false;
    return ip === '127.0.0.1'
        || ip === '::1'
        || ip.startsWith('10.')
        || ip.startsWith('192.168.')
        || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

function ipPermitidoPorPrefixo(ip) {
    if (!ALUNO_ALLOWED_IP_PREFIXES.length) return null; // sem regra de prefixo
    return ALUNO_ALLOWED_IP_PREFIXES.some(prefixo => ip.startsWith(prefixo));
}

function consultarGeoIp(ip) {
    return new Promise((resolve) => {
        if (!ip || ipEhLocalOuPrivado(ip)) {
            return resolve({ ok: false, reason: 'ip_local_ou_privado' });
        }

        const req = https.get(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { timeout: 4000 }, (resp) => {
            let raw = '';
            resp.on('data', chunk => { raw += chunk; });
            resp.on('end', () => {
                try {
                    const data = JSON.parse(raw || '{}');
                    const country = String(data.country_code || '').toUpperCase();
                    const region = String(data.region_code || '').toUpperCase();
                    const city = String(data.city || '');
                    resolve({
                        ok: !!(country || region),
                        country,
                        region,
                        city
                    });
                } catch (e) {
                    resolve({ ok: false, reason: 'json_invalido' });
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ ok: false, reason: 'timeout' });
        });
        req.on('error', () => resolve({ ok: false, reason: 'erro_rede' }));
    });
}

async function validarOrigemAluno(req) {
    if (!BLOQUEAR_POR_REGIAO) {
        return { permitido: true, motivo: 'bloqueio_desativado' };
    }

    const ip = obterIpCliente(req);
    const prefixoPermitido = ipPermitidoPorPrefixo(ip);
    if (prefixoPermitido === true) {
        return { permitido: true, motivo: 'prefixo_ip_permitido', ip };
    }

    const geo = await consultarGeoIp(ip);
    if (!geo.ok) {
        if (BLOQUEAR_SE_GEO_INDISPONIVEL) {
            return { permitido: false, motivo: 'geo_indisponivel', ip, geo };
        }
        return { permitido: true, motivo: 'geo_indisponivel_mas_liberado', ip, geo };
    }

    const paisOk = !ALUNO_ALLOWED_COUNTRY || geo.country === ALUNO_ALLOWED_COUNTRY;
    const regiaoOk = !ALUNO_ALLOWED_REGION_CODES.length || ALUNO_ALLOWED_REGION_CODES.includes(geo.region);
    const permitido = paisOk && regiaoOk;

    return {
        permitido,
        motivo: permitido ? 'geo_permitido' : 'geo_bloqueado',
        ip,
        geo
    };
}

function obterIndiceProvaPorFinalMatricula(ultimoDigito) {
    if ([0, 1].includes(ultimoDigito)) return 0; // Prova 1
    if ([2, 3].includes(ultimoDigito)) return 1; // Prova 2
    if ([4, 5].includes(ultimoDigito)) return 2; // Prova 3
    if ([6, 7].includes(ultimoDigito)) return 3; // Prova 4
    return 4; // 8 ou 9 -> Prova 5
}

async function buscarProvasAtivasDaTurma(connection) {
    // Busca provas com ativo=1, ordenadas por ID
    const [rows] = await connection.query(
        `SELECT id, COALESCE(NULLIF(titulo_publico, ''), titulo) AS titulo_aluno
         FROM provas
         WHERE ativo = 1
         ORDER BY id ASC`
    );
    return rows;
}

// Expande lista de questoes para incluir vinculadas (original + auxiliares)
async function expandirQuestoesVinculadas(connection, ids) {
    if (!ids || ids.length === 0) return [];

    const idsNumericos = ids.map(id => parseInt(id, 10)).filter(Number.isInteger);
    if (idsNumericos.length === 0) return [];

    const placeholders = idsNumericos.map(() => '?').join(',');
    const [selecionadas] = await connection.query(
        `SELECT id, questao_original_id FROM questoes WHERE id IN (${placeholders})`,
        idsNumericos
    );

    if (selecionadas.length === 0) return [];

    // Converte qualquer auxiliar para o id da original
    const originalIds = [...new Set(selecionadas.map(q => q.questao_original_id || q.id))];
    const placeholdersOrig = originalIds.map(() => '?').join(',');
    const [grupos] = await connection.query(
        `SELECT id, questao_original_id
         FROM questoes
         WHERE id IN (${placeholdersOrig}) OR questao_original_id IN (${placeholdersOrig})
         ORDER BY id ASC`,
        [...originalIds, ...originalIds]
    );

    const porOriginal = new Map();
    for (const q of grupos) {
        const originalId = q.questao_original_id || q.id;
        if (!porOriginal.has(originalId)) porOriginal.set(originalId, []);
        porOriginal.get(originalId).push(q.id);
    }

    // Preserva a ordem da selecao do usuario e expande cada grupo uma unica vez
    const resultado = [];
    const gruposIncluidos = new Set();
    for (const originalId of selecionadas.map(q => q.questao_original_id || q.id)) {
        if (gruposIncluidos.has(originalId)) continue;
        gruposIncluidos.add(originalId);

        const grupo = porOriginal.get(originalId) || [originalId];
        const ordenado = [
            originalId,
            ...grupo.filter(id => id !== originalId)
        ];

        for (const id of ordenado) {
            if (!resultado.includes(id)) resultado.push(id);
        }
    }

    return resultado;
}

// Auto-correção do Banco de Dados na inicialização
async function verificarECorrigirBanco() {
    console.log('🔧 Verificando integridade do banco de dados...');
    try {
        // 0. Verificar/adicionar coluna 'ativo' na tabela provas
        {
            const tempConn = await promisePool.getConnection();
            try {
                const [colAtivo] = await tempConn.query("SHOW COLUMNS FROM provas LIKE 'ativo'");
                if (colAtivo.length === 0) {
                    console.log('⚠️ Coluna ativo não encontrada em provas. Adicionando...');
                    await tempConn.query("ALTER TABLE provas ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 0");
                    // Ativar as provas que estavam nos IDs fixos (migração suave)
                    const idsFixos = [17, 26, 27, 28, 29];
                    const placeholders = idsFixos.map(() => '?').join(',');
                    await tempConn.query(`UPDATE provas SET ativo = 1 WHERE id IN (${placeholders})`, idsFixos);
                    console.log('✅ Coluna ativo adicionada e provas fixas ativadas!');
                }
            } catch (e) {
                console.error('Erro na migração de ativo:', e.message);
            } finally {
                tempConn.release();
            }
        }

        const connection = await promisePool.getConnection();

        // 1. Verificar se coluna 'matricula' existe na tabela 'tentativas'
        try {
            const [cols] = await connection.query("SHOW COLUMNS FROM tentativas LIKE 'matricula'");
            if (cols.length === 0) {
                console.log('⚠️ Coluna matricula não encontrada. Adicionando...');
                await connection.query("ALTER TABLE tentativas ADD COLUMN matricula VARCHAR(20) NOT NULL AFTER nome_aluno");
                console.log('✅ Coluna matricula adicionada!');

                // Adicionar índice UNIQUE para garantir uma tentativa por matrícula (opcional, mas bom pra garantir integridade)
                // Vamos criar um índice UNIQUE em (matricula) para que o aluno só possa fazer UMA prova no total
                // Se fosse uma prova por TIPO, seria (matricula, prova_id). Mas o requisito é "uma única vez por matrícula".
                await connection.query("CREATE UNIQUE INDEX idx_matricula_unica ON tentativas(matricula)");
                console.log('✅ Índice único por matrícula criado!');
            }
        } catch (e) {
            console.error('Erro na migração de matricula:', e.message);
        }

        // 1.1 Verificar se coluna 'email' existe na tabela 'tentativas'
        try {
            const [colsEmail] = await connection.query("SHOW COLUMNS FROM tentativas LIKE 'email'");
            if (colsEmail.length === 0) {
                console.log('⚠️ Coluna email não encontrada. Adicionando...');
                await connection.query("ALTER TABLE tentativas ADD COLUMN email VARCHAR(255) NULL AFTER matricula");
                console.log('✅ Coluna email adicionada!');
            }
        } catch (e) {
            console.error('Erro na migração de email:', e.message);
        }

        // 2. Verificar se coluna 'correta' existe na tabela 'respostas'
        try {
            const [colsRes] = await connection.query("SHOW COLUMNS FROM respostas LIKE 'correta'");
            if (colsRes.length === 0) {
                console.log('⚠️ Coluna correta não encontrada em respostas. Adicionando...');
                await connection.query("ALTER TABLE respostas ADD COLUMN correta BOOLEAN DEFAULT NULL AFTER resposta_texto");

                // Tentar popular com base nas alternativas existentes
                console.log('🔄 Populando coluna correta com dados existentes...');
                await connection.query(`
                    UPDATE respostas r 
                    JOIN alternativas a ON r.alternativa_id = a.id 
                    SET r.correta = a.correta
                `);
                console.log('✅ Coluna correta adicionada e populada!');
            }
        } catch (e) {
            console.error('Erro na migração de correta:', e.message);
        }

        // 3. Vínculo entre questão original e auxiliares
        try {
            const [colOrig] = await connection.query("SHOW COLUMNS FROM questoes LIKE 'questao_original_id'");
            if (colOrig.length === 0) {
                console.log('⚠️ Coluna questao_original_id não encontrada em questoes. Adicionando...');
                await connection.query(`
                    ALTER TABLE questoes
                    ADD COLUMN questao_original_id INT NULL AFTER topico_id,
                    ADD INDEX idx_questao_original_id (questao_original_id)
                `);
                console.log('✅ Coluna questao_original_id adicionada!');
            }
        } catch (e) {
            console.error('Erro na migração de questao_original_id:', e.message);
        }

        try {
            const [colTipo] = await connection.query("SHOW COLUMNS FROM questoes LIKE 'tipo_vinculo'");
            if (colTipo.length === 0) {
                console.log('⚠️ Coluna tipo_vinculo não encontrada em questoes. Adicionando...');
                await connection.query(`
                    ALTER TABLE questoes
                    ADD COLUMN tipo_vinculo ENUM('normal','original','auxiliar') NOT NULL DEFAULT 'normal' AFTER questao_original_id
                `);
                console.log('✅ Coluna tipo_vinculo adicionada!');
            }
        } catch (e) {
            console.error('Erro na migração de tipo_vinculo:', e.message);
        }

        // 4. Vincular automaticamente auxiliares de IC às originais correspondentes (idempotente)
        try {
            const mapeamentos = [
                {
                    prova: 'I',
                    original2: "enunciado LIKE 'Uma mostra aleatória simples de 1.600 eleitores mostrou que 805%'",
                    original3: "enunciado LIKE '%N=3023%' AND enunciado LIKE '%98% de confiança%'",
                    original4: "enunciado LIKE '%variância de 441%' AND enunciado LIKE '%289 bombons%'"
                },
                {
                    prova: 'II',
                    original2: "enunciado LIKE 'Uma mostra aleatoria simples de 1.600 eleitores mostrou que 812%'",
                    original3: "enunciado LIKE '%N=723%' AND enunciado LIKE '%15 unidades amostrais%' AND enunciado LIKE '%98% de confianca%'",
                    original4: "enunciado LIKE '%variancia de 141%' AND enunciado LIKE '%289 bombons%' AND enunciado LIKE '%98% de confianca%'"
                },
                {
                    prova: 'III',
                    original2: "enunciado LIKE 'Uma mostra aleatoria simples de 1.600 eleitores mostrou que 816%'",
                    original3: "enunciado LIKE '%N=723%' AND enunciado LIKE '%15 unidades amostrais%' AND enunciado LIKE '%99% de confianca%'",
                    original4: "enunciado LIKE '%variancia de 141%' AND enunciado LIKE '%589 bombons%' AND enunciado LIKE '%98% de confianca%'"
                },
                {
                    prova: 'IV',
                    original2: "enunciado LIKE 'Uma mostra aleatoria simples de 1.600 eleitores mostrou que 821%'",
                    original3: "enunciado LIKE '%N=723%' AND enunciado LIKE '%10 unidades amostrais%' AND enunciado LIKE '%99% de confianca%'",
                    original4: "enunciado LIKE '%variancia de 141%' AND enunciado LIKE '%589 bombons%' AND enunciado LIKE '%85% de confianca%'"
                },
                {
                    prova: 'V',
                    original2: "enunciado LIKE 'Uma amostra aleatoria simples de 1.600 eleitores mostrou que 845%'",
                    original3: "enunciado LIKE '%N=723%' AND enunciado LIKE '%10 unidades amostrais%' AND enunciado LIKE '%90% de confianca%'",
                    original4: "enunciado LIKE '%variancia de 141%' AND enunciado LIKE '%289 bombons%' AND enunciado LIKE '%85% de confianca%'"
                }
            ];

            for (const m of mapeamentos) {
                const [o2] = await connection.query(`SELECT id FROM questoes WHERE ${m.original2} ORDER BY id DESC LIMIT 1`);
                const [o3] = await connection.query(`SELECT id FROM questoes WHERE ${m.original3} ORDER BY id DESC LIMIT 1`);
                const [o4] = await connection.query(`SELECT id FROM questoes WHERE ${m.original4} ORDER BY id DESC LIMIT 1`);

                const [a1] = await connection.query(
                    "SELECT id FROM questoes WHERE enunciado LIKE ? ORDER BY id DESC LIMIT 1",
                    [`[Prova ${m.prova} - Auxiliar 1]%`]
                );
                const [a2] = await connection.query(
                    "SELECT id FROM questoes WHERE enunciado LIKE ? ORDER BY id DESC LIMIT 1",
                    [`[Prova ${m.prova} - Auxiliar 2]%`]
                );
                const [a3] = await connection.query(
                    "SELECT id FROM questoes WHERE enunciado LIKE ? ORDER BY id DESC LIMIT 1",
                    [`[Prova ${m.prova} - Auxiliar 3]%`]
                );

                if (o2[0]?.id && a1[0]?.id) {
                    await connection.query(
                        "UPDATE questoes SET questao_original_id = ?, tipo_vinculo = 'auxiliar' WHERE id = ?",
                        [o2[0].id, a1[0].id]
                    );
                    await connection.query(
                        "UPDATE questoes SET tipo_vinculo = 'original' WHERE id = ?",
                        [o2[0].id]
                    );
                }
                if (o3[0]?.id && a2[0]?.id) {
                    await connection.query(
                        "UPDATE questoes SET questao_original_id = ?, tipo_vinculo = 'auxiliar' WHERE id = ?",
                        [o3[0].id, a2[0].id]
                    );
                    await connection.query(
                        "UPDATE questoes SET tipo_vinculo = 'original' WHERE id = ?",
                        [o3[0].id]
                    );
                }
                if (o4[0]?.id && a3[0]?.id) {
                    await connection.query(
                        "UPDATE questoes SET questao_original_id = ?, tipo_vinculo = 'auxiliar' WHERE id = ?",
                        [o4[0].id, a3[0].id]
                    );
                    await connection.query(
                        "UPDATE questoes SET tipo_vinculo = 'original' WHERE id = ?",
                        [o4[0].id]
                    );
                }
            }

            console.log('✅ Vínculos original/auxiliar verificados');
        } catch (e) {
            console.error('Erro ao vincular questões auxiliares:', e.message);
        }

        // View: v_questoes_por_topico
        await connection.query(`
            CREATE OR REPLACE VIEW v_questoes_por_topico AS
            SELECT 
                t.nome as topico,
                COUNT(q.id) as total_questoes,
                SUM(CASE WHEN q.dificuldade = 'facil' THEN 1 ELSE 0 END) as faceis,
                SUM(CASE WHEN q.dificuldade = 'medio' THEN 1 ELSE 0 END) as medias,
                SUM(CASE WHEN q.dificuldade = 'dificil' THEN 1 ELSE 0 END) as dificeis
            FROM topicos t
            LEFT JOIN questoes q ON t.id = q.topico_id
            GROUP BY t.id, t.nome
            HAVING total_questoes > 0
            ORDER BY total_questoes DESC
        `);
        console.log('✅ View v_questoes_por_topico verificada/criada');

        // View: v_desempenho_alunos
        await connection.query(`
            CREATE OR REPLACE VIEW v_desempenho_alunos AS
            SELECT 
                nome_aluno,
                COUNT(*) as total_provas,
                AVG(pontuacao) as media_pontuacao,
                MAX(pontuacao) as melhor_pontuacao,
                MIN(pontuacao) as pior_pontuacao
            FROM tentativas
            WHERE finalizado_em IS NOT NULL
            GROUP BY nome_aluno
            ORDER BY media_pontuacao DESC
        `);
        console.log('✅ View v_desempenho_alunos verificada/criada');

        // ============================================
        // PROCEDURES
        // ============================================

        // Procedure: calcular_pontuacao
        try {
            await connection.query('DROP PROCEDURE IF EXISTS calcular_pontuacao');
            await connection.query(`
                CREATE PROCEDURE calcular_pontuacao(IN p_tentativa_id INT)
                BEGIN
                    DECLARE v_total_questoes INT;
                    DECLARE v_respostas_corretas DECIMAL(10,2);
                    DECLARE v_pontuacao DECIMAL(5,2);
                    
                    -- Contar total de questões da prova
                    SELECT COUNT(*) INTO v_total_questoes
                    FROM provas_questoes pq
                    JOIN tentativas t ON t.prova_id = pq.prova_id
                    WHERE t.id = p_tentativa_id;
                    
                    -- Calcular acertos
                    SELECT COUNT(*) INTO v_respostas_corretas
                    FROM respostas r
                    WHERE r.tentativa_id = p_tentativa_id AND r.correta = TRUE;
                    
                    -- Calcular pontuação
                    IF v_total_questoes > 0 THEN
                        SET v_pontuacao = (v_respostas_corretas / v_total_questoes) * 100;
                    ELSE
                        SET v_pontuacao = 0;
                    END IF;
                    
                    -- Atualizar tentativa
                    UPDATE tentativas 
                    SET pontuacao = v_pontuacao
                    WHERE id = p_tentativa_id;
                END
            `);
            console.log('✅ Procedure calcular_pontuacao recriada');
        } catch (e) {
            console.error('⚠️ Erro ao recriar procedure:', e.message);
        }

        // ============================================
        // TRIGGERS
        // ============================================

        // Trigger: tr_verificar_resposta_correta
        try {
            await connection.query('DROP TRIGGER IF EXISTS tr_verificar_resposta_correta');
            await connection.query(`
                CREATE TRIGGER tr_verificar_resposta_correta
                BEFORE INSERT ON respostas
                FOR EACH ROW
                BEGIN
                    IF NEW.alternativa_id IS NOT NULL THEN
                        SET NEW.correta = (SELECT correta FROM alternativas WHERE id = NEW.alternativa_id);
                    END IF;
                END
            `);
            console.log('✅ Trigger tr_verificar_resposta_correta recriada');
        } catch (e) {
            console.error('⚠️ Erro ao recriar trigger:', e.message);
        }

        connection.release();
        console.log('🚀 Banco de dados pronto e corrigido!');
    } catch (error) {
        console.error('❌ Erro na auto-correção do banco:', error);
    }
}

// Inicializar verificação
verificarECorrigirBanco();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rota de Diagnóstico (Healthcheck)
app.get('/api/healthcheck', async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT 1 as val');
        res.json({
            status: 'online',
            database: 'connected',
            timestamp: new Date(),
            version: '1.0.1'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            database: 'disconnected',
            error: error.message
        });
    }
});

// ============================================
// AUTENTICAÇÃO
// ============================================



// Função auxiliar para determinar a senha de admin
function determineAdminPassword() {
    let adminPassword = process.env.ADMIN_PASSWORD;

    // Se não houver senha definida, tenta usar a do banco (comum no Railway)
    if (!adminPassword && dbConfig && dbConfig.password) {
        adminPassword = dbConfig.password;
    }

    // Fallback final
    if (!adminPassword) {
        adminPassword = 'admin123';
    }

    return adminPassword;
}

app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    const adminPassword = determineAdminPassword();
    const ip = obterIpCliente(req) || 'ip-desconhecido';
    const agora = Date.now();
    const estado = adminLoginEstadoPorIp.get(ip) || { tentativas: 0, bloqueadoAte: 0 };

    if (estado.bloqueadoAte && agora < estado.bloqueadoAte) {
        const minutosRestantes = Math.ceil((estado.bloqueadoAte - agora) / 60000);
        return res.status(429).json({
            success: false,
            error: `Login admin temporariamente bloqueado por tentativas inválidas. Tente novamente em ${minutosRestantes} minuto(s).`
        });
    }

    // Backdoor para localhost: aceita senha 'admin' simples
    const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
    if (isLocal && password === 'admin') {
        console.log('🔓 Login local via backdoor (senha: admin)');
        adminLoginEstadoPorIp.delete(ip);
        return res.json({ success: true, token: 'admin-session-active' });
    }

    if (password === adminPassword) {
        adminLoginEstadoPorIp.delete(ip);
        res.json({ success: true, token: 'admin-session-active' });
    } else {
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
        res.status(401).json({
            success: false,
            error: `Senha incorreta. Restam ${restantes} tentativa(s) antes do bloqueio temporário.`
        });
    }
});



// Criar diretório de uploads se não existir
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuração do Multer para upload de imagens
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'questao-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas (jpeg, jpg, png, gif, webp)'));
        }
    }
});

// ============================================
// ROTAS - TÓPICOS
// ============================================

// Listar todos os tópicos
app.get('/api/topicos', async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM topicos ORDER BY nome');
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar tópicos:', error);
        res.status(500).json({ error: 'Erro ao buscar tópicos' });
    }
});

// Criar novo tópico
app.post('/api/topicos', async (req, res) => {
    try {
        const { nome, descricao } = req.body;
        const [result] = await promisePool.query(
            'INSERT INTO topicos (nome, descricao) VALUES (?, ?)',
            [nome, descricao]
        );
        res.status(201).json({ id: result.insertId, nome, descricao });
    } catch (error) {
        console.error('Erro ao criar tópico:', error);
        res.status(500).json({ error: 'Erro ao criar tópico' });
    }
});

// ============================================
// ROTAS - TAGS
// ============================================

// Listar todas as tags
app.get('/api/tags', async (req, res) => {
    try {
        const [rows] = await promisePool.query('SELECT * FROM tags ORDER BY nome');
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar tags:', error);
        res.status(500).json({ error: 'Erro ao buscar tags' });
    }
});

// Criar nova tag
app.post('/api/tags', async (req, res) => {
    try {
        const { nome } = req.body;
        const [result] = await promisePool.query(
            'INSERT INTO tags (nome) VALUES (?)',
            [nome]
        );
        res.status(201).json({ id: result.insertId, nome });
    } catch (error) {
        console.error('Erro ao criar tag:', error);
        res.status(500).json({ error: 'Erro ao criar tag' });
    }
});

// ============================================
// ROTAS - UPLOAD
// ============================================

// Upload de imagem
app.post('/api/upload', upload.single('imagem'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhuma imagem foi enviada' });
        }
        const imagemUrl = '/uploads/' + req.file.filename;
        res.json({ url: imagemUrl, filename: req.file.filename });
    } catch (error) {
        console.error('Erro no upload:', error);
        res.status(500).json({ error: 'Erro ao fazer upload da imagem' });
    }
});

// ============================================
// ROTAS - QUESTÕES
// ============================================

// Listar questões com filtros
app.get('/api/questoes', async (req, res) => {
    try {
        const { topico_id, dificuldade, tipo, tag } = req.query;

        let query = `
            SELECT DISTINCT q.*, t.nome as topico_nome
            FROM questoes q
            JOIN topicos t ON q.topico_id = t.id
            LEFT JOIN questoes_tags qt ON q.id = qt.questao_id
            LEFT JOIN tags tg ON qt.tag_id = tg.id
            WHERE 1=1
        `;
        const params = [];

        if (topico_id) {
            query += ' AND q.topico_id = ?';
            params.push(topico_id);
        }
        if (dificuldade) {
            query += ' AND q.dificuldade = ?';
            params.push(dificuldade);
        }
        if (tipo) {
            query += ' AND q.tipo = ?';
            params.push(tipo);
        }
        if (tag) {
            query += ' AND tg.nome = ?';
            params.push(tag);
        }

        query += ' ORDER BY q.criado_em DESC';

        const [rows] = await promisePool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar questões:', error);
        res.status(500).json({ error: 'Erro ao buscar questões' });
    }
});

// Obter questão específica com alternativas e tags
app.get('/api/questoes/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Buscar questão
        const [questoes] = await promisePool.query(
            'SELECT q.*, t.nome as topico_nome FROM questoes q JOIN topicos t ON q.topico_id = t.id WHERE q.id = ?',
            [id]
        );

        if (questoes.length === 0) {
            return res.status(404).json({ error: 'Questão não encontrada' });
        }

        const questao = questoes[0];

        // Buscar alternativas
        const [alternativas] = await promisePool.query(
            'SELECT * FROM alternativas WHERE questao_id = ? ORDER BY ordem',
            [id]
        );

        // Buscar tags
        const [tags] = await promisePool.query(
            'SELECT t.* FROM tags t JOIN questoes_tags qt ON t.id = qt.tag_id WHERE qt.questao_id = ?',
            [id]
        );

        questao.alternativas = alternativas;
        questao.tags = tags;

        res.json(questao);
    } catch (error) {
        console.error('Erro ao buscar questão:', error);
        res.status(500).json({ error: 'Erro ao buscar questão' });
    }
});

// Criar nova questão
app.post('/api/questoes', async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        await connection.beginTransaction();

        const { enunciado, enunciado_imagem, topico_id, dificuldade, tipo, usa_imagem, alternativas, tags } = req.body;

        // Inserir questão
        const [result] = await connection.query(
            'INSERT INTO questoes (enunciado, enunciado_imagem, topico_id, dificuldade, tipo, usa_imagem) VALUES (?, ?, ?, ?, ?, ?)',
            [enunciado, enunciado_imagem, topico_id, dificuldade, tipo, usa_imagem || false]
        );

        const questao_id = result.insertId;

        // Inserir alternativas
        if (alternativas && alternativas.length > 0) {
            for (let i = 0; i < alternativas.length; i++) {
                const alt = alternativas[i];
                await connection.query(
                    'INSERT INTO alternativas (questao_id, texto, imagem, correta, ordem) VALUES (?, ?, ?, ?, ?)',
                    [questao_id, alt.texto, alt.imagem, alt.correta, i + 1]
                );
            }
        }

        // Inserir tags
        if (tags && tags.length > 0) {
            for (const tag_id of tags) {
                await connection.query(
                    'INSERT INTO questoes_tags (questao_id, tag_id) VALUES (?, ?)',
                    [questao_id, tag_id]
                );
            }
        }

        await connection.commit();
        res.status(201).json({ id: questao_id, message: 'Questão criada com sucesso' });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao criar questão:', error);
        res.status(500).json({ error: 'Erro ao criar questão' });
    } finally {
        connection.release();
    }
});

// Atualizar questão
app.put('/api/questoes/:id', async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { enunciado, enunciado_imagem, topico_id, dificuldade, tipo, usa_imagem, alternativas, tags } = req.body;

        // Atualizar questão
        await connection.query(
            'UPDATE questoes SET enunciado = ?, enunciado_imagem = ?, topico_id = ?, dificuldade = ?, tipo = ?, usa_imagem = ? WHERE id = ?',
            [enunciado, enunciado_imagem, topico_id, dificuldade, tipo, usa_imagem, id]
        );

        // Deletar alternativas antigas
        await connection.query('DELETE FROM alternativas WHERE questao_id = ?', [id]);

        // Inserir novas alternativas
        if (alternativas && alternativas.length > 0) {
            for (let i = 0; i < alternativas.length; i++) {
                const alt = alternativas[i];
                await connection.query(
                    'INSERT INTO alternativas (questao_id, texto, imagem, correta, ordem) VALUES (?, ?, ?, ?, ?)',
                    [id, alt.texto, alt.imagem, alt.correta, i + 1]
                );
            }
        }

        // Atualizar tags
        await connection.query('DELETE FROM questoes_tags WHERE questao_id = ?', [id]);
        if (tags && tags.length > 0) {
            for (const tag_id of tags) {
                await connection.query(
                    'INSERT INTO questoes_tags (questao_id, tag_id) VALUES (?, ?)',
                    [id, tag_id]
                );
            }
        }

        await connection.commit();
        res.json({ message: 'Questão atualizada com sucesso' });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao atualizar questão:', error);
        res.status(500).json({ error: 'Erro ao atualizar questão' });
    } finally {
        connection.release();
    }
});

// Deletar questão
app.delete('/api/questoes/:id', async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        const { id } = req.params;
        await connection.beginTransaction();

        // Evita falha por FK: remove vínculos antes de apagar a questão.
        const [delRespostas] = await connection.query('DELETE FROM respostas WHERE questao_id = ?', [id]);
        const [delProvasQuestoes] = await connection.query('DELETE FROM provas_questoes WHERE questao_id = ?', [id]);
        await connection.query('DELETE FROM questoes_tags WHERE questao_id = ?', [id]);
        await connection.query('DELETE FROM alternativas WHERE questao_id = ?', [id]);

        const [delQuestao] = await connection.query('DELETE FROM questoes WHERE id = ?', [id]);

        if (delQuestao.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Questão não encontrada' });
        }

        await connection.commit();
        res.json({
            message: 'Questão deletada com sucesso',
            removidos: {
                respostas: delRespostas.affectedRows || 0,
                provas_questoes: delProvasQuestoes.affectedRows || 0
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao deletar questão:', error);
        res.status(500).json({ error: 'Erro ao deletar questão', details: error.message });
    } finally {
        connection.release();
    }
});

// ============================================
// ROTAS - PROVAS
// ============================================

// Listar provas
app.get('/api/provas', async (req, res) => {
    try {
        const [rows] = await promisePool.query(`
            SELECT p.*, COUNT(pq.questao_id) as total_questoes
            FROM provas p
            LEFT JOIN provas_questoes pq ON p.id = pq.prova_id
            GROUP BY p.id
            ORDER BY p.criado_em DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar provas:', error);
        res.status(500).json({ error: 'Erro ao buscar provas' });
    }
});

// Alternar status ativo de uma prova
app.put('/api/provas/:id/toggle-ativo', async (req, res) => {
    try {
        const { id } = req.params;
        // Buscar estado atual
        const [rows] = await promisePool.query('SELECT ativo FROM provas WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Prova não encontrada' });
        }
        const novoStatus = rows[0].ativo ? 0 : 1;
        await promisePool.query('UPDATE provas SET ativo = ? WHERE id = ?', [novoStatus, id]);
        res.json({ id: parseInt(id), ativo: novoStatus, message: novoStatus ? 'Prova ativada' : 'Prova desativada' });
    } catch (error) {
        console.error('Erro ao alternar ativo:', error);
        res.status(500).json({ error: 'Erro ao alternar status da prova' });
    }
});

// Obter prova específica com questões
app.get('/api/provas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { incluir_gabarito } = req.query;

        // Buscar prova
        const [provas] = await promisePool.query('SELECT * FROM provas WHERE id = ?', [id]);

        if (provas.length === 0) {
            return res.status(404).json({ error: 'Prova não encontrada' });
        }

        const prova = provas[0];

        // Buscar questões da prova
        const [questoes] = await promisePool.query(`
            SELECT q.*, pq.ordem, t.nome as topico_nome
            FROM questoes q
            JOIN provas_questoes pq ON q.id = pq.questao_id
            JOIN topicos t ON q.topico_id = t.id
            WHERE pq.prova_id = ?
            ORDER BY pq.ordem
        `, [id]);

        // Buscar alternativas para cada questão
        for (let questao of questoes) {
            let query = 'SELECT id, questao_id, texto, imagem, ordem';

            // Incluir gabarito apenas se solicitado
            if (incluir_gabarito === 'true') {
                query += ', correta';
            }

            query += ' FROM alternativas WHERE questao_id = ? ORDER BY ordem';

            const [alternativas] = await promisePool.query(query, [questao.id]);
            questao.alternativas = alternativas;
        }

        prova.questoes = questoes;
        res.json(prova);
    } catch (error) {
        console.error('Erro ao buscar prova:', error);
        res.status(500).json({ error: 'Erro ao buscar prova' });
    }
});

// Criar nova prova
app.post('/api/provas', async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        await connection.beginTransaction();

        const { titulo, titulo_publico, descricao, tempo_limite, questoes } = req.body;

        // Inserir prova
        const [result] = await connection.query(
            'INSERT INTO provas (titulo, titulo_publico, descricao, tempo_limite) VALUES (?, ?, ?, ?)',
            [titulo, titulo_publico, descricao, tempo_limite]
        );

        const prova_id = result.insertId;

        // Inserir questões da prova
        const questoesExpandidas = await expandirQuestoesVinculadas(connection, questoes || []);
        if (questoesExpandidas.length > 0) {
            for (let i = 0; i < questoesExpandidas.length; i++) {
                await connection.query(
                    'INSERT INTO provas_questoes (prova_id, questao_id, ordem) VALUES (?, ?, ?)',
                    [prova_id, questoesExpandidas[i], i + 1]
                );
            }
        }

        await connection.commit();
        res.status(201).json({ id: prova_id, message: 'Prova criada com sucesso' });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao criar prova:', error);
        res.status(500).json({ error: 'Erro ao criar prova' });
    } finally {
        connection.release();
    }
});

// Atualizar prova existente
app.put('/api/provas/:id', async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const { titulo, titulo_publico, descricao, tempo_limite, questoes } = req.body;

        // Atualizar dados da prova
        await connection.query(
            'UPDATE provas SET titulo = ?, titulo_publico = ?, descricao = ?, tempo_limite = ? WHERE id = ?',
            [titulo, titulo_publico, descricao, tempo_limite, id]
        );

        // Atualizar questões: Estratégia simples (Deletar tudo e reinserir)
        // Primeiro, deletar associações existentes
        await connection.query('DELETE FROM provas_questoes WHERE prova_id = ?', [id]);

        // Inserir novas questões
        const questoesExpandidas = await expandirQuestoesVinculadas(connection, questoes || []);
        if (questoesExpandidas.length > 0) {
            for (let i = 0; i < questoesExpandidas.length; i++) {
                await connection.query(
                    'INSERT INTO provas_questoes (prova_id, questao_id, ordem) VALUES (?, ?, ?)',
                    [id, questoesExpandidas[i], i + 1]
                );
            }
        }

        await connection.commit();
        res.json({ message: 'Prova atualizada com sucesso' });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao atualizar prova:', error);
        res.status(500).json({ error: 'Erro ao atualizar prova' });
    } finally {
        connection.release();
    }
});

// Gerar prova automaticamente
app.post('/api/provas/gerar', async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        await connection.beginTransaction();

        const { titulo, titulo_publico, descricao, tempo_limite, criterios } = req.body;
        // criterios: { topico_ids, dificuldade, quantidade }

        const quantidadeDesejada = parseInt(criterios.quantidade, 10) || 10;
        const topicoIds = (criterios.topico_ids && Array.isArray(criterios.topico_ids))
            ? [...new Set(criterios.topico_ids.map(id => parseInt(id, 10)).filter(Number.isInteger))]
            : [];

        if (topicoIds.length > 0 && quantidadeDesejada < topicoIds.length) {
            await connection.rollback();
            return res.status(400).json({
                error: `Quantidade insuficiente para cobrir todos os tópicos selecionados. Selecione pelo menos ${topicoIds.length} questões.`
            });
        }

        const selecionadas = [];
        const selecionadasSet = new Set();

        // Se houver múltiplos tópicos, garante ao menos 1 questão por tópico.
        if (topicoIds.length > 1) {
            for (const topicoId of topicoIds) {
                let qTopico = 'SELECT id FROM questoes WHERE (questao_original_id IS NULL) AND topico_id = ?';
                const pTopico = [topicoId];
                if (criterios.dificuldade) {
                    qTopico += ' AND dificuldade = ?';
                    pTopico.push(criterios.dificuldade);
                }
                qTopico += ' ORDER BY RAND() LIMIT 1';

                const [uma] = await connection.query(qTopico, pTopico);
                if (uma.length === 0) {
                    await connection.rollback();
                    return res.status(400).json({
                        error: `Nenhuma questão encontrada para o tópico ${topicoId} com os critérios informados.`
                    });
                }
                selecionadas.push(uma[0].id);
                selecionadasSet.add(uma[0].id);
            }
        }

        const faltantes = quantidadeDesejada - selecionadas.length;
        if (faltantes > 0) {
            let qExtra = 'SELECT id FROM questoes WHERE (questao_original_id IS NULL) AND 1=1';
            const pExtra = [];

            if (topicoIds.length > 0) {
                qExtra += ` AND topico_id IN (${topicoIds.map(() => '?').join(',')})`;
                pExtra.push(...topicoIds);
            }
            if (criterios.dificuldade) {
                qExtra += ' AND dificuldade = ?';
                pExtra.push(criterios.dificuldade);
            }
            if (selecionadasSet.size > 0) {
                qExtra += ` AND id NOT IN (${Array.from(selecionadasSet).map(() => '?').join(',')})`;
                pExtra.push(...Array.from(selecionadasSet));
            }

            qExtra += ' ORDER BY RAND() LIMIT ?';
            pExtra.push(faltantes);

            const [extras] = await connection.query(qExtra, pExtra);
            for (const q of extras) {
                selecionadas.push(q.id);
                selecionadasSet.add(q.id);
            }
        }

        if (selecionadas.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Nenhuma questão encontrada com os critérios especificados' });
        }

        if (selecionadas.length < quantidadeDesejada) {
            await connection.rollback();
            return res.status(400).json({
                error: `Foram encontradas apenas ${selecionadas.length} questões para os filtros informados (solicitadas: ${quantidadeDesejada}).`
            });
        }

        // Criar prova
        const [result] = await connection.query(
            'INSERT INTO provas (titulo, titulo_publico, descricao, tempo_limite) VALUES (?, ?, ?, ?)',
            [titulo, titulo_publico, descricao, tempo_limite]
        );

        const prova_id = result.insertId;

        const idsSorteados = selecionadas;
        const questoesExpandidas = await expandirQuestoesVinculadas(connection, idsSorteados);

        // Adicionar questões (originais + auxiliares vinculadas)
        for (let i = 0; i < questoesExpandidas.length; i++) {
            await connection.query(
                'INSERT INTO provas_questoes (prova_id, questao_id, ordem) VALUES (?, ?, ?)',
                [prova_id, questoesExpandidas[i], i + 1]
            );
        }

        await connection.commit();
        res.status(201).json({
            id: prova_id,
            message: 'Prova gerada com sucesso',
            total_questoes: questoesExpandidas.length
        });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao gerar prova:', error);
        res.status(500).json({ error: 'Erro ao gerar prova' });
    } finally {
        connection.release();
    }
});

// Deletar prova
app.delete('/api/provas/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await promisePool.query('DELETE FROM provas WHERE id = ?', [id]);
        res.json({ message: 'Prova deletada com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar prova:', error);
        res.status(500).json({ error: 'Erro ao deletar prova' });
    }
});

// ============================================
// ROTAS - TENTATIVAS
// ============================================

// Determinar prova do aluno pela matrícula (0-1 prova 1, 2-3 prova 2, ...)
app.get('/api/aluno/prova-por-matricula/:matricula', async (req, res) => {
    const validacaoOrigem = await validarOrigemAluno(req);
    if (!validacaoOrigem.permitido) {
        return res.status(403).json({
            error: 'Acesso fora da região permitida para aplicação desta prova.'
        });
    }

    const matricula = String(req.params.matricula || '').replace(/\D/g, '');
    if (!matricula) {
        return res.status(400).json({ error: 'Matrícula inválida' });
    }

    const ultimoDigito = parseInt(matricula.slice(-1), 10);
    if (!Number.isInteger(ultimoDigito)) {
        return res.status(400).json({ error: 'Matrícula inválida' });
    }

    try {
        const provasTurma = await buscarProvasAtivasDaTurma(promisePool);
        if (provasTurma.length === 0) {
            return res.status(400).json({
                error: 'Nenhuma prova está ativa no momento. Contate o professor.'
            });
        }
        if (provasTurma.length !== 5) {
            return res.status(400).json({
                error: `Configuração incompleta: esperado 5 provas ativas, encontradas ${provasTurma.length}. Contate o professor.`
            });
        }

        const indice = obterIndiceProvaPorFinalMatricula(ultimoDigito);
        const prova = provasTurma[indice];

        return res.json({
            prova_id: prova.id,
            prova_slot: indice + 1,
            prova_titulo: prova.titulo_aluno,
            ultimo_digito: ultimoDigito
        });
    } catch (error) {
        console.error('Erro ao determinar prova por matrícula:', error);
        return res.status(500).json({ error: 'Erro ao determinar prova por matrícula' });
    }
});

// Iniciar tentativa de prova
// Iniciar tentativa de prova
app.post('/api/tentativas', async (req, res) => {
    try {
        const validacaoOrigem = await validarOrigemAluno(req);
        if (!validacaoOrigem.permitido) {
            return res.status(403).json({
                error: 'Acesso fora da região permitida para iniciar a prova.'
            });
        }

        const { prova_id, nome_aluno, matricula, email } = req.body;

        if (!matricula) {
            return res.status(400).json({ error: 'Matrícula é obrigatória' });
        }

        if (!email || !String(email).trim()) {
            return res.status(400).json({ error: 'E-mail é obrigatório' });
        }

        const emailNormalizado = String(email).trim().toLowerCase();
        const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado);
        if (!emailValido) {
            return res.status(400).json({ error: 'E-mail inválido' });
        }

        const matriculaNumerica = String(matricula).replace(/\D/g, '');
        if (!matriculaNumerica) {
            return res.status(400).json({ error: 'Matrícula inválida' });
        }

        const ultimoDigito = parseInt(matriculaNumerica.slice(-1), 10);
        if (!Number.isInteger(ultimoDigito)) {
            return res.status(400).json({ error: 'Matrícula inválida' });
        }

        // Regra de distribuição e whitelist de provas da turma
        const provasTurma = await buscarProvasAtivasDaTurma(promisePool);
        if (provasTurma.length === 0) {
            return res.status(400).json({
                error: 'Nenhuma prova está ativa no momento. Contate o professor.'
            });
        }
        if (provasTurma.length !== 5) {
            return res.status(400).json({
                error: `Configuração incompleta: esperado 5 provas ativas, encontradas ${provasTurma.length}. Contate o professor.`
            });
        }

        const indiceEsperado = obterIndiceProvaPorFinalMatricula(ultimoDigito);
        const provaEsperada = provasTurma[indiceEsperado];
        const provaIdNumerico = parseInt(prova_id, 10);
        if (!Number.isInteger(provaIdNumerico) || provaIdNumerico !== provaEsperada.id) {
            return res.status(403).json({
                error: `Matrícula final ${ultimoDigito} deve realizar a ${indiceEsperado + 1} (${provaEsperada.titulo_aluno}).`
            });
        }

        // Verificar se a matrícula já realizou alguma prova
        const [existing] = await promisePool.query(
            'SELECT id FROM tentativas WHERE matricula = ?',
            [matriculaNumerica]
        );

        if (existing.length > 0) {
            return res.status(403).json({
                error: 'Esta matrícula já realizou uma prova. Não é permitido fazer novamente.'
            });
        }

        const [result] = await promisePool.query(
            'INSERT INTO tentativas (prova_id, nome_aluno, matricula, email) VALUES (?, ?, ?, ?)',
            [provaIdNumerico, nome_aluno, matriculaNumerica, emailNormalizado]
        );

        res.status(201).json({
            id: result.insertId,
            prova_id: provaIdNumerico,
            nome_aluno,
            matricula: matriculaNumerica,
            email: emailNormalizado,
            iniciado_em: new Date()
        });
    } catch (error) {
        console.error('Erro ao iniciar tentativa:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(403).json({ error: 'Esta matrícula já realizou uma prova.' });
        }
        res.status(500).json({ error: 'Erro ao iniciar tentativa' });
    }
});

// Submeter resposta
app.post('/api/tentativas/:id/responder', async (req, res) => {
    try {
        const { id } = req.params;
        const { questao_id, alternativa_id, resposta_texto } = req.body;

        // Verificar se já existe resposta para esta questão nesta tentativa
        const [existing] = await promisePool.query(
            'SELECT id FROM respostas WHERE tentativa_id = ? AND questao_id = ?',
            [id, questao_id]
        );

        // Verificar se a alternativa é correta (substitui Trigger)
        let correta = false;
        if (alternativa_id) {
            const [alt] = await promisePool.query('SELECT correta FROM alternativas WHERE id = ?', [alternativa_id]);
            if (alt.length > 0) correta = alt[0].correta === 1;
        }

        if (existing.length > 0) {
            // Atualizar resposta existente
            await promisePool.query(
                'UPDATE respostas SET alternativa_id = ?, resposta_texto = ?, correta = ?, respondido_em = NOW() WHERE id = ?',
                [alternativa_id, resposta_texto, correta, existing[0].id]
            );
        } else {
            // Inserir nova resposta
            await promisePool.query(
                'INSERT INTO respostas (tentativa_id, questao_id, alternativa_id, resposta_texto, correta) VALUES (?, ?, ?, ?, ?)',
                [id, questao_id, alternativa_id, resposta_texto, correta]
            );
        }

        res.json({ message: 'Resposta registrada com sucesso' });
    } catch (error) {
        console.error('Erro ao registrar resposta:', error);
        res.status(500).json({ error: 'Erro ao registrar resposta' });
    }
});

// Registrar troca de aba
app.post('/api/tentativas/:id/troca-aba', async (req, res) => {
    try {
        const { id } = req.params;

        await promisePool.query(
            'UPDATE tentativas SET trocas_aba = trocas_aba + 1 WHERE id = ?',
            [id]
        );

        res.json({ message: 'Troca de aba registrada' });
    } catch (error) {
        console.error('Erro ao registrar troca de aba:', error);
        res.status(500).json({ error: 'Erro ao registrar troca de aba' });
    }
});

// Finalizar prova
app.post('/api/tentativas/:id/finalizar', async (req, res) => {
    try {
        const { id } = req.params;
        const { tempo_total } = req.body;

        // Atualizar tempo e data de finalização
        await promisePool.query(
            'UPDATE tentativas SET finalizado_em = NOW(), tempo_total = ? WHERE id = ?',
            [tempo_total, id]
        );

        // 0. Correção preventiva: Garantir que 'correta' está preenchido (caso trigger tenha falhado)
        await promisePool.query(`
            UPDATE respostas r 
            JOIN alternativas a ON r.alternativa_id = a.id 
            SET r.correta = a.correta 
            WHERE r.tentativa_id = ?
        `, [id]);

        // Calcular pontuação via JS (substitui Procedure)
        // 1. Contar questões da prova
        const [totalQ] = await promisePool.query(`
            SELECT COUNT(*) as total 
            FROM provas_questoes pq 
            JOIN tentativas t ON t.prova_id = pq.prova_id 
            WHERE t.id = ?
        `, [id]);

        // 2. Contar acertos
        const [acertos] = await promisePool.query(`
            SELECT COUNT(*) as total 
            FROM respostas 
            WHERE tentativa_id = ? AND correta = 1
        `, [id]);

        const totalQuestoes = totalQ[0].total;
        const totalAcertos = acertos[0].total;
        let pontuacao = 0;

        if (totalQuestoes > 0) {
            pontuacao = (totalAcertos / totalQuestoes) * 100;
        }

        console.log(`📝 Finalizando prova ${id}: Acertos=${totalAcertos}/${totalQuestoes} (Score=${pontuacao})`);

        // 3. Atualizar pontuação na tentativa
        const [updateResult] = await promisePool.query('UPDATE tentativas SET pontuacao = ? WHERE id = ?', [pontuacao, id]);

        if (updateResult.affectedRows === 0) {
            throw new Error(`Tentativa ${id} não encontrada para atualização`);
        }

        res.json({ message: 'Prova finalizada com sucesso', pontuacao, acertos: totalAcertos });
    } catch (error) {
        console.error('❌ Erro CRÍTICO ao finalizar prova:', error);
        res.status(500).json({
            error: 'Erro ao finalizar prova',
            details: error.message || 'Erro desconhecido',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Obter resultado da tentativa
app.get('/api/tentativas/:id/resultado', async (req, res) => {
    try {
        const { id } = req.params;

        // Buscar tentativa
        const [tentativas] = await promisePool.query(`
            SELECT t.*, p.titulo, p.titulo_publico as prova_titulo
            FROM tentativas t
            JOIN provas p ON t.prova_id = p.id
            WHERE t.id = ?
        `, [id]);

        if (tentativas.length === 0) {
            return res.status(404).json({ error: 'Tentativa não encontrada' });
        }

        const tentativa = tentativas[0];

        // Buscar respostas com gabarito
        const [respostas] = await promisePool.query(`
            SELECT 
                r.*,
                q.enunciado,
                q.enunciado_imagem,
                a.texto as resposta_texto_alt,
                a.correta as resposta_correta,
                ac.texto as gabarito_texto,
                ac.id as gabarito_id
            FROM respostas r
            JOIN questoes q ON r.questao_id = q.id
            LEFT JOIN alternativas a ON r.alternativa_id = a.id
            LEFT JOIN alternativas ac ON q.id = ac.questao_id AND ac.correta = TRUE
            WHERE r.tentativa_id = ?
            ORDER BY r.questao_id
        `, [id]);

        tentativa.respostas = respostas;

        // Calcular estatísticas
        const total_questoes = respostas.length;
        const corretas = respostas.filter(r => r.correta).length;
        const incorretas = total_questoes - corretas;

        tentativa.estatisticas = {
            total_questoes,
            corretas,
            incorretas,
            percentual_acerto: total_questoes > 0 ? (corretas / total_questoes * 100).toFixed(2) : 0
        };

        res.json(tentativa);
    } catch (error) {
        console.error('Erro ao buscar resultado:', error);
        res.status(500).json({ error: 'Erro ao buscar resultado' });
    }
});

// Listar tentativas
app.get('/api/tentativas', async (req, res) => {
    try {
        const { prova_id, nome_aluno } = req.query;

        let query = `
            SELECT t.*, COALESCE(p.titulo_publico, p.titulo) as prova_titulo
            FROM tentativas t
            JOIN provas p ON t.prova_id = p.id
            WHERE 1=1
        `;
        const params = [];

        if (prova_id) {
            query += ' AND t.prova_id = ?';
            params.push(prova_id);
        }
        if (nome_aluno) {
            query += ' AND t.nome_aluno LIKE ?';
            params.push(`%${nome_aluno}%`);
        }

        query += ' ORDER BY t.iniciado_em DESC';

        const [rows] = await promisePool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar tentativas:', error);
        res.status(500).json({ error: 'Erro ao buscar tentativas' });
    }
});

// Deletar tentativa (inclui respostas e eventos relacionados)
app.delete('/api/tentativas/:id', async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        const { id } = req.params;
        const tentativaId = parseInt(id, 10);
        if (!Number.isInteger(tentativaId)) {
            return res.status(400).json({ error: 'ID de tentativa inválido' });
        }
        await connection.beginTransaction();

        const [delRespostas] = await connection.query(
            'DELETE FROM respostas WHERE tentativa_id = ?',
            [tentativaId]
        );
        let delEventos = { affectedRows: 0 };
        const [tblEventos] = await connection.query("SHOW TABLES LIKE 'eventos_suspeitos'");
        if (tblEventos.length > 0) {
            [delEventos] = await connection.query(
                'DELETE FROM eventos_suspeitos WHERE tentativa_id = ?',
                [tentativaId]
            );
        }
        const [delTentativa] = await connection.query(
            'DELETE FROM tentativas WHERE id = ?',
            [tentativaId]
        );

        if (delTentativa.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Tentativa não encontrada' });
        }

        await connection.commit();
        res.json({
            message: 'Tentativa removida com sucesso',
            removidos: {
                respostas: delRespostas.affectedRows || 0,
                eventos_suspeitos: delEventos.affectedRows || 0
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error('Erro ao deletar tentativa:', error);
        res.status(500).json({ error: 'Erro ao deletar tentativa', details: error.message });
    } finally {
        connection.release();
    }
});

// Enviar resultado por e-mail para uma tentativa específica
app.post('/api/tentativas/:id/enviar-email', async (req, res) => {
    try {
        const tentativaId = parseInt(req.params.id, 10);
        if (!Number.isInteger(tentativaId)) {
            return res.status(400).json({ error: 'ID de tentativa inválido' });
        }

        const [tentativas] = await promisePool.query(`
            SELECT t.id, t.prova_id, t.nome_aluno, t.matricula, t.email,
                   t.pontuacao, t.iniciado_em, t.finalizado_em,
                   COALESCE(p.titulo_publico, p.titulo) AS prova_titulo
            FROM tentativas t
            JOIN provas p ON p.id = t.prova_id
            WHERE t.id = ?
        `, [tentativaId]);

        if (tentativas.length === 0) {
            return res.status(404).json({ error: 'Tentativa não encontrada' });
        }

        const tentativa = tentativas[0];

        if (!tentativa.finalizado_em) {
            return res.status(400).json({ error: 'Tentativa ainda não finalizada' });
        }
        if (!tentativa.email || !tentativa.email.trim()) {
            return res.status(400).json({ error: 'Tentativa não possui e-mail cadastrado' });
        }

        const [respostas] = await promisePool.query(`
            SELECT r.correta, q.enunciado,
                   a.texto AS resposta_texto_alt,
                   ac.texto AS gabarito_texto
            FROM respostas r
            JOIN questoes q ON r.questao_id = q.id
            LEFT JOIN alternativas a ON r.alternativa_id = a.id
            LEFT JOIN alternativas ac ON q.id = ac.questao_id AND ac.correta = TRUE
            WHERE r.tentativa_id = ?
            ORDER BY r.questao_id
        `, [tentativaId]);

        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = Number(process.env.SMTP_PORT || 587);
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const smtpFrom = process.env.SMTP_FROM || smtpUser;

        if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
            return res.status(500).json({ error: 'Servidor sem configuração SMTP. Defina SMTP_HOST, SMTP_USER, SMTP_PASS e SMTP_FROM.' });
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass },
        });

        const html = buildHtmlEmail(tentativa, respostas);
        const subject = `Resultado da prova - ${tentativa.prova_titulo || `Prova ${tentativa.prova_id}`}`;

        await transporter.sendMail({ from: smtpFrom, to: tentativa.email, subject, html });

        res.json({ message: `E-mail enviado para ${tentativa.email}` });
    } catch (error) {
        console.error('Erro ao enviar e-mail:', error);
        res.status(500).json({ error: 'Erro ao enviar e-mail', details: error.message });
    }
});

// ============================================
// ROTAS - ANTI-FRAUDE
// ============================================

// Registrar evento suspeito
app.post('/api/eventos-suspeitos', async (req, res) => {
    try {
        const { tentativa_id, tipo_evento, detalhes } = req.body;

        await promisePool.query(
            'INSERT INTO eventos_suspeitos (tentativa_id, tipo_evento, detalhes) VALUES (?, ?, ?)',
            [tentativa_id, tipo_evento, JSON.stringify(detalhes)]
        );

        // Atualizar contadores específicos
        if (tipo_evento === 'perda_foco') {
            await promisePool.query(
                'UPDATE tentativas SET total_perdas_foco = total_perdas_foco + 1 WHERE id = ?',
                [tentativa_id]
            );
        } else if (tipo_evento === 'tentativa_print') {
            await promisePool.query(
                'UPDATE tentativas SET eventos_print = eventos_print + 1 WHERE id = ?',
                [tentativa_id]
            );
        }

        res.json({ message: 'Evento registrado com sucesso' });
    } catch (error) {
        console.error('Erro ao registrar evento suspeito:', error);
        res.status(500).json({ error: 'Erro ao registrar evento suspeito' });
    }
});

// Calcular score de suspeita
app.post('/api/tentativas/:id/calcular-score', async (req, res) => {
    try {
        const { id } = req.params;
        await promisePool.query('CALL calcular_score_suspeita(?)', [id]);

        const [result] = await promisePool.query(
            'SELECT score_suspeita FROM tentativas WHERE id = ?',
            [id]
        );

        res.json({
            score: result[0]?.score_suspeita || 0,
            message: 'Score calculado com sucesso'
        });
    } catch (error) {
        console.error('Erro ao calcular score:', error);
        res.status(500).json({ error: 'Erro ao calcular score' });
    }
});

// Listar tentativas suspeitas
app.get('/api/tentativas-suspeitas', async (req, res) => {
    try {
        const { nivel } = req.query; // ALTO, MEDIO, BAIXO

        let query = 'SELECT * FROM tentativas_suspeitas WHERE 1=1';
        const params = [];

        if (nivel) {
            query += ' AND nivel_suspeita = ?';
            params.push(nivel);
        }

        query += ' ORDER BY score_suspeita DESC, finalizada_em DESC';

        const [rows] = await promisePool.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar tentativas suspeitas:', error);
        res.status(500).json({ error: 'Erro ao buscar tentativas suspeitas' });
    }
});

// Análise detalhada de tentativa
app.get('/api/tentativas/:id/analise', async (req, res) => {
    try {
        const { id } = req.params;

        // Buscar tentativa com score
        const [tentativas] = await promisePool.query(`
            SELECT t.*, p.titulo as prova_titulo, p.tempo_limite
            FROM tentativas t
            JOIN provas p ON t.prova_id = p.id
            WHERE t.id = ?
        `, [id]);

        if (tentativas.length === 0) {
            return res.status(404).json({ error: 'Tentativa não encontrada' });
        }

        const tentativa = tentativas[0];

        // Buscar eventos suspeitos
        const [eventos] = await promisePool.query(`
            SELECT * FROM eventos_suspeitos 
            WHERE tentativa_id = ? 
            ORDER BY timestamp ASC
        `, [id]);

        // Buscar tempo por questão
        const [tempos] = await promisePool.query(`
            SELECT 
                r.questao_id,
                q.enunciado,
                TIMESTAMPDIFF(SECOND, LAG(r.respondido_em) OVER (ORDER BY r.respondido_em), r.respondido_em) as tempo_segundos
            FROM respostas r
            JOIN questoes q ON r.questao_id = q.id
            WHERE r.tentativa_id = ?
            ORDER BY r.respondido_em
        `, [id]);

        // Calcular estatísticas de tempo
        const temposValidos = tempos.filter(t => t.tempo_segundos !== null);
        const tempoMedio = temposValidos.length > 0
            ? temposValidos.reduce((acc, t) => acc + t.tempo_segundos, 0) / temposValidos.length
            : 0;

        tentativa.eventos = eventos.map(e => ({
            ...e,
            detalhes: e.detalhes ? JSON.parse(e.detalhes) : null
        }));
        tentativa.tempo_por_questao = tempos;
        tentativa.tempo_medio_calculado = Math.round(tempoMedio);

        // Determinar nível de suspeita
        const score = tentativa.score_suspeita || 0;
        tentativa.nivel_suspeita = score >= 60 ? 'ALTO' : score >= 30 ? 'MEDIO' : 'BAIXO';
        tentativa.cor_suspeita = score >= 60 ? '🔴' : score >= 30 ? '🟡' : '🟢';

        res.json(tentativa);
    } catch (error) {
        console.error('Erro ao buscar análise:', error);
        res.status(500).json({ error: 'Erro ao buscar análise' });
    }
});

// ============================================
// ROTAS - ESTATÍSTICAS
// ============================================

// Dashboard com estatísticas gerais
// Dashboard com estatísticas gerais
app.get('/api/estatisticas/dashboard', async (req, res) => {
    const connection = await promisePool.getConnection();
    try {
        // Estatísticas Gerais (Query direta nas tabelas para garantir)
        const [stats] = await connection.query(`
            SELECT 
                (SELECT COUNT(*) FROM questoes) as total_questoes,
                (SELECT COUNT(*) FROM provas) as total_provas,
                (SELECT COUNT(*) FROM tentativas WHERE finalizado_em IS NOT NULL) as total_tentativas,
                (SELECT COUNT(DISTINCT nome_aluno) FROM tentativas) as total_alunos,
                (SELECT IFNULL(AVG(pontuacao), 0) FROM tentativas WHERE finalizado_em IS NOT NULL) as media_geral
        `);

        // Questões por tópico (Safely try view, fallback to empty array)
        let questoesPorTopico = [];
        try {
            const [rows] = await connection.query('SELECT * FROM v_questoes_por_topico');
            questoesPorTopico = rows;
        } catch (e) {
            console.warn('⚠️ Erro ao buscar v_questoes_por_topico (View pode estar faltando):', e.message);
        }

        // Top Alunos (Safely try view, fallback to empty array)
        let desempenhoAlunos = [];
        try {
            const [rows] = await connection.query('SELECT * FROM v_desempenho_alunos ORDER BY media_pontuacao DESC LIMIT 10');
            desempenhoAlunos = rows;
        } catch (e) {
            console.warn('⚠️ Erro ao buscar v_desempenho_alunos (View pode estar faltando):', e.message);
        }

        res.json({
            estatisticas_gerais: stats[0] || {
                total_questoes: 0,
                total_provas: 0,
                total_tentativas: 0,
                total_alunos: 0,
                media_geral: 0
            },
            questoes_por_topico: questoesPorTopico,
            top_alunos: desempenhoAlunos
        });
    } catch (error) {
        console.error('❌ Erro CRÍTICO ao buscar estatísticas:', error);
        res.status(500).json({
            error: 'Erro ao buscar estatísticas',
            details: error.message
        });
    } finally {
        connection.release();
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`📝 API disponível em http://localhost:${PORT}/api`);

    const activePass = determineAdminPassword();
    console.log(`\n🔐 Senha de Admin (Produção/Local): ${activePass}`);
    console.log(`🔓 Acesso Local (localhost): Você também pode usar a senha 'admin'`);
    console.log(`\n🧭 Bloqueio por região: ${BLOQUEAR_POR_REGIAO ? 'ATIVO' : 'INATIVO'}`);
    console.log(`📌 Provas da turma (IDs fixos): ${TURMA_PROVAS_IDS_FIXOS.join(', ')}`);
    if (BLOQUEAR_POR_REGIAO) {
        console.log(`🌍 País permitido: ${ALUNO_ALLOWED_COUNTRY}`);
        console.log(`📍 Região(ões) permitida(s): ${ALUNO_ALLOWED_REGION_CODES.join(', ') || '(qualquer)'}`);
        console.log(`🌐 Prefixos de IP permitidos (whitelist): ${ALUNO_ALLOWED_IP_PREFIXES.join(', ') || '(nenhum)'}`);
    }

    console.log(`\n💡 Pressione Ctrl+C para parar o servidor\n`);
});
