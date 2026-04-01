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
        const response = await fetch(`${API_URL}/aluno/prova-por-matricula/${encodeURIComponent(matricula)}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Não foi possível determinar a prova para esta matrícula');
        }

        console.log(`Matrícula ${matricula} -> Prova ${data.prova_slot} (${data.prova_titulo}), ID ${data.prova_id}`);
        iniciarProva(data.prova_id, nome, matricula, email);
    } catch (error) {
        console.error('Erro ao resolver prova por matrícula:', error);
        mostrarErro(error.message || 'Erro ao determinar prova por matrícula');
    }
}

// ============================================
// INICIAR PROVA
// ============================================

async function iniciarProva(provaId, nomeAlunoParam = null, matriculaParam = null, emailParam = null) {
    const nomeAluno = nomeAlunoParam || document.getElementById('nomeAluno').value.trim();
    const matricula = matriculaParam;
    const email = emailParam || document.getElementById('emailAluno')?.value?.trim()?.toLowerCase();

    if (!nomeAluno) {
        mostrarErro('Por favor, digite seu nome antes de iniciar a prova');
        document.getElementById('nomeAluno').focus();
        return;
    }

    /* Confirmação removida conforme solicitado
    if (!confirm(`Iniciar prova como "${nomeAluno}"?\n\nAVISO: A prova possui proteções anti-cópia. Trocas de aba serão registradas.`)) {
        return;
    }
    */

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
                email: email
            })
        });

        if (responseTentativa.status === 403) {
            const data = await responseTentativa.json();
            mostrarErro(data.error || 'Você já realizou esta prova.');
            return;
        }

        tentativaAtual = await responseTentativa.json();

        // Inicializar estado
        respostasProva = {};
        questaoAtualIndex = 0;
        trocasAba = 0;
        tempoInicio = Date.now();

        // Configurar timer se houver limite de tempo
        if (provaAtual.tempo_limite) {
            tempoRestante = provaAtual.tempo_limite * 60; // converter para segundos
            iniciarTimer();
        }

        // Esconder seleção e mostrar prova
        document.getElementById('selecionarProva').classList.add('hidden');
        document.getElementById('realizandoProva').classList.remove('hidden');

        // Esconder cabeçalho para foco total
        document.querySelector('header').classList.add('hidden');

        // Ativar proteções
        ativarProtecoes(nomeAluno);

        // Renderizar primeira questão
        renderizarQuestao();

    } catch (error) {
        console.error('Erro ao iniciar prova:', error);
        mostrarErro('Erro ao iniciar prova');
    }
}

// ============================================
// PROTEÇÕES ANTI-CÓPIA
// ============================================

function ativarProtecoes(nomeAluno) {
    const container = document.getElementById('realizandoProva');

    // Adicionar classe no-select
    container.classList.add('no-select');

    // Adicionar marca d'água
    const watermark = document.createElement('div');
    watermark.className = 'watermark';
    watermark.textContent = nomeAluno;
    container.appendChild(watermark);

    // Bloquear clique direito
    container.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        mostrarAviso('Clique direito desabilitado durante a prova');
        return false;
    });

    // Bloquear atalhos de cópia
    container.addEventListener('keydown', (e) => {
        // Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+P, F12
        if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a', 'p'].includes(e.key.toLowerCase())) {
            e.preventDefault();
            mostrarAviso('Atalhos de teclado desabilitados durante a prova');
            return false;
        }

        // F12 (DevTools)
        if (e.key === 'F12') {
            e.preventDefault();
            return false;
        }
    });

    // Detectar troca de aba/janela
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
}

function desativarProtecoes() {
    const container = document.getElementById('realizandoProva');

    // Remover classe no-select
    container.classList.remove('no-select');

    // Remover marca d'água
    const watermark = container.querySelector('.watermark');
    if (watermark) {
        watermark.remove();
    }

    // Remover event listeners
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);
}

function handleVisibilityChange() {
    if (document.hidden && tentativaAtual) {
        registrarTrocaAba();
    }
}

function handleWindowBlur() {
    if (tentativaAtual) {
        registrarTrocaAba();
    }
}

async function registrarTrocaAba() {
    trocasAba++;

    try {
        await fetch(`${API_URL}/tentativas/${tentativaAtual.id}/troca-aba`, {
            method: 'POST'
        });

        // Aviso visual removido conforme solicitação

    } catch (error) {
        console.error('Erro ao registrar troca de aba:', error);
    }
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
    const container = document.getElementById('realizandoProva');

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
        renderizarQuestao();
        window.scrollTo(0, 0);
    }
}

function questaoAnterior() {
    if (questaoAtualIndex > 0) {
        questaoAtualIndex--;
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

async function finalizarProvaComum() {
    try {
        // Calcular tempo total
        const tempoTotal = Math.floor((Date.now() - tempoInicio) / 1000);

        // Finalizar no servidor
        const responseFinalizar = await fetch(`${API_URL}/tentativas/${tentativaAtual.id}/finalizar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tempo_total: tempoTotal
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

        // Buscar resultado
        const response = await fetch(`${API_URL}/tentativas/${tentativaAtual.id}/resultado`);
        const resultado = await response.json();

        // Mostrar resultado
        mostrarResultadoProva(resultado);

        // Resetar estado
        provaAtual = null;
        tentativaAtual = null;
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
