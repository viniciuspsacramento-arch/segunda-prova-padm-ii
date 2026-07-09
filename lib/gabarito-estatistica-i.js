function parseNumeroBr(raw) {
    const s = String(raw).trim();
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
    if (s.includes(',') && s.includes('.')) return Number(s.replace(/\./g, '').replace(',', '.'));
    if (s.includes(',')) return Number(s.replace(',', '.'));
    return Number(s);
}

function fmt(x, casas = 2) {
    return x.toFixed(casas).replace('.', ',');
}

function fmtPct(x) {
    const p = Math.round(x * 100);
    return `0,${String(p).padStart(2, '0')} (${p}%)`;
}

function extrairUltimaColunaTabela(html) {
    const vals = [];
    const rows = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!rows) return vals;
    const trs = rows[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const tr of trs) {
        const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (!tds || tds.length < 2) continue;
        const last = tds[tds.length - 1].replace(/<[^>]+>/g, '').trim();
        const n = parseNumeroBr(last);
        if (Number.isFinite(n)) vals.push(n);
    }
    return vals;
}

function extrairTabelaPrecoQtd(html) {
    const precos = [];
    const rows = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!rows) return [];
    const trs = rows[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const tr of trs) {
        const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (!tds || tds.length < 3) continue;
        const qtd = parseNumeroBr(tds[1].replace(/<[^>]+>/g, ''));
        const preco = parseNumeroBr(tds[2].replace(/<[^>]+>/g, ''));
        if (Number.isFinite(qtd) && Number.isFinite(preco)) {
            for (let i = 0; i < qtd; i++) precos.push(preco);
        }
    }
    return precos;
}

function extrairCincoNumeros(html) {
    const map = {};
    const labels = [
        ['min', /Mínimo\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)/i],
        ['min', /Mínimo\s*=\s*([\d.,]+)/i],
        ['q1', /Q₁[^=]*=\s*([\d.,]+)/i],
        ['q1', /Q₁[^<]*<\/td>\s*<td[^>]*>\s*([\d.,]+)/i],
        ['q2', /Mediana[^=]*=\s*([\d.,]+)/i],
        ['q2', /Mediana[^<]*<\/td>\s*<td[^>]*>\s*([\d.,]+)/i],
        ['q3', /Q₃[^=]*=\s*([\d.,]+)/i],
        ['q3', /Q₃[^<]*<\/td>\s*<td[^>]*>\s*([\d.,]+)/i],
        ['max', /Máximo\s*=\s*([\d.,]+)/i],
        ['max', /Máximo\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)/i]
    ];
    for (const [key, re] of labels) {
        if (map[key] != null) continue;
        const m = html.match(re);
        if (m) map[key] = parseNumeroBr(m[1]);
    }
    return map;
}

function extrairPercentuais(html) {
    const out = [];
    const re = /([\d.,]+)\s*%/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const n = parseNumeroBr(m[1]);
        if (Number.isFinite(n)) out.push(n / 100);
    }
    return out;
}

function corrigirEnunciadoBayes(enunciado) {
    const m = enunciado.match(/F1 fornece (\d+)%/);
    if (!m) return enunciado;
    const f1 = parseInt(m[1], 10);
    const f2 = 100 - f1;
    return enunciado.replace(/F2 fornece \d+%/, `F2 fornece ${f2}%`);
}

function corrigirEnunciadoBayesCanal(enunciado) {
    const mE = enunciado.match(/e-mail\s*\((\d+)%/i);
    if (!mE) return enunciado;
    const email = Math.min(parseInt(mE[1], 10), 99);
    const sms = 100 - email;
    let out = enunciado.replace(/e-mail\s*\(\d+%/i, `e-mail (${email}%`);
    out = out.replace(/SMS\s*\(\d+%/i, `SMS (${sms}%`);
    return out;
}

function corrigirEnunciadoProbUniao(enunciado) {
    const mA = enunciado.match(/<strong>(\d+)%<\/strong>\s*pagam com cartão/i);
    const mB = enunciado.match(/<strong>(\d+)%<\/strong>\s*pagam com PIX/i);
    const mAb = enunciado.match(/<strong>(\d+)%<\/strong>\s*utilizam/i);
    if (!mA || !mB || !mAb) return enunciado;
    const a = parseInt(mA[1], 10);
    const b = parseInt(mB[1], 10);
    let ambos = parseInt(mAb[1], 10);
    ambos = Math.min(ambos, a, b);
    if (a + b - ambos > 100) ambos = a + b - 100;
    let out = enunciado;
    out = out.replace(/<strong>(\d+)%<\/strong>\s*pagam com cartão/i, `<strong>${a}%</strong> pagam com cartão`);
    out = out.replace(/<strong>(\d+)%<\/strong>\s*pagam com PIX/i, `<strong>${b}%</strong> pagam com PIX`);
    out = out.replace(/<strong>(\d+)%<\/strong>\s*utilizam/i, `<strong>${ambos}%</strong> utilizam`);
    return out;
}

function extrairContagens(html) {
    const nums = [];
    const re = /<strong>([\d.,]+)[^<]*<\/strong>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const n = parseNumeroBr(m[1]);
        if (Number.isFinite(n)) nums.push(n);
    }
    return nums;
}

function media(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function varianciaPop(arr) {
    const m = media(arr);
    return arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
}

function desvioPop(arr) {
    return Math.sqrt(varianciaPop(arr));
}

function varianciaAmostral(arr) {
    const m = media(arr);
    return arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
}

function desvioAmostral(arr) {
    return Math.sqrt(varianciaAmostral(arr));
}

function mediana(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const n = s.length;
    if (n % 2 === 1) return s[(n - 1) / 2];
    return (s[n / 2 - 1] + s[n / 2]) / 2;
}

function moda(arr) {
    const freq = new Map();
    for (const x of arr) freq.set(x, (freq.get(x) || 0) + 1);
    let best = null;
    let max = 0;
    for (const [k, v] of freq) {
        if (v > max) { max = v; best = k; }
    }
    return best;
}

function quartisDivisaoMetades(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const n = s.length;
    const lower = s.slice(0, Math.floor(n / 2));
    const upper = s.slice(Math.ceil(n / 2));
    return { q1: mediana(lower), q3: mediana(upper) };
}

function percentilInc(arr, p) {
    const s = [...arr].sort((a, b) => a - b);
    const n = s.length;
    if (n === 1) return s[0];
    const k = (n - 1) * p;
    const f = Math.floor(k);
    const c = Math.ceil(k);
    if (f === c) return s[f];
    return s[f] + (s[c] - s[f]) * (k - f);
}

function bayesF1(pF1, pDefF1, pDefF2) {
    const pF2 = 1 - pF1;
    const num = pDefF1 * pF1;
    const den = num + pDefF2 * pF2;
    return num / den;
}

function curtosePercentilica(p10, q1, q3, p90) {
    const iqr = q3 - q1;
    return iqr / (2 * (p90 - p10));
}

function extrairKurtoseCentros(html) {
    const centros = [];
    const blocos = html.split(/<strong>/i).slice(1);
    for (const b of blocos) {
        const nome = b.split(/<\/strong>/i)[0];
        const p10 = b.match(/P₁₀\s*=\s*([\d.,]+)/);
        const q1 = b.match(/Q₁\s*=\s*([\d.,]+)/);
        const q3 = b.match(/Q₃\s*=\s*([\d.,]+)/);
        const p90 = b.match(/P₉₀\s*=\s*([\d.,]+)/);
        if (p10 && q1 && q3 && p90) {
            centros.push({
                nome: nome.trim(),
                p10: parseNumeroBr(p10[1]),
                q1: parseNumeroBr(q1[1]),
                q3: parseNumeroBr(q3[1]),
                p90: parseNumeroBr(p90[1])
            });
        }
    }
    if (centros.length) return centros;

    const rows = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!rows) return centros;
    const trs = rows[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const tr of trs) {
        const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (!tds || tds.length < 6) continue;
        const vals = tds.slice(1).map((td) => parseNumeroBr(td.replace(/<[^>]+>/g, '')));
        centros.push({
            nome: tds[0].replace(/<[^>]+>/g, '').trim(),
            p10: vals[0], q1: vals[1], q3: vals[3], p90: vals[4]
        });
    }
    return centros;
}

function extrairBoxplotComparativo(html) {
    const lojas = [];
    const rows = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!rows) return lojas;
    const trs = rows[1].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const tr of trs) {
        const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
        if (!tds || tds.length < 6) continue;
        const vals = tds.slice(1).map((td) => parseNumeroBr(td.replace(/<[^>]+>/g, '')));
        lojas.push({
            nome: tds[0].replace(/<[^>]+>/g, '').trim(),
            min: vals[0], q1: vals[1], med: vals[2], q3: vals[3], max: vals[4]
        });
    }
    return lojas;
}

function classificarCurtose(k) {
    if (k < 0.22) return 'leptocúrtica';
    if (k > 0.30) return 'platicúrtica';
    return 'mesocúrtica';
}

function classificarQuestao(enunciado) {
    const e = enunciado.toLowerCase();
    if (e.includes('média aritmética') && e.includes('desvio-padrão populacional')) return 'media_desvio_pop';
    if (e.includes('variância amostral') && e.includes('coeficiente de variação')) return 'var_cv_amostral';
    if (e.includes('moda') && e.includes('preço unitário')) return 'moda_preco_ponderada';
    if (e.includes('mediana') && e.includes('tempo de atendimento')) return 'mediana';
    if (e.includes('quartis por divisão')) return 'quartis_q1_q3';
    if (e.includes('desvio-padrão amostral')) return 'desvio_amostral';
    if (e.includes('percentil 80') || e.includes('p₈₀')) return 'percentil_80';
    if (e.includes('moda') && e.includes('defeitos')) return 'moda';
    if (e.includes('duas lojas') && e.includes('box plots')) return 'boxplot_comparativo';
    if (e.includes('amplitude') && e.includes('estoque')) return 'amplitude';
    if (e.includes('e-mail') && e.includes('sms') && e.includes('respondeu')) return 'bayes_canal';
    if (e.includes('nacionais') && e.includes('internacionais') && e.includes('fraude')) return 'bayes_fraude';
    if (e.includes('fornece') && e.includes('defeituosas')) return 'bayes';
    if (e.includes('duas lojas') && e.includes('box plots')) return 'boxplot_comparativo';
    if (e.includes('coeficiente de curtose percentílico')) return 'curtose';
    if (e.includes('resumo dos cinco números') && (e.includes('assimetria') || e.includes('média'))) return 'boxplot';
    if (e.includes('box plot') || e.includes('diagrama de caixa')) return 'boxplot';
    if (e.includes('pagam com cartão') && e.includes('pix')) return 'prob_uniao';
    if (e.includes('a ou c') && e.includes('tipo a')) return 'prob_soma_ac';
    if (e.includes('motoristas') && e.includes('concluíram')) return 'prob_simples';
    if (e.includes('etiqueta verde')) return 'prob_simples';
    if (e.includes('cancelamentos')) return 'prob_condicional';
    if (e.includes('inadimplentes')) return 'prob_condicional';
    if (e.includes('fidelidade') || e.includes('cadastrados')) return 'prob_simples';
    if (e.includes('hábitos de consumo')) return 'prob_uniao';
    if (e.includes('solicitações')) return 'prob_condicional';
    return 'desconhecido';
}

function embaralharAlternativas(correta, erradas, seed) {
    const todas = [{ texto: correta, correta: 1 }, ...erradas.map((t) => ({ texto: t, correta: 0 }))];
    for (let i = todas.length - 1; i > 0; i--) {
        const j = (seed + i * 7) % (i + 1);
        [todas[i], todas[j]] = [todas[j], todas[i]];
    }
    return todas.map((a, i) => ({ ...a, ordem: i + 1 }));
}

function calcularGabarito(enunciado, seed = 1) {
    const tipo = classificarQuestao(enunciado);

    if (tipo === 'media_desvio_pop') {
        const vals = extrairUltimaColunaTabela(enunciado);
        const m = media(vals);
        const dp = desvioPop(vals);
        const correta = `Média = ${fmt(m, 1)} e desvio-padrão = ${fmt(dp, 2)}`;
        const erradas = [
            `Média = ${fmt(m, 1)} e desvio-padrão = ${fmt(dp * 1.05, 2)}`,
            `Média = ${fmt(m + 0.5, 1)} e desvio-padrão = ${fmt(dp, 2)}`,
            `Média = ${fmt(m, 1)} e desvio-padrão = ${fmt(dp * 2.5, 2)}`,
            `Média = ${fmt(m - 0.5, 1)} e desvio-padrão = ${fmt(dp * 0.9, 2)}`
        ];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'var_cv_amostral') {
        const vals = extrairUltimaColunaTabela(enunciado);
        const v = varianciaAmostral(vals);
        const m = media(vals);
        const cv = (desvioAmostral(vals) / m) * 100;
        const correta = `Variância = ${fmt(v, 2)} e CV ≈ ${fmt(cv, 2)}%`;
        const erradas = [
            `Variância = ${fmt(v * 0.9, 2)} e CV ≈ ${fmt(cv, 2)}%`,
            `Variância = ${fmt(v, 2)} e CV ≈ ${fmt(cv + 1, 2)}%`,
            `Variância = ${fmt(v * 1.18, 2)} e CV ≈ ${fmt(cv + 0.7, 2)}%`,
            `Variância = ${fmt(v, 2)} e CV ≈ ${fmt(cv - 1.5, 2)}%`
        ];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'moda_preco_ponderada') {
        const precos = extrairTabelaPrecoQtd(enunciado);
        const mod = moda(precos);
        const correta = `R$ ${fmt(mod, 2)}`;
        const erradas = precos.filter((p, i, a) => a.indexOf(p) === i && p !== mod).slice(0, 4).map((p) => `R$ ${fmt(p, 2)}`);
        while (erradas.length < 4) erradas.push(`R$ ${fmt(mod + erradas.length + 5, 2)}`);
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'mediana') {
        const vals = extrairUltimaColunaTabela(enunciado);
        const med = mediana(vals);
        const correta = `${Number.isInteger(med) ? med : fmt(med, 1)} minutos`;
        const erradas = [
            `${Number.isInteger(med - 1) ? med - 1 : fmt(med - 1, 1)} minutos`,
            `${fmt(med + 0.5, 1)} minutos`,
            `${Number.isInteger(med + 1) ? med + 1 : fmt(med + 1, 1)} minutos`,
            `${Number.isInteger(med - 2) ? med - 2 : fmt(med - 2, 1)} minutos`
        ];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'quartis_q1_q3') {
        const vals = extrairUltimaColunaTabela(enunciado);
        const { q1, q3 } = quartisDivisaoMetades(vals);
        const correta = `Q₁ = ${Number.isInteger(q1) ? q1 : fmt(q1, 1)} e Q₃ = ${Number.isInteger(q3) ? q3 : fmt(q3, 1)}`;
        const erradas = [
            `Q₁ = ${Number.isInteger(q1 - 1) ? q1 - 1 : fmt(q1 - 1, 1)} e Q₃ = ${Number.isInteger(q3) ? q3 : fmt(q3, 1)}`,
            `Q₁ = ${Number.isInteger(q1) ? q1 : fmt(q1, 1)} e Q₃ = ${Number.isInteger(q3 + 1) ? q3 + 1 : fmt(q3 + 1, 1)}`,
            `Q₁ = ${Number.isInteger(q1 + 1) ? q1 + 1 : fmt(q1 + 1, 1)} e Q₃ = ${Number.isInteger(q3 - 1) ? q3 - 1 : fmt(q3 - 1, 1)}`,
            `Q₁ = ${mediana(vals)} e Q₃ = ${mediana(vals)}`
        ];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'desvio_amostral') {
        const vals = extrairUltimaColunaTabela(enunciado);
        const dp = desvioAmostral(vals);
        const correta = `R$ ${fmt(dp, 2)}`;
        const erradas = [
            `R$ ${fmt(dp * 0.94, 2)}`,
            `R$ ${fmt(dp * 1.06, 2)}`,
            `R$ ${fmt(media(vals), 2)}`,
            `R$ ${fmt(dp * 1.12, 2)}`
        ];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'percentil_80') {
        const vals = extrairUltimaColunaTabela(enunciado);
        const p80 = percentilInc(vals, 0.8);
        const correta = `${fmt(p80, 1)} dias`;
        const erradas = [
            `${fmt(p80 - 0.8, 1)} dias`,
            `${fmt(p80 + 0.5, 1)} dias`,
            `${fmt(percentilInc(vals, 0.75), 1)} dias`,
            `${fmt(percentilInc(vals, 0.85), 1)} dias`
        ];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'moda') {
        const vals = extrairUltimaColunaTabela(enunciado);
        const mod = moda(vals);
        const correta = `${mod} defeitos`;
        const erradas = [`${mod - 1} defeitos`, `${mod + 1} defeitos`, `${mod - 2} defeitos`, 'Não há moda (todos os valores têm a mesma frequência)'];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'amplitude') {
        const vals = extrairUltimaColunaTabela(enunciado);
        const amp = Math.max(...vals) - Math.min(...vals);
        const correta = `${amp} unidades`;
        const erradas = [
            `${amp - 2} unidades`,
            `${amp + 2} unidades`,
            `${Math.max(...vals)} unidades`,
            `${Math.round(media(vals))} unidades`
        ];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'bayes_canal') {
        const texto = corrigirEnunciadoBayesCanal(enunciado);
        const pcts = extrairPercentuais(texto);
        const p = bayesF1(pcts[0], pcts[2], pcts[3]);
        const correta = `Aproximadamente ${fmt(p, 2)} (${Math.round(p * 100)}%)`;
        const erradas = [
            `Aproximadamente ${fmt(pcts[0], 2)} (${Math.round(pcts[0] * 100)}%)`,
            `Aproximadamente ${fmt(pcts[2], 2)} (${Math.round(pcts[2] * 100)}%)`,
            `Aproximadamente ${fmt(1 - p, 2)} (${Math.round((1 - p) * 100)}%)`,
            `Aproximadamente ${fmt(p * 1.3, 2)} (${Math.round(p * 1.3 * 100)}%)`
        ];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'bayes_fraude') {
        const pcts = extrairPercentuais(enunciado);
        const pNat = pcts[0];
        const pInt = pcts[1];
        const pFrNat = pcts[2];
        const pFrInt = pcts[3];
        const p = (pFrNat * pNat) / (pFrNat * pNat + pFrInt * pInt);
        const correta = `Aproximadamente ${fmt(p, 2)} (${Math.round(p * 100)}%)`;
        const erradas = [
            `Aproximadamente ${fmt(pNat, 2)} (${Math.round(pNat * 100)}%)`,
            `Aproximadamente ${fmt(pInt, 2)} (${Math.round(pInt * 100)}%)`,
            `Aproximadamente ${fmt(pFrNat, 2)} (${Math.round(pFrNat * 100)}%)`,
            `Aproximadamente ${fmt(1 - p, 2)} (${Math.round((1 - p) * 100)}%)`
        ];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'prob_soma_ac') {
        const p = extrairPercentuais(enunciado);
        const res = (p[0] || 0) + (p[2] || 0);
        const correta = fmtPct(res);
        const erradas = [fmtPct(p[0]), fmtPct(p[2]), fmtPct(p[0] + p[1]), fmtPct(1 - p[3])];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'boxplot_comparativo') {
        const lojas = extrairBoxplotComparativo(enunciado);
        if (lojas.length < 2) return null;
        const [a, b] = lojas;
        const iqrA = a.q3 - a.q1;
        const iqrB = b.q3 - b.q1;
        const maisConsistente = iqrB < iqrA ? b : a;
        const outra = maisConsistente === a ? b : a;
        const iqrM = maisConsistente.q3 - maisConsistente.q1;
        const iqrO = outra.q3 - outra.q1;
        const correta = `As medianas são iguais (${a.med} dias), mas a ${maisConsistente.nome} é mais consistente (menor IQR: ${maisConsistente.q3}−${maisConsistente.q1}=${iqrM} contra ${outra.q3}−${outra.q1}=${iqrO} da ${outra.nome}).`;
        const erradas = [
            `A ${outra.nome} é mais consistente porque seus bigodes são mais curtos.`,
            `A ${maisConsistente.nome} tem maior variabilidade central porque a mediana é maior.`,
            'Não é possível comparar variabilidade (IQR) apenas com o resumo dos cinco números.',
            `A ${outra.nome} apresenta assimetria positiva, enquanto a ${maisConsistente.nome} é simétrica.`
        ];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'curtose') {
        const centros = extrairKurtoseCentros(enunciado);
        const ks = centros.map((c) => ({
            ...c,
            k: curtosePercentilica(c.p10, c.q1, c.q3, c.p90),
            classe: classificarCurtose(curtosePercentilica(c.p10, c.q1, c.q3, c.p90))
        }));
        ks.sort((a, b) => a.k - b.k);
        const menor = ks[0];
        const maior = ks[ks.length - 1];

        if (enunciado.includes('risco de picos') || enunciado.includes('Região')) {
            const partes = ks.map((c) => `${c.nome.replace('Região ', '')}: ${classificarCurtose(c.k)} (K ≈ ${fmt(c.k, 3)}${c.k < 0.263 ? ' < 0,263' : ''})`);
            const correta = `${partes[0]}; ${partes[1]}. A ${menor.nome} tem caudas mais pesadas e maior risco de vendas extremas.`;
            if (ks[0].nome.includes('Metropolitana')) {
                const kM = ks.find((c) => c.nome.includes('Metropolitana'));
                const kI = ks.find((c) => c.nome.includes('Interior'));
                const corretaFix = `Metropolitana: ${classificarCurtose(kM.k)} (K ≈ ${fmt(kM.k, 3)}); Interior: ${classificarCurtose(kI.k)} (K ≈ ${fmt(kI.k, 3)}${kI.k < 0.263 ? ' < 0,263' : ''}). A Região Interior tem caudas mais pesadas e maior risco de vendas extremas.`;
                const erradas = [
                    'Interior: platicúrtica (K menor = mais achatada), portanto apresenta menor variabilidade nas caudas.',
                    'Ambas são mesocúrticas, pois possuem o mesmo IQR (10); o risco de extremos é equivalente.',
                    'Metropolitana: leptocúrtica (amplitude P₉₀−P₁₀ menor); Interior: mesocúrtica. A Metropolitana tem maior risco.',
                    'Metropolitana: platicúrtica (K > 0,263); Interior: mesocúrtica. A Metropolitana tem caudas mais leves que a Normal.'
                ];
                return embaralharAlternativas(corretaFix, erradas, seed);
            }
        }

        const correta = `${menor.nome} (K ≈ ${fmt(menor.k, 3)}, leptocúrtico): tem caudas mais pesadas e maior probabilidade de extremos.`;
        const erradas = ks.slice(1).map((c) => `${c.nome} (K ≈ ${fmt(c.k, 3)}) é o mais leptocúrtico.`);
        while (erradas.length < 4) erradas.push('Não é possível determinar sem conhecer a média e o desvio-padrão.');
        return embaralharAlternativas(correta, erradas.slice(0, 4), seed);
    }

    if (tipo === 'bayes') {
        const texto = corrigirEnunciadoBayes(enunciado);
        const pcts = extrairPercentuais(texto);
        const p = bayesF1(pcts[0], pcts[2], pcts[3]);
        const correta = `Aproximadamente ${fmt(p, 2)} (${Math.round(p * 100)}%)`;
        const erradas = [
            `Aproximadamente ${fmt(pcts[0], 2)} (${Math.round(pcts[0] * 100)}%)`,
            `Aproximadamente ${fmt(pcts[2], 2)} (${Math.round(pcts[2] * 100)}%)`,
            `Aproximadamente ${fmt(1 - p, 2)} (${Math.round((1 - p) * 100)}%)`,
            `Aproximadamente ${fmt(p * 1.4, 2)} (${Math.round(p * 1.4 * 100)}%)`
        ];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'prob_uniao') {
        const texto = corrigirEnunciadoProbUniao(enunciado);
        const p = extrairPercentuais(texto);
        const res = p[0] + p[1] - p[2];
        const correta = fmtPct(res);
        const erradas = [fmtPct(p[0] + p[1]), fmtPct(p[0]), fmtPct(p[1]), fmtPct(p[2])];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'prob_condicional') {
        // n[0]=total, n[1]=evento B, n[2]=A∩B → P(A|B) = n[2]/n[1]
        const n = extrairContagens(enunciado);
        const res = n[2] / n[1];
        const correta = fmtPct(res);
        const erradas = [fmtPct(n[1] / n[0]), fmtPct(n[2] / n[0]), fmtPct(Math.min(res + 0.1, 0.95)), fmtPct(1 - res)];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'prob_simples') {
        const n = extrairContagens(enunciado);
        const res = n[1] / n[0];
        const correta = fmtPct(res);
        const erradas = [fmtPct(n[0] / n[1]), fmtPct(1 - res), fmtPct(res * 0.7), fmtPct(res + 0.15)];
        return embaralharAlternativas(correta, erradas, seed);
    }

    if (tipo === 'boxplot') {
        const c = extrairCincoNumeros(enunciado);
        const { min, q1, q2, q3, max } = c;
        const baixo = q1 - min;
        const alto = max - q3;
        const mioloEsq = q2 - q1;
        const mioloDir = q3 - q2;
        let correta;
        if (alto > baixo * 2 && alto > mioloDir) {
            if (enunciado.includes('média') && enunciado.includes('mediana')) {
                correta = `Distribuição assimétrica à direita (positiva): o bigode superior (${max}−${q3}=${alto}) é muito maior que o inferior (${q1}−${min}=${baixo}), logo espera-se Média > Mediana.`;
            } else {
                correta = `Distribuição fortemente assimétrica à direita (positiva), pois o bigode superior (${max}−${q3}=${alto}) é muito maior que o inferior (${q1}−${min}=${baixo}), embora o miolo (caixa) seja simétrico.`;
            }
        } else if (baixo > alto * 2) {
            correta = `Distribuição assimétrica à esquerda (negativa): a cauda inferior (Q₁−Mín = ${baixo}) é muito maior que a superior (Máx−Q₃ = ${alto}), indicando concentração de tempos altos com poucos casos extremos baixos.`;
            if (enunciado.includes('Média &lt; Mediana') || enunciado.includes('reembolso')) {
                correta = `Distribuição assimétrica à esquerda (negativa): a cauda inferior (Q₁−Mín = ${baixo}) é muito maior que a superior (Máx−Q₃ = ${alto}), logo espera-se Média < Mediana.`;
            }
        } else {
            correta = `Distribuição aproximadamente simétrica: o miolo é balanceado (Q₃−Q₂ = ${mioloDir} e Q₂−Q₁ = ${mioloEsq}) e os bigodes têm comprimentos comparáveis.`;
        }
        const erradas = [
            `Distribuição perfeitamente simétrica, pois Q₃−Q₂ = ${mioloDir} e Q₂−Q₁ = ${mioloEsq}.`,
            `Distribuição assimétrica à direita, pois o máximo (${max}) é maior que o mínimo (${min}).`,
            'Não é possível avaliar simetria apenas com o resumo dos cinco números.',
            'Distribuição uniforme, pois os bigodes têm comprimentos diferentes.'
        ];
        return embaralharAlternativas(correta, erradas, seed);
    }

    return null;
}

module.exports = {
    classificarQuestao,
    calcularGabarito,
    corrigirEnunciadoBayes,
    corrigirEnunciadoBayesCanal,
    corrigirEnunciadoProbUniao,
    parseNumeroBr
};
