function variarNumero(valor, seed) {
    const n = Number(valor);
    if (!Number.isFinite(n)) return valor;
    if (n <= 4) return valor;
    if (Number.isInteger(n)) {
        const ajuste = ((seed % 3) + 1) * (seed % 2 === 0 ? 1 : -1);
        const fator = 1 + (seed * 0.02);
        return Math.max(1, Math.round(n * fator + ajuste));
    }
    const casas = String(valor).includes(',') ? 2 : 2;
    const ajuste = seed * 0.03;
    const novo = Math.max(0.01, n * (1 + seed * 0.015) + ajuste);
    return novo.toFixed(casas).replace('.', ',');
}

function variarTexto(texto, seed) {
    if (!texto || seed === 0) return texto;
    return String(texto).replace(/\b\d+(?:[.,]\d+)?\b/g, (match) => {
        const normalizado = match.replace(',', '.');
        const variado = variarNumero(normalizado, seed);
        return String(variado).replace('.', ',');
    });
}

async function clonarQuestao(connection, questaoId, seed) {
    const [[questao]] = await connection.query('SELECT * FROM questoes WHERE id = ?', [questaoId]);
    if (!questao) throw new Error(`Questão ${questaoId} não encontrada`);

    const [ins] = await connection.query(
        `INSERT INTO questoes (
            enunciado, enunciado_imagem, topico_id, questao_original_id, tipo_vinculo,
            dificuldade, tipo, usa_imagem
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            variarTexto(questao.enunciado, seed),
            questao.enunciado_imagem,
            questao.topico_id,
            questao.questao_original_id || questao.id,
            'auxiliar',
            questao.dificuldade,
            questao.tipo,
            questao.usa_imagem
        ]
    );

    const novaId = ins.insertId;
    const [alts] = await connection.query(
        'SELECT texto, imagem, correta, ordem FROM alternativas WHERE questao_id = ? ORDER BY ordem',
        [questaoId]
    );

    for (const alt of alts) {
        await connection.query(
            'INSERT INTO alternativas (questao_id, texto, imagem, correta, ordem) VALUES (?, ?, ?, ?, ?)',
            [novaId, variarTexto(alt.texto, seed), alt.imagem, alt.correta, alt.ordem]
        );
    }

    return novaId;
}

async function clonarProvaAPartirDeBase(connection, {
    baseId,
    titulo,
    descricao,
    seed = 0,
    tempoLimite = null
}) {
    const [[base]] = await connection.query('SELECT * FROM provas WHERE id = ?', [baseId]);
    if (!base) throw new Error(`Prova base ${baseId} não encontrada`);

    const [insProva] = await connection.query(
        'INSERT INTO provas (titulo, titulo_publico, descricao, tempo_limite, ativo) VALUES (?, ?, ?, ?, 1)',
        [
            titulo,
            titulo,
            descricao,
            tempoLimite ?? base.tempo_limite ?? 120
        ]
    );
    const novoProvaId = insProva.insertId;

    const [questoesBase] = await connection.query(
        'SELECT questao_id, ordem, valor_questao FROM provas_questoes WHERE prova_id = ? ORDER BY ordem',
        [baseId]
    );

    for (const item of questoesBase) {
        const novaQuestaoId = await clonarQuestao(connection, item.questao_id, seed);
        await connection.query(
            'INSERT INTO provas_questoes (prova_id, questao_id, ordem, valor_questao) VALUES (?, ?, ?, ?)',
            [novoProvaId, novaQuestaoId, item.ordem, item.valor_questao || 1]
        );
    }

    return { id: novoProvaId, totalQuestoes: questoesBase.length };
}

async function removerProvasPorPrefixo(connection, prefixo) {
    const [antigas] = await connection.query(
        'SELECT id FROM provas WHERE titulo LIKE ? OR titulo_publico LIKE ?',
        [`${prefixo}%`, `${prefixo}%`]
    );

    for (const prova of antigas) {
        const [questoesAntigas] = await connection.query(
            'SELECT questao_id FROM provas_questoes WHERE prova_id = ?',
            [prova.id]
        );
        await connection.query('DELETE FROM provas_questoes WHERE prova_id = ?', [prova.id]);
        await connection.query('DELETE FROM provas WHERE id = ?', [prova.id]);
        for (const q of questoesAntigas) {
            await connection.query('DELETE FROM alternativas WHERE questao_id = ?', [q.questao_id]);
            await connection.query('DELETE FROM questoes WHERE id = ?', [q.questao_id]);
        }
    }

    return antigas.map((p) => p.id);
}

module.exports = {
    variarNumero,
    variarTexto,
    clonarQuestao,
    clonarProvaAPartirDeBase,
    removerProvasPorPrefixo
};
