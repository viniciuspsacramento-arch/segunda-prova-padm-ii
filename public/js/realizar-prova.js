// ============================================
// REALIZAR PROVA COM PROTEÇÕES ANTI-CÓPIA
// ============================================

let provaAtual = null;
let tentativaAtual = null;
let respostasProva = {};
let questaoAtualIndex = 0;
let timerInterval = null;
let tempoRestante = 0;
let tempoInicio = null;
let trocasAba = 0;
let provaBloqueadaPorTrocas = false;
const GRUPO_PROVA_ATUAL = typeof obterGrupoPorPath === 'function'
    ? obterGrupoPorPath(window.location.pathname)
    : 'padrao';

let exigirGpsProva = true;

async function carregarConfigProvaAluno() {
    try {
        const response = await fetch(`${API_URL}/config/prova-aluno`, { cache: 'no-store' });
        if (response.ok) {
            const data = await response.json();
            exigirGpsProva = data.exigir_gps !== false;
        }
    } catch (_) {
        exigirGpsProva = true;
    }
}

carregarConfigProvaAluno();

function resetGpsModalBotoes() {
    const btnSim = document.getElementById('btnGpsAutorizo');
    const btnNao = document.getElementById('btnGpsNego');
    if (btnSim) {
        btnSim.textContent = 'Autorizo o uso do GPS';
        btnSim.disabled = false;
        btnSim.style.display = '';
    }
    if (btnNao) {
        btnNao.textContent = 'Não autorizo';
        btnNao.disabled = false;
        btnNao.style.display = '';
    }
}

function abrirModalGpsProva() {
    const modal = document.getElementById('modalGpsProva');
    const status = document.getElementById('gpsProvaStatus');
    resetGpsModalBotoes();
    if (status) {
        status.style.display = 'none';
        status.textContent = '';
    }
    if (modal) modal.style.display = 'flex';
}

function fecharModalGpsProva() {
    const modal = document.getElementById('modalGpsProva');
    if (modal) modal.style.display = 'none';
}

function perguntarConsentimentoGps() {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalGpsProva');
        const btnSim = document.getElementById('btnGpsAutorizo');
        const btnNao = document.getElementById('btnGpsNego');
        if (!modal || !btnSim || !btnNao) {
            resolve(false);
            return;
        }

        const limpar = () => {
            btnSim.onclick = null;
            btnNao.onclick = null;
        };

        btnSim.onclick = () => {
            limpar();
            btnSim.disabled = true;
            btnNao.disabled = true;
            resolve(true);
        };
        btnNao.onclick = () => {
            limpar();
            fecharModalGpsProva();
            resolve(false);
        };

        abrirModalGpsProva();
    });
}

function mensagemErroGps(err) {
    if (err.code === 1) {
        return 'Permissão de GPS negada. Sem autorizar o GPS, você não pode realizar a prova.';
    }
    if (err.code === 2) {
        return 'Não foi possível obter a localização. Ative o GPS/localização e tente novamente.';
    }
    return 'Não foi possível obter o GPS agora. Verifique a permissão do navegador e tente novamente.';
}

function obterPosicaoGpsDispositivo() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Seu navegador não suporta GPS. Use Chrome, Edge ou Firefox atualizados.'));
            return;
        }

        abrirModalGpsProva();
        const status = document.getElementById('gpsProvaStatus');
        const btnSim = document.getElementById('btnGpsAutorizo');
        const btnNao = document.getElementById('btnGpsNego');
        if (btnSim) btnSim.style.display = 'none';
        if (btnNao) btnNao.style.display = 'none';
        if (status) {
            status.style.display = 'block';
            status.textContent = 'Obtendo localização... Se o navegador pedir permissão, aceite. Você pode ler com calma — o tempo só conta depois deste passo.';
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                fecharModalGpsProva();
                resetGpsModalBotoes();
                resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    autorizado: true
                });
            },
            (err) => {
                resetGpsModalBotoes();
                reject(new Error(mensagemErroGps(err)));
            },
            { enableHighAccuracy: false, timeout: 120000, maximumAge: 0 }
        );
    });
}

function perguntarRetryGps(mensagem) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalGpsProva');
        const btnSim = document.getElementById('btnGpsAutorizo');
        const btnNao = document.getElementById('btnGpsNego');
        const status = document.getElementById('gpsProvaStatus');
        if (!modal || !btnSim || !btnNao) {
            resolve(false);
            return;
        }

        abrirModalGpsProva();
        if (status) {
            status.style.display = 'block';
            status.textContent = mensagem;
        }

        const limpar = () => {
            btnSim.onclick = null;
            btnNao.onclick = null;
        };

        btnSim.textContent = 'Tentar novamente';
        btnNao.textContent = 'Cancelar';
        btnSim.style.display = '';
        btnNao.style.display = '';
        btnSim.disabled = false;
        btnNao.disabled = false;

        btnSim.onclick = () => {
            limpar();
            fecharModalGpsProva();
            resolve(true);
        };
        btnNao.onclick = () => {
            limpar();
            fecharModalGpsProva();
            resolve(false);
        };
    });
}

async function solicitarGpsParaProva() {
    if (!exigirGpsProva) return null;

    for (;;) {
        const aceitou = await perguntarConsentimentoGps();
        if (!aceitou) {
            throw new Error('Sem autorização de GPS não é possível realizar a prova. Clique em "Autorizo o uso do GPS" para continuar.');
        }

        try {
            return await obterPosicaoGpsDispositivo();
        } catch (error) {
            const tentarDeNovo = await perguntarRetryGps(error.message || 'Não foi possível obter o GPS.');
            if (!tentarDeNovo) throw error;
        }
    }
}

// Limite de trocas de aba/janela antes de bloquear e finalizar a prova automaticamente
const LIMITE_TROCAS_ABA = 3;

// Janelas de duração (ms) de blur que contam como saída:
// 0–800ms  → padrão de Win+Shift+S / recorte rápido.
// > 4s     → ficou em outro app (só conta se NÃO houver planilha aberta,
//            pois com Excel aberto o foco longo fora é o uso legítimo).
// Entre 800ms e 4s → troca de janela normal (ex.: voltar para a planilha), não conta.
const BLUR_CURTO_MAX_MS = 800;
const BLUR_LONGO_MIN_MS = 4000;

// Margem de segurança após abrir o popup da planilha para não contar o
// desvio de foco inicial para a janela recém-aberta.
const POPUP_GRACE_MS = 4000;

let _tsBlurInicio = 0;        // momento em que a janela perdeu o foco
let _tsUltimoPopupAberto = 0; // momento em que a última popup foi aberta

/** Slides/PDF na prova, Excel e login MSAL — não devem gerar falso positivo de saída. */
function usoIntegradoProvaAtivo() {
    if (window._authInteracaoEmAndamento) return true;
    if (window._consultandoMaterialConsulta) return true;
    if (window._focoNaPlanilha) return true;
    if (document.body.classList.contains('material-consulta-aberto')) return true;
    const viewer = document.getElementById('materialConsultaViewer');
    if (viewer && !viewer.classList.contains('hidden')) return true;
    if (window.planilhaPopup && !window.planilhaPopup.closed) return true;
    if (Date.now() - _tsUltimoPopupAberto < POPUP_GRACE_MS) return true;
    return false;
}

// Chamado por ferramentas-prova.js ao abrir qualquer popup (planilha/material)
window._registrarAberturaPopupProva = function () {
    _tsUltimoPopupAberto = Date.now();
};

const SESSAO_PROVA_KEY = 'provaEmAndamento';

window.reportarCompartilhamentoPlanilha = async function (payload) {
    if (!tentativaAtual?.id) return;
    try {
        await fetch(`${API_URL}/tentativas/${tentativaAtual.id}/alerta-compartilhamento`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {})
        });
    } catch (err) {
        console.warn('Falha ao reportar compartilhamento:', err);
    }
};

function salvarSessaoProva() {
    if (!tentativaAtual) return;
    try {
        sessionStorage.setItem(SESSAO_PROVA_KEY, JSON.stringify({
            tentativaId: tentativaAtual.id,
            provaId: tentativaAtual.prova_id,
            nome: tentativaAtual.nome_aluno,
            matricula: tentativaAtual.matricula,
            email: tentativaAtual.email,
            questaoAtualIndex,
            tempoInicio
        }));
    } catch (_) {
        // sessionStorage indisponível — ignora
    }
}

function limparSessaoProva() {
    try {
        sessionStorage.removeItem(SESSAO_PROVA_KEY);
    } catch (_) {
        // ignora
    }
}

async function tentarRetomarProvaAoCarregar() {
    let sessao = null;
    try {
        const raw = sessionStorage.getItem(SESSAO_PROVA_KEY);
        if (raw) sessao = JSON.parse(raw);
    } catch (_) {
        return false;
    }
    if (!sessao?.tentativaId) return false;

    try {
        await retomarProvaPorId(sessao.tentativaId, sessao);
        return true;
    } catch (error) {
        console.error('Não foi possível retomar prova:', error);
        limparSessaoProva();
        return false;
    }
}

async function retomarProvaPorId(tentativaId, sessaoParcial = {}) {
    const response = await fetch(`${API_URL}/aluno/continuar-tentativa/${tentativaId}`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Não foi possível retomar a prova');
    }

    const responseProva = await fetch(`${API_URL}/provas/${data.tentativa.prova_id}`);
    provaAtual = await responseProva.json();
    tentativaAtual = data.tentativa;
    window.tentativaAtual = tentativaAtual;

    respostasProva = {};
    for (const r of data.respostas || []) {
        respostasProva[r.questao_id] = r.alternativa_id;
    }

    questaoAtualIndex = Number.isInteger(sessaoParcial.questaoAtualIndex)
        ? sessaoParcial.questaoAtualIndex
        : 0;
    if (questaoAtualIndex >= provaAtual.questoes.length) {
        questaoAtualIndex = Math.max(0, provaAtual.questoes.length - 1);
    }

    trocasAba = data.tentativa.trocas_aba || 0;
    provaBloqueadaPorTrocas = false;
    tempoInicio = data.tentativa.iniciado_em
        ? new Date(data.tentativa.iniciado_em).getTime()
        : Date.now();

    await exibirInterfaceProva(data.tentativa.nome_aluno);
}

async function exibirInterfaceProva(nomeAluno) {
    if (trocasAba >= LIMITE_TROCAS_ABA) {
        document.getElementById('selecionarProva')?.classList.add('hidden');
        document.getElementById('realizandoProva')?.classList.remove('hidden');
        document.querySelector('header')?.classList.add('hidden');
        montarLayoutProva(nomeAluno);
        ativarProtecoes(nomeAluno);
        await finalizarProvaPorTrocasDeAba();
        return;
    }

    if (provaAtual.tempo_limite) {
        const elapsed = Math.floor((Date.now() - tempoInicio) / 1000);
        tempoRestante = Math.max(0, provaAtual.tempo_limite * 60 - elapsed);
        if (tempoRestante <= 0) {
            document.getElementById('selecionarProva')?.classList.add('hidden');
            document.getElementById('realizandoProva')?.classList.remove('hidden');
            document.querySelector('header')?.classList.add('hidden');
            montarLayoutProva(nomeAluno);
            ativarProtecoes(nomeAluno);
            await finalizarProvaAutomatico();
            return;
        }
        iniciarTimer();
    }

    document.getElementById('selecionarProva').classList.add('hidden');
    document.getElementById('realizandoProva').classList.remove('hidden');
    document.querySelector('header').classList.add('hidden');

    montarLayoutProva(nomeAluno);
    renderizarMateriaisConsulta();
    ativarProtecoes(nomeAluno);
    await inicializarFerramentasProva();
    if (typeof restaurarPlanilhaDaSessao === 'function') {
        restaurarPlanilhaDaSessao();
    }
    renderizarQuestao();
    salvarSessaoProva();
}

// ============================================
// CARREGAR PROVAS DISPONÍVEIS
// ============================================

async function carregarProvasDisponiveis() {
    // Deprecated: Seleção agora é por matrícula
    console.log('Modo de seleção por matrícula ativo.');
}

// ============================================
// SELEÇÃO POR MATRÍCULA
// ============================================

function acessarProvaPorMatricula() {
    const nomeInput = document.getElementById('nomeAluno');
    const matriculaInput = document.getElementById('matriculaAluno');
    const emailInput = document.getElementById('emailAluno');

    const nome = nomeInput.value.trim();
    const matricula = matriculaInput.value.replace(/\D/g, ''); // Remove não-números
    const email = emailInput.value.trim().toLowerCase();

    // Validação
    if (!nome) {
        mostrarErro('Por favor, digite seu nome completo');
        nomeInput.focus();
        return;
    }

    if (!matricula || matricula.length < 5) { // Mínimo de dígitos razoável
        mostrarErro('Por favor, digite uma matrícula válida (apenas números)');
        matriculaInput.focus();
        return;
    }

    if (!email) {
        mostrarErro('Por favor, digite seu e-mail');
        emailInput.focus();
        return;
    }

    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValido) {
        mostrarErro('Por favor, digite um e-mail válido');
        emailInput.focus();
        return;
    }

    resolverEIniciarProvaPorMatricula(nome, matricula, email);
}

async function resolverEIniciarProvaPorMatricula(nome, matricula, email) {
    try {
        const gps = await solicitarGpsParaProva();

        const params = new URLSearchParams();
        if (GRUPO_PROVA_ATUAL !== 'padrao') params.set('grupo', GRUPO_PROVA_ATUAL);
        const sufixo = params.toString() ? `?${params.toString()}` : '';
        const response = await fetch(`${API_URL}/aluno/prova-por-matricula/${encodeURIComponent(matricula)}${sufixo}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Não foi possível determinar a prova para esta matrícula');
        }

        console.log(`Matrícula ${matricula} -> Prova ${data.prova_slot} (${data.prova_titulo}), ID ${data.prova_id}`);
        iniciarProva(data.prova_id, nome, matricula, email, gps);
    } catch (error) {
        console.error('Erro ao resolver prova por matrícula:', error);
        mostrarErro(mensagemErroRede(error) || error.message || 'Erro ao determinar prova por matrícula');
    }
}

// ============================================
// INICIAR PROVA
// ============================================

async function iniciarProva(provaId, nomeAlunoParam = null, matriculaParam = null, emailParam = null, gpsParam = null) {
    const nomeAluno = nomeAlunoParam || document.getElementById('nomeAluno').value.trim();
    const matricula = matriculaParam;
    const email = emailParam || document.getElementById('emailAluno')?.value?.trim()?.toLowerCase();

    if (!nomeAluno) {
        mostrarErro('Por favor, digite seu nome antes de iniciar a prova');
        document.getElementById('nomeAluno').focus();
        return;
    }

    if (!confirm(
        `Iniciar prova como "${nomeAluno}"?\n\n` +
        `AVISO: A prova possui proteções anti-cópia.\n` +
        `Sair da aba/janela é registrado automaticamente e, ao atingir ${LIMITE_TROCAS_ABA} saídas, ` +
        `a prova é bloqueada e finalizada automaticamente, mesmo que não tenha terminado.`
    )) {
        return;
    }

    try {
        // Carregar prova
        const responseProva = await fetch(`${API_URL}/provas/${provaId}`);
        provaAtual = await responseProva.json();

        // Criar tentativa
        const responseTentativa = await fetch(`${API_URL}/tentativas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prova_id: provaId,
                nome_aluno: nomeAluno,
                matricula: matricula,
                email: email,
                grupo_prova: GRUPO_PROVA_ATUAL,
                ...(gpsParam ? {
                    gps_latitude: gpsParam.latitude,
                    gps_longitude: gpsParam.longitude,
                    gps_precisao: gpsParam.accuracy,
                    gps_autorizado: true
                } : {})
            })
        });

        if (responseTentativa.status === 409) {
            const data409 = await responseTentativa.json();
            if (data409.retomar && data409.tentativa_id) {
                await retomarProvaPorId(data409.tentativa_id);
                return;
            }
        }

        if (responseTentativa.status === 403) {
            const data = await responseTentativa.json();
            mostrarErro(data.error || 'Você já realizou esta prova.');
            return;
        }

        if (!responseTentativa.ok) {
            const dataErr = await responseTentativa.json().catch(() => ({}));
            throw new Error(dataErr.error || 'Erro ao iniciar tentativa');
        }

        tentativaAtual = await responseTentativa.json();
        window.tentativaAtual = tentativaAtual;

        respostasProva = {};
        questaoAtualIndex = 0;
        trocasAba = 0;
        provaBloqueadaPorTrocas = false;
        tempoInicio = Date.now();

        await exibirInterfaceProva(nomeAluno);

    } catch (error) {
        console.error('Erro ao iniciar prova:', error);
        mostrarErro(mensagemErroRede(error) || 'Erro ao iniciar prova');
    }
}

// ============================================
// LAYOUT DA PROVA (questões + planilha)
// ============================================

function montarLayoutProva(nomeAluno) {
    const container = document.getElementById('realizandoProva');
    container.innerHTML = `
        <div class="prova-layout">
            <div class="prova-col-questoes" id="provaColQuestoes"></div>
            <div class="prova-col-planilha" id="provaColPlanilha">
                <div class="planilha-toolbar">
                    <span id="planilhaBadgeStatus" class="planilha-badge hidden">Planilha</span>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="alternarPainelPlanilha()" title="Mostrar/ocultar planilha">
                        ⇔ Planilha
                    </button>
                </div>
                <div id="painelPlanilhaSetup"></div>
                <div id="planilhaPainelAtivo" class="planilha-painel-ativo hidden"></div>
                <iframe id="planilhaFrame" class="planilha-frame hidden" title="Planilha do aluno" allow="clipboard-read; clipboard-write; fullscreen"></iframe>
                <div id="painelMateriaisConsulta" class="materiais-consulta-wrap"></div>
            </div>
        </div>
    `;
}

// ============================================
// PROTEÇÕES ANTI-CÓPIA
// ============================================

function ativarProtecoes(nomeAluno) {
    const container = document.getElementById('realizandoProva');

    // Adicionar classe no-select (questões; planilha no iframe não é afetada)
    container.classList.add('no-select');

    // Marca d'água no body para não ser apagada ao trocar questão
    let watermark = document.getElementById('provaWatermark');
    if (!watermark) {
        watermark = document.createElement('div');
        watermark.id = 'provaWatermark';
        watermark.className = 'watermark';
        document.body.appendChild(watermark);
    }
    watermark.textContent = nomeAluno;

    // Bloquear clique direito nas questões (planilha permite interação normal)
    container.addEventListener('contextmenu', handleContextMenuProva);

    // Bloquear atalhos de cópia nas questões
    container.addEventListener('keydown', handleKeydownProva);

    // Detectar PrintScreen em qualquer ponto da página (inclusive fora das questões)
    document.addEventListener('keydown', handlePrintScreenProva);

    // Detectar troca de aba no navegador
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Detectar perda de foco da janela — captura Win+Shift+S e saída prolongada.
    window.addEventListener('blur',  handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    // Contador de saídas sempre visível para o aluno (começa em 0/3)
    atualizarContadorTrocasUI();
}

function handleContextMenuProva(e) {
    if (e.target.closest('#provaColPlanilha')) return;
    if (e.target.closest('#provaColQuestoes table')) return;
    e.preventDefault();
    mostrarAviso('Clique direito desabilitado nas questões');
    return false;
}

function handlePrintScreenProva(e) {
    if (!tentativaAtual) return;
    if (provaBloqueadaPorTrocas) return;

    // PrintScreen clássico (PrtSc) — detectável via keydown na maioria dos
    // navegadores no Windows. Win+Shift+S (Recorte) e prints pelo celular
    // não são detectáveis (acontecem fora do navegador).
    if (e.key === 'PrintScreen') {
        e.preventDefault();
        registrarTrocaAba('Tecla PrintScreen detectada');
    }
}

function selecaoDentroDeTabelaQuestao() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    const node = sel.anchorNode;
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return !!el?.closest('#provaColQuestoes table');
}

function interacaoEmTabelaQuestao(el) {
    return !!el?.closest?.('#provaColQuestoes table');
}

function handleKeydownProva(e) {
    if (e.target.closest('#provaColPlanilha')) return;

    const tecla = e.key.toLowerCase();
    const emTabela = interacaoEmTabelaQuestao(e.target) || selecaoDentroDeTabelaQuestao();

    if ((e.ctrlKey || e.metaKey) && tecla === 'c' && emTabela) return;
    if ((e.ctrlKey || e.metaKey) && tecla === 'a' && interacaoEmTabelaQuestao(e.target)) return;

    if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a', 'p'].includes(tecla)) {
        e.preventDefault();
        mostrarAviso('Atalhos de teclado desabilitados nas questões');
        return false;
    }

    if (e.key === 'F12') {
        e.preventDefault();
        return false;
    }
}

function desativarProtecoes() {
    const container = document.getElementById('realizandoProva');

    container.classList.remove('no-select');

    const watermark = document.getElementById('provaWatermark');
    if (watermark) watermark.remove();

    container.removeEventListener('contextmenu', handleContextMenuProva);
    container.removeEventListener('keydown', handleKeydownProva);
    document.removeEventListener('keydown', handlePrintScreenProva);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur',  handleWindowBlur);
    window.removeEventListener('focus', handleWindowFocus);
    _tsBlurInicio = 0;
    removerContadorTrocasUI();

    resetarFerramentasProva();
}

function handleVisibilityChange() {
    if (provaBloqueadaPorTrocas || !tentativaAtual) return;
    if (document.hidden) {
        // PDF/slides e Excel abertos na própria prova não contam como saída.
        if (usoIntegradoProvaAtivo()) {
            _tsBlurInicio = 0;
            return;
        }
        _tsBlurInicio = 0;
        registrarTrocaAba('Troca de aba detectada');
    }
}

function handleWindowBlur() {
    if (provaBloqueadaPorTrocas || !tentativaAtual) return;
    if (document.hidden) return;
    if (Date.now() - _tsUltimoPopupAberto < POPUP_GRACE_MS) return;
    // Clique no iframe de slides/PDF ou planilha tira o foco da janela por instantes.
    if (usoIntegradoProvaAtivo()) return;
    _tsBlurInicio = Date.now();
}

function handleWindowFocus() {
    if (_tsBlurInicio === 0) return;
    const duracao = Date.now() - _tsBlurInicio;
    _tsBlurInicio = 0;
    if (provaBloqueadaPorTrocas || !tentativaAtual) return;
    if (usoIntegradoProvaAtivo()) return;

    // Blur curto (0–800ms): padrão de Win+Shift+S — conta sempre.
    if (duracao <= BLUR_CURTO_MAX_MS) {
        registrarTrocaAba('Perda de foco rápida detectada (possível captura de tela)');
        return;
    }

    // Blur longo (> 4s): ficou em outro aplicativo. Só conta se a planilha
    // NÃO estiver aberta — com o Excel aberto, foco longo fora da prova é
    // exatamente o uso legítimo da planilha.
    const planilhaAberta = window.planilhaPopup && !window.planilhaPopup.closed;
    if (duracao >= BLUR_LONGO_MIN_MS && !planilhaAberta) {
        registrarTrocaAba('Saída prolongada para outro aplicativo');
    }
}

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        // Página voltou do cache (ex.: botão Voltar após redirect MSAL).
        // Reseta flags que podem ter ficado travadas.
        window._authInteracaoEmAndamento = false;
        window._focoNaPlanilha = false;
        window._consultandoMaterialConsulta = false;
    }
});

async function registrarTrocaAba(motivo) {
    if (provaBloqueadaPorTrocas) return;
    trocasAba++;
    atualizarContadorTrocasUI();

    try {
        const response = await fetch(`${API_URL}/tentativas/${tentativaAtual.id}/troca-aba`, {
            method: 'POST'
        });
        const data = await response.json().catch(() => null);

        if (data && Number.isInteger(data.trocas_aba)) {
            trocasAba = data.trocas_aba;
        }
        atualizarContadorTrocasUI();

        const restantes = Math.max(0, LIMITE_TROCAS_ABA - trocasAba);
        if (trocasAba >= LIMITE_TROCAS_ABA) {
            await finalizarProvaPorTrocasDeAba();
        } else {
            const detalhe = motivo ? `${motivo}. ` : '';
            mostrarAviso(`⚠️ ${detalhe}Saída registrada (${trocasAba}/${LIMITE_TROCAS_ABA}). Restam ${restantes} tentativa(s) antes do bloqueio automático da prova.`);
        }

    } catch (error) {
        console.error('Erro ao registrar troca de aba:', error);
    }
}

// Contador fixo no canto da tela — o aluno vê o total de saídas em tempo real.
function atualizarContadorTrocasUI() {
    if (!tentativaAtual) return;
    let badge = document.getElementById('provaContadorTrocas');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'provaContadorTrocas';
        badge.style.cssText = `
            position: fixed;
            bottom: 16px;
            left: 16px;
            z-index: 9999;
            padding: 8px 14px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.9rem;
            background: rgba(17, 24, 39, 0.92);
            border: 2px solid var(--warning, #f59e0b);
            color: var(--warning, #f59e0b);
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        `;
        document.body.appendChild(badge);
    }
    badge.textContent = `Saídas da prova: ${trocasAba}/${LIMITE_TROCAS_ABA}`;
    if (trocasAba >= LIMITE_TROCAS_ABA - 1) {
        badge.style.borderColor = '#ef4444';
        badge.style.color = '#ef4444';
    }
}

function removerContadorTrocasUI() {
    document.getElementById('provaContadorTrocas')?.remove();
}

function mostrarAviso(mensagem) {
    // Criar toast temporário
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--bg-card);
        color: var(--warning);
        padding: 1.5rem 2rem;
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
        border: 2px solid var(--warning);
        z-index: 10000;
        font-weight: 600;
        text-align: center;
        max-width: 400px;
    `;
    toast.textContent = mensagem;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ============================================
// TIMER
// ============================================

function iniciarTimer() {
    // Criar elemento do timer
    const timerDiv = document.createElement('div');
    timerDiv.id = 'provaTimer';
    timerDiv.className = 'timer';
    timerDiv.innerHTML = '<div class="timer-value">00:00</div>';
    document.body.appendChild(timerDiv);

    // Atualizar a cada segundo
    timerInterval = setInterval(() => {
        tempoRestante--;
        atualizarTimer();

        if (tempoRestante <= 0) {
            clearInterval(timerInterval);
            finalizarProvaAutomatico();
        }
    }, 1000);

    atualizarTimer();
}

function atualizarTimer() {
    const timerDiv = document.getElementById('provaTimer');
    if (!timerDiv) return;

    const minutos = Math.floor(tempoRestante / 60);
    const segundos = tempoRestante % 60;

    timerDiv.querySelector('.timer-value').textContent =
        `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;

    // Mudar cor conforme o tempo
    if (tempoRestante <= 60) {
        timerDiv.classList.add('danger');
    } else if (tempoRestante <= 300) {
        timerDiv.classList.add('warning');
    }
}

function pararTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    const timerDiv = document.getElementById('provaTimer');
    if (timerDiv) {
        timerDiv.remove();
    }
}

// ============================================
// RENDERIZAR QUESTÃO
// ============================================

function renderizarQuestao() {
    const questao = provaAtual.questoes[questaoAtualIndex];
    const container = document.getElementById('provaColQuestoes');
    if (!container) return;

    container.innerHTML = `
        <div class="card" style="max-width: 900px; margin: 0 auto;">
            <div class="flex-between mb-3">
                <h3>Questão ${questaoAtualIndex + 1} de ${provaAtual.questoes.length}</h3>
                <!-- Badge de dificuldade removido -->
            </div>
            
            <div class="mb-4">
                ${questao.enunciado_imagem ?
            `<img src="${questao.enunciado_imagem}" style="max-width: 100%; border-radius: var(--radius-md);" alt="Questão">` :
            `<p style="font-size: 1.1rem; line-height: 1.8;">${questao.enunciado}</p>`
        }
            </div>
            
            <div class="alternativas-list mb-4">
                ${questao.alternativas.map((alt, index) => `
                    <label class="alternativa-item" style="cursor: pointer;">
                        <input type="radio" name="resposta" value="${alt.id}" 
                            ${respostasProva[questao.id] === alt.id ? 'checked' : ''}
                            onchange="salvarResposta(${questao.id}, ${alt.id})">
                        <div class="alternativa-letra">${String.fromCharCode(65 + index)}</div>
                        <div class="alternativa-content">
                            ${alt.imagem ?
                `<img src="${alt.imagem}" style="max-width: 100%; border-radius: var(--radius-md);" alt="Alternativa ${String.fromCharCode(65 + index)}">` :
                alt.texto
            }
                        </div>
                    </label>
                `).join('')}
            </div>
            
            <div class="flex-between">
                <button class="btn btn-secondary" onclick="questaoAnterior()" ${questaoAtualIndex === 0 ? 'disabled' : ''}>
                    ← Anterior
                </button>
                
                <div style="color: var(--text-muted);">
                    ${Object.keys(respostasProva).length} de ${provaAtual.questoes.length} respondidas
                </div>
                
                ${questaoAtualIndex < provaAtual.questoes.length - 1 ?
            `<button class="btn btn-primary" onclick="proximaQuestao()">
                        Próxima →
                    </button>` :
            `<button class="btn btn-success" onclick="finalizarProva()">
                        ✓ Finalizar Prova
                    </button>`
        }
            </div>
        </div>
    `;
}

function salvarResposta(questaoId, alternativaId) {
    respostasProva[questaoId] = alternativaId;
    salvarSessaoProva();

    // Enviar resposta para o servidor
    fetch(`${API_URL}/tentativas/${tentativaAtual.id}/responder`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            questao_id: questaoId,
            alternativa_id: alternativaId
        })
    }).catch(error => {
        console.error('Erro ao salvar resposta:', error);
    });
}

function proximaQuestao() {
    if (questaoAtualIndex < provaAtual.questoes.length - 1) {
        questaoAtualIndex++;
        salvarSessaoProva();
        renderizarQuestao();
        window.scrollTo(0, 0);
    }
}

function questaoAnterior() {
    if (questaoAtualIndex > 0) {
        questaoAtualIndex--;
        salvarSessaoProva();
        renderizarQuestao();
        window.scrollTo(0, 0);
    }
}

// ============================================
// FINALIZAR PROVA
// ============================================

async function finalizarProva() {
    const naoRespondidas = provaAtual.questoes.length - Object.keys(respostasProva).length;

    if (naoRespondidas > 0) {
        if (!confirm(`Você ainda tem ${naoRespondidas} questão(ões) não respondida(s).\n\nDeseja finalizar mesmo assim?`)) {
            return;
        }
    } else {
        if (!confirm('Deseja finalizar a prova?')) {
            return;
        }
    }

    await finalizarProvaComum();
}

async function finalizarProvaAutomatico() {
    mostrarAviso('⏰ Tempo esgotado! A prova será finalizada automaticamente.');
    await finalizarProvaComum();
}

async function finalizarProvaPorTrocasDeAba() {
    if (provaBloqueadaPorTrocas) return;
    provaBloqueadaPorTrocas = true;
    mostrarAviso(`🚫 Limite de ${LIMITE_TROCAS_ABA} saídas da aba/janela atingido! A prova foi bloqueada e será finalizada automaticamente.`);
    await finalizarProvaComum();
}

async function finalizarProvaComum() {
    try {
        // Calcular tempo total
        const tempoTotal = Math.floor((Date.now() - tempoInicio) / 1000);

        // Finalizar no servidor
        const dadosPlanilha = typeof obterDadosPlanilhaParaServidor === 'function'
            ? await obterDadosPlanilhaParaServidor()
            : {};

        const responseFinalizar = await fetch(`${API_URL}/tentativas/${tentativaAtual.id}/finalizar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tempo_total: tempoTotal,
                ...dadosPlanilha
            })
        });

        if (!responseFinalizar.ok) {
            const errorData = await responseFinalizar.json();
            throw new Error(errorData.details || errorData.error || 'Erro ao finalizar prova no servidor');
        }

        // Parar timer
        pararTimer();

        // Desativar proteções
        desativarProtecoes();
        limparSessaoProva();

        // Buscar resultado
        const response = await fetch(`${API_URL}/tentativas/${tentativaAtual.id}/resultado`);
        const resultado = await response.json();

        // Mostrar resultado
        mostrarResultadoProva(resultado);

        // Resetar estado
        provaAtual = null;
        tentativaAtual = null;
        window.tentativaAtual = null;
        respostasProva = {};
        questaoAtualIndex = 0;

    } catch (error) {
        console.error('Erro ao finalizar prova:', error);
        mostrarErro('Erro ao finalizar prova');
    }
}

function mostrarResultadoProva(resultado) {
    const container = document.getElementById('realizandoProva');

    container.innerHTML = `
        <div class="card" style="max-width: 800px; margin: 0 auto; text-align: center;">
            <h2 style="margin-bottom: 2rem;">🎉 Prova Finalizada!</h2>
            </div>
        </div>
    `;
}

function voltarParaSelecao() {
    desativarProtecoes();
    document.getElementById('realizandoProva').classList.add('hidden');
    document.getElementById('realizandoProva').innerHTML = '';
    document.getElementById('selecionarProva').classList.remove('hidden');

    // Mostrar cabeçalho novamente
    document.querySelector('header').classList.remove('hidden');
    document.getElementById('nomeAluno').value = '';
    document.getElementById('matriculaAluno').value = '';
    if (document.getElementById('emailAluno')) {
        document.getElementById('emailAluno').value = '';
    }
    carregarProvasDisponiveis();
}
