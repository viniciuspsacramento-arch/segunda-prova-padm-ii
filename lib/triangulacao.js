/**
 * Triangulação: estimar se a prova foi feita no ambiente presencial (sala/lab)
 * ou remotamente, cruzando IP, geo, cluster do dia, tempo, rajada de respostas e planilha.
 */

function prefixoRede(ip, octetos = 3) {
    if (!ip) return null;
    const limpo = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    const partes = limpo.split('.');
    if (partes.length === 4) {
        return partes.slice(0, octetos).join('.');
    }
    return limpo.slice(0, 24);
}

function ipNoPrefixoPermitido(ip, prefixos) {
    if (!ip || !prefixos?.length) return false;
    const limpo = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    return prefixos.some((p) => limpo.startsWith(p));
}

function cidadePermitida(cidade, permitidas) {
    if (!cidade || !permitidas?.length) return null;
    const norm = String(cidade).trim().toLowerCase();
    return permitidas.some((c) => norm.includes(String(c).trim().toLowerCase()));
}

function calcularRajadaRespostas(respostas, iniciadoEm, finalizadoEm, tempoTotalSeg) {
    if (!respostas?.length) {
        return {
            total: 0,
            pct_ultimos_10pct_tempo: 0,
            pct_ultimos_5min: 0,
            janela_minutos: 0
        };
    }

    const timestamps = respostas
        .map((r) => new Date(r.respondido_em).getTime())
        .filter((t) => Number.isFinite(t))
        .sort((a, b) => a - b);

    if (!timestamps.length) {
        return { total: 0, pct_ultimos_10pct_tempo: 0, pct_ultimos_5min: 0, janela_minutos: 0 };
    }

    const inicio = iniciadoEm ? new Date(iniciadoEm).getTime() : timestamps[0];
    const fim = finalizadoEm
        ? new Date(finalizadoEm).getTime()
        : (tempoTotalSeg ? inicio + tempoTotalSeg * 1000 : timestamps[timestamps.length - 1]);

    const duracaoMs = Math.max(fim - inicio, 1);
    const limiar10 = fim - duracaoMs * 0.1;
    const limiar5min = fim - 5 * 60 * 1000;

    const noUltimos10 = timestamps.filter((t) => t >= limiar10).length;
    const nosUltimos5min = timestamps.filter((t) => t >= limiar5min).length;

    return {
        total: timestamps.length,
        pct_ultimos_10pct_tempo: Math.round((noUltimos10 / timestamps.length) * 100),
        pct_ultimos_5min: Math.round((nosUltimos5min / timestamps.length) * 100),
        janela_minutos: Math.round(duracaoMs / 60000)
    };
}

function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function menorDistanciaCampus(lat, lon, pontos) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !pontos?.length) return null;
    return Math.min(...pontos.map((p) => distanciaKm(lat, lon, p.lat, p.lon)));
}

function classificarTriangulacao({ tentativa, rajada, clusterRede, config }) {
    const sinais = [];
    let scoreSala = 0;
    let scoreRemoto = 0;

    const ip = tentativa.ip_origem || '';
    const prefixos = config.ipPrefixos || [];
    const cidades = config.cidadesCampus || [];
    const minCluster = config.minCluster || 3;
    const rede = prefixoRede(ip);
    const tamanhoCluster = rede && clusterRede?.[rede] ? clusterRede[rede] : 0;

    if (ipNoPrefixoPermitido(ip, prefixos)) {
        scoreSala += 35;
        sinais.push({ tipo: 'SALA', peso: 35, texto: `IP compatível com rede do campus (${ip})` });
    }

    if (tamanhoCluster >= minCluster) {
        scoreSala += 30;
        sinais.push({
            tipo: 'SALA',
            peso: 30,
            texto: `Mesma rede (${rede}.*) que ${tamanhoCluster} alunos no mesmo dia`
        });
    } else if (ip && tamanhoCluster <= 1 && !ipNoPrefixoPermitido(ip, prefixos)) {
        scoreRemoto += 25;
        sinais.push({
            tipo: 'REMOTO',
            peso: 25,
            texto: `IP isolado (${ip || '—'}) — nenhum cluster presencial no dia`
        });
    }

    if (tentativa.gps_latitude != null && tentativa.gps_longitude != null) {
        const lat = Number(tentativa.gps_latitude);
        const lon = Number(tentativa.gps_longitude);
        const raio = config.gpsRaioKm || 35;
        const dist = menorDistanciaCampus(lat, lon, config.campusGpsPontos || []);
        if (dist != null) {
            if (dist <= raio) {
                scoreSala += 30;
                sinais.push({
                    tipo: 'SALA',
                    peso: 30,
                    texto: `GPS do dispositivo a ${dist.toFixed(1)} km do campus (≤ ${raio} km)`
                });
            } else {
                scoreRemoto += 35;
                sinais.push({
                    tipo: 'REMOTO',
                    peso: 35,
                    texto: `GPS do dispositivo a ${dist.toFixed(1)} km do campus`
                });
            }
        } else {
            sinais.push({ tipo: 'INFO', peso: 0, texto: 'GPS registrado, sem referência de campus configurada' });
        }
    }

    if (tentativa.geo_cidade) {
        const okCidade = cidadePermitida(tentativa.geo_cidade, cidades);
        if (okCidade === true) {
            scoreSala += 15;
            sinais.push({ tipo: 'SALA', peso: 15, texto: `Geolocalização: ${tentativa.geo_cidade}` });
        } else if (okCidade === false) {
            scoreRemoto += 30;
            sinais.push({
                tipo: 'REMOTO',
                peso: 30,
                texto: `Cidade distante do campus: ${tentativa.geo_cidade}`
            });
        }
    } else if (!ip) {
        sinais.push({ tipo: 'INFO', peso: 0, texto: 'IP não registrado (prova antiga — triangulação parcial)' });
    }

    const tempoLimiteMin = tentativa.tempo_limite || null;
    const tempoTotal = tentativa.tempo_total || rajada.janela_minutos * 60;
    const nota = tentativa.pontuacao != null ? tentativa.pontuacao / 10 : null;

    if (tempoLimiteMin && tempoTotal > 0) {
        const pctTempo = (tempoTotal / (tempoLimiteMin * 60)) * 100;
        if (pctTempo <= 25 && nota != null && nota >= 7) {
            scoreRemoto += 25;
            sinais.push({
                tipo: 'REMOTO',
                peso: 25,
                texto: `Prova muito rápida (${Math.round(pctTempo)}% do tempo) com nota ${nota.toFixed(1)}`
            });
        }
        if (pctTempo >= 40) {
            scoreSala += 5;
            sinais.push({ tipo: 'SALA', peso: 5, texto: 'Tempo de prova compatível com presencial' });
        }
    }

    if (rajada.total >= 3 && rajada.pct_ultimos_10pct_tempo >= 80) {
        scoreRemoto += 30;
        sinais.push({
            tipo: 'REMOTO',
            peso: 30,
            texto: `${rajada.pct_ultimos_10pct_tempo}% das respostas nos últimos 10% do tempo (rajada)`
        });
    } else if (rajada.total >= 3 && rajada.pct_ultimos_10pct_tempo <= 40) {
        scoreSala += 10;
        sinais.push({ tipo: 'SALA', peso: 10, texto: 'Respostas distribuídas ao longo da prova' });
    }

    if (rajada.pct_ultimos_5min >= 90 && rajada.total >= 5) {
        scoreRemoto += 20;
        sinais.push({
            tipo: 'REMOTO',
            peso: 20,
            texto: `Quase todas as respostas (${rajada.pct_ultimos_5min}%) nos últimos 5 minutos`
        });
    }

    const trocas = tentativa.trocas_aba || 0;
    if (trocas === 0 && nota != null && nota >= 8 && rajada.pct_ultimos_10pct_tempo >= 60) {
        scoreRemoto += 15;
        sinais.push({
            tipo: 'REMOTO',
            peso: 15,
            texto: 'Nota alta, zero trocas de aba e respostas concentradas no fim'
        });
    }

    if (tentativa.planilha_usada === 1) {
        scoreSala += 8;
        sinais.push({ tipo: 'SALA', peso: 8, texto: 'Planilha integrada conectada durante a prova' });
    } else if (tentativa.planilha_usada === 0 && nota != null && nota >= 7) {
        scoreRemoto += 8;
        sinais.push({
            tipo: 'REMOTO',
            peso: 8,
            texto: 'Nota alta sem uso da planilha integrada (pode ter usado celular/Excel externo)'
        });
    }

    const diff = scoreSala - scoreRemoto;
    let contexto = 'INDETERMINADO';
    let confianca = 'BAIXA';

    if (diff >= 20) {
        contexto = 'SALA';
        confianca = diff >= 35 ? 'ALTA' : 'MEDIA';
    } else if (diff <= -20) {
        contexto = 'REMOTO';
        confianca = diff <= -35 ? 'ALTA' : 'MEDIA';
    }

    return {
        contexto,
        confianca,
        score_sala: scoreSala,
        score_remoto: scoreRemoto,
        diferenca: diff,
        sinais,
        rajada,
        rede,
        cluster_tamanho: tamanhoCluster
    };
}

async function analisarCoorteTriangulacao(pool, opcoes = {}) {
    const config = {
        ipPrefixos: opcoes.ipPrefixos || [],
        cidadesCampus: opcoes.cidadesCampus || [],
        minCluster: opcoes.minCluster || 3
    };

    let query = `
        SELECT t.*, p.titulo AS prova_titulo, p.tempo_limite
        FROM tentativas t
        JOIN provas p ON t.prova_id = p.id
        WHERE t.finalizado_em IS NOT NULL
    `;
    const params = [];

    if (opcoes.data) {
        query += ' AND DATE(t.iniciado_em) = ?';
        params.push(opcoes.data);
    }
    if (opcoes.prova_id) {
        query += ' AND t.prova_id = ?';
        params.push(opcoes.prova_id);
    }
    if (Array.isArray(opcoes.prova_ids) && opcoes.prova_ids.length > 0) {
        query += ` AND t.prova_id IN (${opcoes.prova_ids.map(() => '?').join(',')})`;
        params.push(...opcoes.prova_ids);
    }

    query += ' ORDER BY t.iniciado_em ASC';

    const [tentativas] = await pool.query(query, params);

    const clusterRede = {};
    for (const t of tentativas) {
        const rede = prefixoRede(t.ip_origem);
        if (rede) {
            clusterRede[rede] = (clusterRede[rede] || 0) + 1;
        }
    }

    const resultados = [];

    for (const t of tentativas) {
        const [respostas] = await pool.query(
            'SELECT respondido_em FROM respostas WHERE tentativa_id = ? ORDER BY respondido_em',
            [t.id]
        );

        const rajada = calcularRajadaRespostas(
            respostas,
            t.iniciado_em,
            t.finalizado_em,
            t.tempo_total
        );

        const tri = classificarTriangulacao({
            tentativa: t,
            rajada,
            clusterRede,
            config
        });

        resultados.push({
            tentativa_id: t.id,
            nome_aluno: t.nome_aluno,
            matricula: t.matricula,
            email: t.email,
            prova_titulo: t.prova_titulo,
            pontuacao: t.pontuacao,
            nota: t.pontuacao != null ? Number((t.pontuacao / 10).toFixed(1)) : null,
            iniciado_em: t.iniciado_em,
            finalizado_em: t.finalizado_em,
            tempo_total: t.tempo_total,
            trocas_aba: t.trocas_aba,
            ip_origem: t.ip_origem,
            geo_cidade: t.geo_cidade,
            geo_estado: t.geo_estado,
            gps_latitude: t.gps_latitude,
            gps_longitude: t.gps_longitude,
            gps_precisao: t.gps_precisao,
            gps_autorizado: t.gps_autorizado,
            planilha_usada: t.planilha_usada,
            ...tri
        });
    }

    const resumo = {
        total: resultados.length,
        sala: resultados.filter((r) => r.contexto === 'SALA').length,
        remoto: resultados.filter((r) => r.contexto === 'REMOTO').length,
        indeterminado: resultados.filter((r) => r.contexto === 'INDETERMINADO').length,
        clusters_rede: clusterRede
    };

    resultados.sort((a, b) => {
        if (a.contexto === 'REMOTO' && b.contexto !== 'REMOTO') return -1;
        if (b.contexto === 'REMOTO' && a.contexto !== 'REMOTO') return 1;
        return (b.score_remoto - b.score_sala) - (a.score_remoto - a.score_sala);
    });

    return { resumo, resultados, config };
}

module.exports = {
    prefixoRede,
    calcularRajadaRespostas,
    classificarTriangulacao,
    analisarCoorteTriangulacao
};
