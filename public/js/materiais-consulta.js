// Materiais de consulta — Estatística I e II (pastas separadas em /materiais/)
const MATERIAIS_ESTATISTICA_I = [
    { titulo: 'Aula 01 — Estatística Descritiva', arquivo: 'aula01-descritiva.pdf' },
    { titulo: 'Aula 02 — Técnicas de Contagem', arquivo: 'aula02-contagem.pdf' },
    { titulo: 'Aula 03 — Probabilidade', arquivo: 'aula03-probabilidade.pdf' },
    { titulo: 'Aula 04 — Teorema da Prob. Total e Bayes', arquivo: 'aula04-bayes.pdf' },
    { titulo: 'Aula 05 — Variáveis Aleatórias', arquivo: 'aula05-variaveis.pdf' },
    { titulo: 'Aula 06 — Distribuição Exponencial', arquivo: 'aula06-exponencial.pdf' },
    { titulo: 'Aula 07 — Distribuição Normal', arquivo: 'aula07-normal.pdf' },
    { titulo: 'Tabela normal padrão', arquivo: 'tabela-normal.pdf' },
    { titulo: 'Tabela t de Student', arquivo: 'tabela-t-student.pdf' }
];

const MATERIAIS_ESTATISTICA_II = [
    { titulo: 'Aula 01 — Amostragem', arquivo: 'Slides1Amostragem.pdf' },
    { titulo: 'Aula 02 — Distribuições Amostrais', arquivo: 'Slides2DistribuicoesAmostrais.pdf' },
    { titulo: 'Aula 03 — Estimação Pontual e Intervalar', arquivo: 'Slides3EstimacoesPontualeIntervelar.pdf' },
    { titulo: 'Aula 04 — Testes de Hipóteses', arquivo: 'Slides4TestesdeHipotesesSignificancia.pdf' },
    { titulo: 'Aula 05 — Correlação e Regressão', arquivo: 'Slides5CorrelacLinearRegrSimples.pdf' },
    { titulo: 'Aula 06 — Números-Índices', arquivo: 'Slides6NumerosIndices.pdf' },
    { titulo: 'Formulário e tabelas', arquivo: 'FormularioTabelasCompleto.pdf' }
];

function marcarConsultaMaterial(ativo) {
    window._consultandoMaterialConsulta = ativo;
    window.materialPopup = null;
    if (ativo && typeof window._registrarAberturaPopupProva === 'function') {
        window._registrarAberturaPopupProva();
    }
    if (typeof marcarFocoPlanilha === 'function') {
        marcarFocoPlanilha(ativo);
    }
}

function urlParaViewerPdf(url) {
    const base = String(url || '').split('#')[0];
    return `${base}#navpanes=0&toolbar=0&scrollbar=1&view=Fit`;
}

function abrirMaterialConsulta(url, titulo) {
    marcarConsultaMaterial(true);

    const lista = document.getElementById('materialConsultaLista');
    const viewer = document.getElementById('materialConsultaViewer');
    const frame = document.getElementById('materialConsultaFrame');
    const tituloEl = document.getElementById('materialConsultaTitulo');

    if (!viewer || !frame) return;

    if (tituloEl) tituloEl.textContent = titulo || 'Material de consulta';
    frame.src = urlParaViewerPdf(url);
    viewer.classList.remove('hidden');
    if (lista) lista.classList.add('hidden');

    const wrap = document.getElementById('painelMateriaisConsulta');
    wrap?.classList.add('materiais-consulta-expandido');
    document.getElementById('provaColPlanilha')?.classList.add('col-material-aberto');
    document.body.classList.add('material-consulta-aberto');
}

function fecharMaterialConsulta() {
    marcarConsultaMaterial(false);

    const lista = document.getElementById('materialConsultaLista');
    const viewer = document.getElementById('materialConsultaViewer');
    const frame = document.getElementById('materialConsultaFrame');

    if (frame) frame.src = 'about:blank';
    if (viewer) viewer.classList.add('hidden');
    if (lista) lista.classList.remove('hidden');

    const wrap = document.getElementById('painelMateriaisConsulta');
    wrap?.classList.remove('materiais-consulta-expandido');
    document.getElementById('provaColPlanilha')?.classList.remove('col-material-aberto');
    document.body.classList.remove('material-consulta-aberto');
}

function montarListaMateriais(base, itens) {
    return itens.map((item) => {
        const url = base + encodeURIComponent(item.arquivo);
        const tituloEsc = item.titulo.replace(/'/g, "\\'");
        return `
            <li>
                <button type="button" class="material-consulta-link" onmousedown="marcarConsultaMaterial(true)" onclick="abrirMaterialConsulta('${url}', '${tituloEsc}')">
                    📄 ${item.titulo}
                </button>
            </li>`;
    }).join('');
}

function renderizarMateriaisConsulta() {
    const painel = document.getElementById('painelMateriaisConsulta');
    if (!painel) return;

    const itensI = montarListaMateriais('/materiais/estatistica-i/', MATERIAIS_ESTATISTICA_I);
    const itensII = montarListaMateriais('/materiais/estatistica-ii/', MATERIAIS_ESTATISTICA_II);

    painel.innerHTML = `
        <div class="materiais-consulta">
            <div id="materialConsultaViewer" class="material-consulta-viewer hidden">
                <div class="material-consulta-viewer-header">
                    <span id="materialConsultaTitulo" class="material-consulta-viewer-titulo"></span>
                    <button type="button" class="btn btn-secondary btn-sm material-consulta-fechar" onclick="fecharMaterialConsulta()">← Voltar à lista</button>
                </div>
                <iframe id="materialConsultaFrame" class="material-consulta-frame" title="Material de consulta"></iframe>
            </div>
            <div id="materialConsultaLista">
                <h4>Materiais de consulta</h4>
                <p class="text-muted materiais-consulta-sub">Abre aqui na prova, sem sair da página</p>
                <p class="materiais-consulta-grupo">Estatística Aplicada a Negócios I</p>
                <ul class="materiais-consulta-lista">${itensI}</ul>
                <p class="materiais-consulta-grupo">Estatística Aplicada a Negócios II</p>
                <ul class="materiais-consulta-lista">${itensII}</ul>
            </div>
        </div>
    `;
}
