// ============================================
// CONFIGURAÇÃO E ESTADO GLOBAL
// ============================================

// Configuração da API
window.API_URL = '/api';
let topicos = [];
let tags = [];
let loginChallengeId = null;

const GRUPO_PROVA_PATH = typeof obterGrupoPorPath === 'function'
    ? obterGrupoPorPath(window.location.pathname)
    : 'padrao';
window.GRUPO_PROVA_PATH = GRUPO_PROVA_PATH;

function appendGrupoQuery(params = new URLSearchParams()) {
    if (GRUPO_PROVA_PATH !== 'padrao') {
        params.set('grupo', GRUPO_PROVA_PATH);
    }
    const query = params.toString();
    return query ? `?${query}` : '';
}

function isModoAdmin() {
    return new URLSearchParams(window.location.search).has('admin');
}

function tituloGrupoProvaAtual() {
    const config = typeof obterConfigGrupo === 'function' ? obterConfigGrupo(GRUPO_PROVA_PATH) : null;
    if (config) return config.nomeExibicao;
    return 'Prova I–V (turma oficial)';
}

function tokenAdminLocal() {
    const token = sessionStorage.getItem('adminToken');
    if (!token || token === 'undefined' || token === 'admin-session-active') {
        return null;
    }
    if (!/^[a-f0-9]{64}$/i.test(token)) {
        return null;
    }
    return token;
}

function headersAdmin() {
    const token = tokenAdminLocal();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function tratarSessaoAdminExpirada() {
    limparSessaoAdminLocal();
    exibirModalLoginAdmin();
}

function limparSessaoAdminLocal() {
    sessionStorage.removeItem('adminToken');
    loginChallengeId = null;
}

function exibirModalLoginAdmin() {
    document.body.classList.add('mode-admin-locked');
    document.body.classList.remove('mode-admin');
    const nav = document.getElementById('mainNav');
    if (nav) nav.style.display = 'none';
    const header = document.querySelector('header');
    const container = document.querySelector('.container');
    if (header) header.classList.add('hidden');
    if (container) container.classList.add('hidden');
    document.querySelectorAll('.page').forEach((page) => page.classList.add('hidden'));
    const modal = document.getElementById('modalLogin');
    if (modal) modal.style.display = 'flex';
    voltarLoginSenha();
}

async function validarSessaoAdminNoServidor() {
    const token = tokenAdminLocal();
    if (!token) return false;

    try {
        const response = await fetch(`${API_URL}/auth/session`, {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

async function carregarPainelAdmin() {
    document.body.classList.remove('mode-admin-locked');
    document.body.classList.add('mode-admin');

    const modal = document.getElementById('modalLogin');
    if (modal) modal.style.display = 'none';

    const header = document.querySelector('header');
    const container = document.querySelector('.container');
    if (header) header.classList.remove('hidden');
    if (container) container.classList.remove('hidden');

    const nav = document.getElementById('mainNav');
    if (nav) nav.style.display = 'flex';

    configurarNavegacao();

    const dash = document.getElementById('page-dashboard');
    if (dash) dash.style.display = 'block';

    exibirBannerGrupoAdmin();

    carregarDashboard().catch(e => console.error('Erro dashboard:', e));
    carregarTopicos().catch(e => console.error('Erro tópicos:', e));
    carregarTags().catch(e => console.error('Erro tags:', e));
}

function exibirBannerGrupoAdmin() {
    const header = document.querySelector('header .header-content');
    if (!header) return;

    let banner = document.getElementById('bannerGrupoAdmin');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'bannerGrupoAdmin';
        banner.style.cssText = 'margin-top:0.75rem;padding:0.6rem 0.9rem;border-radius:8px;font-size:0.92rem;line-height:1.4;';
        header.appendChild(banner);
    }

    if (GRUPO_PROVA_PATH !== GRUPO_PADRAO) {
        banner.style.background = 'rgba(99, 102, 241, 0.12)';
        banner.style.border = '1px solid rgba(99, 102, 241, 0.35)';
        banner.innerHTML = `<strong>Monitorando:</strong> ${tituloGrupoProvaAtual()} — histórico e estatísticas filtrados para este grupo.`;
    } else {
        banner.style.background = 'rgba(34, 197, 94, 0.1)';
        banner.style.border = '1px solid rgba(34, 197, 94, 0.35)';
        banner.innerHTML = `<strong>Monitorando:</strong> ${tituloGrupoProvaAtual()}.`;
    }
}

function fetchAdmin(url, options = {}) {
    return window.__fetchAdminImpl(url, options);
}

window.__fetchAdminImpl = async function fetchAdminImpl(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { ...headersAdmin(), ...(options.headers || {}) }
    });

    if (response.status === 401) {
        tratarSessaoAdminExpirada();
        throw new Error('Sessão expirada. Faça login novamente.');
    }

    return response;
};

window.headersAdmin = headersAdmin;
window.fetchAdmin = fetchAdmin;

// ============================================
// INICIALIZAÇÃO
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App iniciando...');

    // Failsafe: Se por algum motivo o app travar, corrigir a tela após 2s
    setTimeout(() => {
        const nav = document.getElementById('mainNav');
        const dash = document.getElementById('page-dashboard');
        const pageRealizarProva = document.getElementById('page-realizar-prova');
        const isAdmin = isModoAdmin();

        if (!isAdmin && dash && pageRealizarProva && !dash.classList.contains('hidden')) {
            console.warn('⚠️ Failsafe aluno: forçando tela de realizar prova');
            document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
            pageRealizarProva.classList.remove('hidden');
            if (nav) nav.style.display = 'none';
            return;
        }

        if (isAdmin && nav && nav.style.display === 'none' && !document.body.classList.contains('mode-admin-locked')) {
            console.warn('⚠️ Failsafe admin: forçando exibição da UI');
            nav.style.display = 'flex';
            document.querySelectorAll('.page').forEach((page) => page.classList.add('hidden'));
            const dash = document.getElementById('page-dashboard');
            if (dash) dash.classList.remove('hidden');

            document.querySelectorAll('.loading').forEach(el => {
                el.innerHTML = '<p class="text-danger">Tempo limite excedido. Tente recarregar.</p>';
            });
        }
    }, 2000);

    inicializarApp();
});

async function inicializarApp() {
    try {
        // Verificar modo de acesso
        const isAdmin = isModoAdmin();
        console.log('📋 Modo:', isAdmin ? 'ADMIN' : 'ALUNO');

        if (isAdmin) {
            // MODO_ADMIN: Verificar Autenticação
            const token = tokenAdminLocal();

            if (!token) {
                console.log('🔒 Admin não autenticado. Exibindo login.');
                exibirModalLoginAdmin();
                return;
            }

            const sessaoValida = await validarSessaoAdminNoServidor();
            if (!sessaoValida) {
                await new Promise((resolve) => setTimeout(resolve, 400));
                const sessaoValidaTentativa2 = await validarSessaoAdminNoServidor();
                if (!sessaoValidaTentativa2) {
                    console.warn('⚠️ Sessão admin expirada ou inválida. Solicitando login.');
                    tratarSessaoAdminExpirada();
                    return;
                }
            }

            // MODO_ADMIN (Autenticado): Carregar tudo
            console.log('🔓 Admin autenticado. Carregando dashboard...');
            document.body.classList.remove('mode-admin-locked');
            document.body.classList.add('mode-admin');

            const modal = document.getElementById('modalLogin');
            if (modal) modal.style.display = 'none';

            const header = document.querySelector('header');
            const container = document.querySelector('.container');
            if (header) header.classList.remove('hidden');
            if (container) container.classList.remove('hidden');

            const nav = document.getElementById('mainNav');
            if (nav) nav.style.display = 'flex';

            configurarNavegacao();

            document.querySelectorAll('.page').forEach((page) => page.classList.add('hidden'));
            const dash = document.getElementById('page-dashboard');
            if (dash) dash.classList.remove('hidden');

            exibirBannerGrupoAdmin();

            // Carregar dados em paralelo para não travar a UI
            carregarDashboard().catch(e => console.error('Erro dashboard:', e));
            carregarTopicos().catch(e => console.error('Erro tópicos:', e));
            carregarTags().catch(e => console.error('Erro tags:', e));

        } else {
            // MODO_ALUNO: Apenas realizar prova
            document.body.classList.add('mode-aluno');
            console.log('👨‍🎓 Iniciando modo aluno...');

            // Esconder navegação
            const nav = document.getElementById('mainNav');
            if (nav) nav.style.display = 'none';

            // Mostrar apenas a página de realizar prova
            document.querySelectorAll('.page').forEach(page => {
                page.classList.add('hidden');
            });

            const pageRealizarProva = document.getElementById('page-realizar-prova');
            if (pageRealizarProva) {
                pageRealizarProva.classList.remove('hidden');
                console.log('✅ Página de realizar prova exibida');
            }

            const configGrupo = typeof obterConfigGrupo === 'function' ? obterConfigGrupo(GRUPO_PROVA_PATH) : null;
            if (configGrupo) {
                const tituloProva = document.querySelector('#selecionarProva h2');
                if (tituloProva) {
                    tituloProva.textContent = `Prova — ${configGrupo.nomeExibicao}`;
                }
            }

            verificarConexaoAluno();

            const retomou = await tentarRetomarProvaAoCarregar();
            if (retomou) {
                console.log('✅ Prova retomada automaticamente após recarregar');
                return;
            }

            // Carregar lista de provas disponíveis
            try {
                console.log('📥 Carregando provas disponíveis...');
                await carregarProvasDisponiveis();
                console.log('✅ Provas carregadas com sucesso');
            } catch (e) {
                console.error('❌ Erro ao carregar provas:', e);
                // Mostrar mensagem de erro amigável
                const container = document.getElementById('listaProvasRealizar');
                if (container) {
                    container.innerHTML = `
                        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                            <p style="color: var(--error); font-size: 1.1rem; margin-bottom: 1rem;">
                                ❌ Erro ao carregar provas
                            </p>
                            <p style="color: var(--text-muted);">
                                Tente recarregar a página. Se o problema persistir, contate o administrador.
                            </p>
                            <button class="btn btn-primary" onclick="location.reload()" style="margin-top: 1rem;">
                                🔄 Recarregar Página
                            </button>
                        </div>
                    `;
                }
            }
        }

        console.log('✅ App inicializado com sucesso');
    } catch (error) {
        console.error('❌ Erro fatal ao inicializar app:', error);
    }
}

// ============================================
// AUTENTICAÇÃO ADMIN
// ============================================

function mostrarErroLogin(mensagem) {
    const erroDiv = document.getElementById('loginError');
    if (!erroDiv) return;
    erroDiv.textContent = mensagem;
    erroDiv.style.display = 'block';
}

function esconderErroLogin() {
    const erroDiv = document.getElementById('loginError');
    if (erroDiv) erroDiv.style.display = 'none';
}

function mostrarPassoTelegram() {
    document.getElementById('loginStepSenha')?.classList.add('hidden');
    document.getElementById('loginStepTelegram')?.classList.remove('hidden');
    const codigoInput = document.getElementById('codigoTelegram');
    if (codigoInput) {
        codigoInput.value = '';
        codigoInput.focus();
    }
}

function voltarLoginSenha() {
    loginChallengeId = null;
    document.getElementById('loginStepTelegram')?.classList.add('hidden');
    document.getElementById('loginStepSenha')?.classList.remove('hidden');
    esconderErroLogin();
    document.getElementById('senhaAdmin')?.focus();
}

function urlAdminAtual() {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    return `${path}?admin`;
}

function concluirLoginAdmin(token) {
    sessionStorage.setItem('adminToken', token);
    window.location.replace(urlAdminAtual());
}

async function realizarLogin(event) {
    event.preventDefault();

    const senhaInput = document.getElementById('senhaAdmin');
    const botao = document.getElementById('btnLoginSenha');

    if (!senhaInput) return;

    esconderErroLogin();
    if (botao) {
        botao.disabled = true;
        botao.textContent = 'Verificando...';
    }

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: senhaInput.value })
        });

        const text = await response.text();
        let data = {};
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(response.status === 500 ? 'Erro interno do servidor (500)' : `Erro ${response.status}`);
        }

        if (!response.ok) {
            throw new Error(data.error || `Erro ${response.status}`);
        }

        if (data.step === 'telegram') {
            loginChallengeId = data.challengeId;
            mostrarPassoTelegram();
            return;
        }

        if (data.token) {
            concluirLoginAdmin(data.token);
            return;
        }

        throw new Error('Resposta de login inválida');
    } catch (error) {
        console.error('Erro detalhado no login:', error);
        mostrarErroLogin(error.message === 'Failed to fetch'
            ? 'Não foi possível conectar ao servidor. Verifique se ele está rodando.'
            : `Erro: ${error.message}`);
    } finally {
        if (botao) {
            botao.disabled = false;
            botao.textContent = 'Continuar';
        }
    }
}

async function verificarCodigoTelegram() {
    const codigoInput = document.getElementById('codigoTelegram');
    const botao = document.getElementById('btnVerificarCodigo');
    const codigo = codigoInput?.value.trim() || '';

    if (!loginChallengeId) {
        mostrarErroLogin('Sessão expirada. Digite a senha novamente.');
        voltarLoginSenha();
        return;
    }

    if (!/^\d{6}$/.test(codigo)) {
        mostrarErroLogin('Digite o código de 6 dígitos enviado no Telegram.');
        return;
    }

    esconderErroLogin();
    if (botao) {
        botao.disabled = true;
        botao.textContent = 'Verificando...';
    }

    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challengeId: loginChallengeId, code: codigo })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Código inválido');
        }

        if (data.token) {
            concluirLoginAdmin(data.token);
            return;
        }

        throw new Error('Resposta inválida do servidor');
    } catch (error) {
        mostrarErroLogin(error.message === 'Failed to fetch'
            ? 'Não foi possível conectar ao servidor.'
            : error.message);
    } finally {
        if (botao) {
            botao.disabled = false;
            botao.textContent = 'Verificar código';
        }
    }
}

window.verificarCodigoTelegram = verificarCodigoTelegram;
window.voltarLoginSenha = voltarLoginSenha;
window.realizarLogin = realizarLogin;


// ============================================
// NAVEGAÇÃO
// ============================================

function configurarNavegacao() {
    const navButtons = document.querySelectorAll('.nav-btn');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const pagina = btn.dataset.page;
            navegarPara(pagina);
        });
    });
}

function navegarPara(pagina) {
    // Atualizar botões de navegação
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.page === pagina) {
            btn.classList.add('active');
        }
    });

    // Esconder todas as páginas
    document.querySelectorAll('.page').forEach(page => {
        page.classList.add('hidden');
    });

    // Mostrar página selecionada
    const paginaElement = document.getElementById(`page-${pagina}`);
    if (paginaElement) {
        paginaElement.classList.remove('hidden');
    }

    // Carregar conteúdo da página
    switch (pagina) {
        case 'dashboard':
            carregarDashboard();
            break;
        case 'questoes':
            carregarQuestoes();
            break;
        case 'provas':
            carregarProvas();
            break;
        case 'realizar-prova':
            carregarProvasDisponiveis();
            break;
        case 'historico':
            carregarStatusGpsEmergencia();
            carregarHistorico();
            break;
    }
}

// ============================================
// DASHBOARD
// ============================================

async function carregarDashboard() {
    const statsGrid = document.getElementById('statsGrid');
    const questoesPorTopico = document.getElementById('questoesPorTopico');
    const topAlunos = document.getElementById('topAlunos');

    // Estado de Loading Visual
    if (statsGrid) {
        statsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem;">
                <div class="loading"></div>
                <p class="mt-2 text-muted">Carregando estatísticas...</p>
            </div>
        `;
    }

    try {
        const response = await fetch(`${API_URL}/estatisticas/dashboard${appendGrupoQuery()}`);

        if (!response.ok) {
            throw new Error(`Erro do servidor: ${response.status}`);
        }

        const data = await response.json();

        // Verificar por erro retornado na API
        if (data.error) {
            throw new Error(data.error);
        }

        // Renderizar estatísticas gerais
        const stats = data.estatisticas_gerais || {};

        if (statsGrid) {
            statsGrid.innerHTML = `
                <div class="stat-card">
                    <div class="stat-icon">📝</div>
                    <div class="stat-value">${stats.total_questoes || 0}</div>
                    <div class="stat-label">Questões</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">📋</div>
                    <div class="stat-value">${stats.total_provas || 0}</div>
                    <div class="stat-label">Provas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">✍️</div>
                    <div class="stat-value">${stats.total_tentativas || 0}</div>
                    <div class="stat-label">Tentativas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">👥</div>
                    <div class="stat-value">${stats.total_alunos || 0}</div>
                    <div class="stat-label">Alunos</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">📊</div>
                    <div class="stat-value">${stats.media_geral ? Number(stats.media_geral).toFixed(1) : '0.0'}</div>
                    <div class="stat-label">Média Geral</div>
                </div>
            `;
        }

        const cfg = data.config_provas_turma;
        let avisoProvas = document.getElementById('avisoConfigProvasTurma');
        if (cfg && !cfg.ok) {
            if (!avisoProvas) {
                avisoProvas = document.createElement('div');
                avisoProvas.id = 'avisoConfigProvasTurma';
                avisoProvas.className = 'card mb-3';
                avisoProvas.style.cssText = 'background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.35);';
                if (statsGrid?.parentNode) {
                    statsGrid.parentNode.insertBefore(avisoProvas, statsGrid);
                }
            }
            const inativas = (cfg.provas || []).filter((p) => !p.ativo).map((p) => `${p.titulo} (ID ${p.id})`).join(', ');
            avisoProvas.innerHTML = `
                <p style="margin:0 0 0.5rem;color:var(--error);font-weight:600;">⚠️ Provas da turma mal configuradas</p>
                <p style="margin:0;color:var(--text-secondary);font-size:0.92rem;">${cfg.aviso}</p>
                ${inativas ? `<p style="margin:0.5rem 0 0;font-size:0.85rem;color:var(--text-muted);">Inativas: ${inativas}. Ative todas (Prova I–V) em <strong>Provas</strong>.</p>` : ''}
            `;
        } else if (avisoProvas) {
            avisoProvas.remove();
        }

        // Renderizar questões por tópico
        if (questoesPorTopico) {
            if (data.questoes_por_topico && data.questoes_por_topico.length > 0) {
                questoesPorTopico.innerHTML = data.questoes_por_topico.map(t => `
                    <div style="padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                            <strong>${t.topico}</strong>
                            <span class="badge badge-primary">${t.total_questoes}</span>
                        </div>
                        <div style="display: flex; gap: 0.5rem; font-size: 0.875rem;">
                            <span class="badge badge-facil">${t.faceis} fáceis</span>
                            <span class="badge badge-medio">${t.medias} médias</span>
                            <span class="badge badge-dificil">${t.dificeis} difíceis</span>
                        </div>
                    </div>
                `).join('');
            } else {
                questoesPorTopico.innerHTML = '<p style="color: var(--text-muted); padding: 1rem;">Nenhuma questão cadastrada por tópico.</p>';
            }
        }

        // Renderizar top alunos
        if (topAlunos) {
            if (data.top_alunos && data.top_alunos.length > 0) {
                topAlunos.innerHTML = `
                    <table style="width: 100%;">
                        <thead>
                            <tr>
                                <th>Aluno</th>
                                <th>Provas</th>
                                <th>Média</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.top_alunos.map((aluno, index) => `
                                <tr>
                                    <td>
                                        ${index < 3 ? ['🥇', '🥈', '🥉'][index] : ''} 
                                        ${aluno.nome_aluno}
                                    </td>
                                    <td>${aluno.total_provas}</td>
                                    <td><strong>${aluno.media_pontuacao !== null ? Number(aluno.media_pontuacao).toFixed(1) : '0.0'}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            } else {
                topAlunos.innerHTML = '<p style="color: var(--text-muted); padding: 1rem;">Nenhuma tentativa registrada para ranking.</p>';
            }
        }

    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        if (statsGrid) {
            statsGrid.innerHTML = `
                <div class="card" style="grid-column: 1/-1; background: rgba(239, 68, 68, 0.1); border: 1px solid var(--error);">
                    <h3 style="color: var(--error); margin-bottom: 0.5rem;">❌ Erro ao carregar dados</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-sm btn-secondary mt-2" onclick="carregarDashboard()">🔄 Tentar Novamente</button>
                </div>
            `;
        }
    }
}

// ============================================
// HISTÓRICO
// ============================================

function atualizarUiGpsEmergencia(data) {
    const status = document.getElementById('gpsEmergenciaStatus');
    const btnDesligar = document.getElementById('btnGpsEmergenciaDesligar');
    const btnLigar = document.getElementById('btnGpsEmergenciaLigar');
    const card = document.getElementById('cardGpsEmergencia');
    if (!status || !btnDesligar || !btnLigar) return;

    const exigindo = data?.exigir_gps === true;
    const emergencia = data?.gps_emergencia_desligado === true;

    if (exigindo) {
        status.innerHTML = '<strong style="color: var(--success);">ATIVO</strong> — alunos precisam autorizar o GPS para iniciar a prova.';
        btnDesligar.style.display = '';
        btnLigar.style.display = 'none';
        if (card) {
            card.style.borderColor = 'rgba(34, 197, 94, 0.35)';
            card.style.background = 'rgba(34, 197, 94, 0.06)';
        }
    } else if (emergencia) {
        status.innerHTML = '<strong style="color: var(--error);">DESLIGADO (emergência)</strong> — alunos podem iniciar sem GPS. Reative quando possível.';
        btnDesligar.style.display = 'none';
        btnLigar.style.display = '';
        if (card) {
            card.style.borderColor = 'rgba(239, 68, 68, 0.45)';
            card.style.background = 'rgba(239, 68, 68, 0.08)';
        }
    } else {
        status.innerHTML = '<strong>INATIVO</strong> — GPS desligado pela configuração do servidor (<code>EXIGIR_GPS_PROVA</code>).';
        btnDesligar.style.display = 'none';
        btnLigar.style.display = 'none';
        if (card) {
            card.style.borderColor = 'rgba(148, 163, 184, 0.35)';
            card.style.background = 'rgba(148, 163, 184, 0.06)';
        }
    }
}

async function carregarStatusGpsEmergencia() {
    const status = document.getElementById('gpsEmergenciaStatus');
    if (status) status.textContent = 'Verificando...';

    try {
        const response = await fetchAdmin(`${API_URL}/admin/config/gps`);
        if (!response.ok) {
            throw new Error('Não foi possível ler o status do GPS');
        }
        const data = await response.json();
        atualizarUiGpsEmergencia(data);
    } catch (error) {
        console.error('Erro ao carregar status GPS:', error);
        if (status) {
            status.textContent = 'Não foi possível verificar o status do GPS.';
        }
    }
}

async function alternarGpsEmergencia(desligar) {
    const msg = desligar
        ? 'Desligar exigência de GPS AGORA?\n\nAlunos que não conseguirem autorizar o GPS poderão iniciar a prova.\nUse só em emergência durante a aplicação.'
        : 'Reativar exigência de GPS?\n\nNovos alunos voltarão a precisar autorizar o GPS para iniciar a prova.';

    if (!confirm(msg)) return;

    const btnDesligar = document.getElementById('btnGpsEmergenciaDesligar');
    const btnLigar = document.getElementById('btnGpsEmergenciaLigar');
    if (btnDesligar) btnDesligar.disabled = true;
    if (btnLigar) btnLigar.disabled = true;

    try {
        const response = await fetchAdmin(`${API_URL}/admin/config/gps-emergencia`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ desligar })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Erro HTTP ${response.status}`);
        }

        atualizarUiGpsEmergencia(data);
        mostrarSucesso(desligar
            ? 'GPS desligado por emergência. Alunos podem iniciar sem GPS.'
            : 'GPS reativado. Novos alunos precisarão autorizar o GPS.');
    } catch (error) {
        console.error('Erro ao alternar GPS emergência:', error);
        mostrarErro(error.message || 'Não foi possível alterar o GPS');
        await carregarStatusGpsEmergencia();
    } finally {
        if (btnDesligar) btnDesligar.disabled = false;
        if (btnLigar) btnLigar.disabled = false;
    }
}

window.alternarGpsEmergencia = alternarGpsEmergencia;

async function carregarHistorico() {
    try {
        const response = await fetchAdmin(`${API_URL}/tentativas${appendGrupoQuery()}`);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Erro HTTP ${response.status}`);
        }
        const tentativas = await response.json();
        if (!Array.isArray(tentativas)) {
            throw new Error('Resposta inválida do servidor');
        }

        const tbody = document.getElementById('tabelaHistorico');

        if (tentativas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">Nenhuma tentativa registrada</td></tr>';
            return;
        }

        tbody.innerHTML = tentativas.map(t => `
            <tr>
                <td>${t.nome_aluno}</td>
                <td>${t.prova_titulo}</td>
                <td>${formatarData(t.iniciado_em)}</td>
                <td>
                    ${t.pontuacao !== null ?
                `<strong style="color: ${getPontuacaoCor(t.pontuacao)}">${t.pontuacao/10}</strong>` :
                '<span class="badge badge-primary">Em andamento</span>'
            }
                </td>
                <td>
                    <span class="badge badge-primary"
                        title="Informativo apenas: nesta prova é permitido consultar slides e Excel.">
                        ${t.trocas_aba || 0}
                    </span>
                </td>
                <td>
                    ${(t.alertas_compartilhamento || 0) > 0
                ? `<span class="badge" style="background:#b91c1c;color:#fff;" title="Compartilhamento detectado na planilha">${t.alertas_compartilhamento}</span>`
                : '<span class="text-muted">0</span>'}
                </td>
                <td>${t.tempo_total ? formatarTempo(t.tempo_total) : '-'}</td>
                <td>
                    ${t.planilha_url ?
                `<a href="${t.planilha_url}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary" title="${t.planilha_nome || 'Excel Online'} — entre na mesma conta Microsoft configurada em MICROSOFT_PROFESSOR_EMAIL">📊 Planilha</a>` :
                (t.planilha_usada ? '<span class="text-muted" title="Planilha usada (link não registrado)">Excel</span>' : '-')
            }
                    ${t.finalizado_em ?
                `<button class="btn btn-sm btn-secondary" onclick="verResultado(${t.id})">Ver Resultado</button>` :
                ''
            }
                    ${t.finalizado_em && t.email ?
                `<button class="btn btn-sm btn-primary" onclick="enviarEmail(${t.id}, this)" title="Enviar resultado para ${t.email}">📧 Email</button>` :
                ''
            }
                    <button class="btn btn-sm btn-danger" onclick="deletarTentativa(${t.id})">
                        Excluir
                    </button>
                </td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        if (error.message && error.message.includes('Sessão expirada')) {
            mostrarErro(error.message);
        } else {
            mostrarErro(error.message || 'Erro ao carregar histórico');
        }
    }
}

async function deletarTentativa(tentativaId) {
    if (!confirm(`Deseja realmente excluir a tentativa ID ${tentativaId}?\n\nEsta ação não pode ser desfeita.`)) {
        return;
    }

    try {
        const response = await fetchAdmin(`${API_URL}/tentativas/${tentativaId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const detalhe = errorData.details ? `: ${errorData.details}` : '';
            throw new Error((errorData.error || `Erro HTTP ${response.status}`) + detalhe);
        }

        mostrarSucesso('Tentativa excluída com sucesso.');
        carregarHistorico();
    } catch (error) {
        console.error('Erro ao excluir tentativa:', error);
        mostrarErro(`Não foi possível excluir tentativa: ${error.message}`);
    }
}

async function enviarEmail(tentativaId, btn) {
    if (!confirm(`Enviar resultado por e-mail para a tentativa ID ${tentativaId}?`)) return;

    const textoOriginal = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando...'; }

    try {
        const response = await fetch(`${API_URL}/tentativas/${tentativaId}/enviar-email`, {
            method: 'POST'
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `Erro HTTP ${response.status}`);
        }

        mostrarSucesso(data.message || 'E-mail enviado com sucesso!');
    } catch (error) {
        console.error('Erro ao enviar e-mail:', error);
        mostrarErro(`Não foi possível enviar e-mail: ${error.message}`);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = textoOriginal; }
    }
}

function rotuloTriangulacao(contexto) {
    if (contexto === 'SALA') return '<span class="badge" style="background:#166534;color:#fff">Sala</span>';
    if (contexto === 'REMOTO') return '<span class="badge" style="background:#991b1b;color:#fff">Remoto</span>';
    return '<span class="badge badge-primary">?</span>';
}

async function abrirTriangulacao() {
    const dataInput = document.getElementById('triangulacaoData');
    const data = dataInput?.value || '';
    const params = new URLSearchParams();
    if (data) params.set('data', data);
    if (GRUPO_PROVA_PATH !== 'padrao') params.set('grupo', GRUPO_PROVA_PATH);

    const content = document.getElementById('triangulacaoContent');
    content.innerHTML = '<p class="text-muted">Analisando tentativas...</p>';
    abrirModal('modalTriangulacao');

    try {
        const url = `${API_URL}/tentativas/triangulacao${appendGrupoQuery(params)}`;
        const response = await fetchAdmin(url);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${response.status}`);
        }
        const relatorio = await response.json();
        renderizarTriangulacao(relatorio, data);
    } catch (error) {
        console.error('Triangulação:', error);
        content.innerHTML = `<p style="color:var(--error)">Erro: ${error.message}</p>`;
    }
}

function renderizarTriangulacao(relatorio, dataFiltro) {
    const content = document.getElementById('triangulacaoContent');
    const { resumo, resultados } = relatorio;

    if (!resultados.length) {
        content.innerHTML = '<p class="text-muted">Nenhuma tentativa finalizada para os filtros selecionados.</p>';
        return;
    }

    const tituloData = dataFiltro ? ` — ${dataFiltro}` : ' — todas as datas';
    const clusters = Object.entries(resumo.clusters_rede || {})
        .sort((a, b) => b[1] - a[1])
        .map(([rede, n]) => `<li><code>${rede}.*</code>: ${n} aluno(s)</li>`)
        .join('');

    content.innerHTML = `
        <p class="text-muted mb-3">
            Estimativa cruzando IP, geolocalização, cluster do dia, tempo, rajada de respostas e planilha.
            <strong>Não bloqueia alunos</strong> — use como indício para investigar após a prova.
        </p>
        <div class="grid grid-4 mb-3" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.75rem;">
            <div class="card" style="padding:0.75rem;text-align:center"><div><strong>${resumo.total}</strong></div><div class="text-muted" style="font-size:0.85rem">Total</div></div>
            <div class="card" style="padding:0.75rem;text-align:center"><div><strong style="color:#166534">${resumo.sala}</strong></div><div class="text-muted" style="font-size:0.85rem">Sala</div></div>
            <div class="card" style="padding:0.75rem;text-align:center"><div><strong style="color:#991b1b">${resumo.remoto}</strong></div><div class="text-muted" style="font-size:0.85rem">Remoto</div></div>
            <div class="card" style="padding:0.75rem;text-align:center"><div><strong>${resumo.indeterminado}</strong></div><div class="text-muted" style="font-size:0.85rem">Indeterminado</div></div>
        </div>
        ${clusters ? `<p><strong>Redes no dia${tituloData}:</strong></p><ul style="margin-top:0">${clusters}</ul>` : ''}
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Contexto</th>
                        <th>Aluno</th>
                        <th>Nota</th>
                        <th>Rajada</th>
                        <th>Trocas</th>
                        <th>IP / Geo / GPS</th>
                        <th>Sinais</th>
                    </tr>
                </thead>
                <tbody>
                    ${resultados.map(r => `
                        <tr>
                            <td>${rotuloTriangulacao(r.contexto)}<br><small>${r.confianca}</small></td>
                            <td>${r.nome_aluno}<br><small>${r.matricula || ''}</small></td>
                            <td><strong>${r.nota ?? '—'}</strong></td>
                            <td>${r.rajada?.pct_ultimos_10pct_tempo ?? '—'}%</td>
                            <td>${r.trocas_aba ?? 0}</td>
                            <td><small>${r.ip_origem || '—'}<br>${r.geo_cidade || ''}${r.gps_latitude != null && r.gps_longitude != null ? `<br>GPS: ${Number(r.gps_latitude).toFixed(4)}, ${Number(r.gps_longitude).toFixed(4)}` : ''}</small></td>
                            <td><small>${(r.sinais || []).slice(0, 3).map(s => s.texto).join('<br>')}</small></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function filtrarHistorico() {
    const busca = document.getElementById('buscarAluno').value.toLowerCase();
    const linhas = document.querySelectorAll('#tabelaHistorico tr');

    linhas.forEach(linha => {
        const nomeAluno = linha.cells[0]?.textContent.toLowerCase() || '';
        if (nomeAluno.includes(busca)) {
            linha.style.display = '';
        } else {
            linha.style.display = 'none';
        }
    });
}

async function verResultado(tentativaId) {
    try {
        const response = await fetchAdmin(`${API_URL}/tentativas/${tentativaId}/resultado`);
        const resultado = await response.json();

        const modal = document.getElementById('modalResultado');
        const content = document.getElementById('resultadoContent');

        content.innerHTML = `
            <div class="mb-3">
                <h4>${resultado.prova_titulo}</h4>
                <p style="color: var(--text-muted);">Aluno: ${resultado.nome_aluno}</p>
                <p style="color: var(--text-muted);">Data: ${formatarData(resultado.iniciado_em)}</p>
                ${resultado.planilha_url ? `<p><a href="${resultado.planilha_url}" target="_blank" rel="noopener">📊 Abrir planilha do aluno${resultado.planilha_nome ? ` (${resultado.planilha_nome})` : ''}</a></p>` : ''}
            </div>
            
            <div class="stats-grid mb-3">
                <div class="stat-card">
                    <div class="stat-value" style="color: ${getPontuacaoCor(resultado.pontuacao)}">${resultado.pontuacao/10}</div>
                    <div class="stat-label">Pontuação</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${resultado.estatisticas.corretas}/${resultado.estatisticas.total_questoes}</div>
                    <div class="stat-label">Acertos</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${resultado.trocas_aba}</div>
                    <div class="stat-label" title="Métrica informativa; não indica fraude automaticamente.">Navegações fora da prova (info)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatarTempo(resultado.tempo_total)}</div>
                    <div class="stat-label">Tempo Total</div>
                </div>
            </div>
            
            <h5 class="mb-2">Respostas</h5>
            <div style="max-height: 400px; overflow-y: auto;">
                ${resultado.respostas.map((r, index) => `
                    <div class="card mb-2" style="padding: 1rem; ${r.correta ? 'border-left: 4px solid var(--success)' : 'border-left: 4px solid var(--error)'}">
                        <div class="flex-between mb-2">
                            <strong>Questão ${index + 1}</strong>
                            ${r.correta ?
                '<span class="badge badge-facil">✓ Correta</span>' :
                '<span class="badge badge-dificil">✗ Incorreta</span>'
            }
                        </div>
                        ${r.enunciado_imagem ?
                `<img src="${r.enunciado_imagem}" style="max-width: 100%; border-radius: var(--radius-md); margin-bottom: 0.5rem;">` :
                `<p>${r.enunciado}</p>`
            }
                        <p style="color: var(--text-muted); font-size: 0.875rem;">
                            Sua resposta: ${r.resposta_texto_alt || r.resposta_texto || 'Não respondida'}
                            ${!r.correta && r.gabarito_texto ? `<br>Resposta correta: ${r.gabarito_texto}` : ''}
                        </p>
                    </div>
                `).join('')}
            </div>
        `;

        modal.classList.add('active');

    } catch (error) {
        console.error('Erro ao carregar resultado:', error);
        mostrarErro('Erro ao carregar resultado');
    }
}

// ============================================
// UTILITÁRIOS
// ============================================

async function carregarTopicos() {
    try {
        const response = await fetch(`${API_URL}/topicos`);
        topicos = await response.json();

        // Atualizar selects de tópicos
        const selects = document.querySelectorAll('#filtroTopico, #questaoTopico');
        selects.forEach(select => {
            const opcoes = topicos.map(t => `<option value="${t.id}">${t.nome}</option>`).join('');
            if (select.id === 'filtroTopico') {
                select.innerHTML = '<option value="">Todos</option>' + opcoes;
            } else {
                select.innerHTML = opcoes;
            }
        });
        renderizarTopicosGeracaoEmLista();

    } catch (error) {
        console.error('Erro ao carregar tópicos:', error);
    }
}

function renderizarTopicosGeracaoEmLista() {
    const lista = document.getElementById('gerarProvaTopicosLista');
    if (!lista) return;

    const itens = topicos.map(t => `
        <label class="multi-topic-check-item">
            <input type="checkbox" class="gerar-topico-checkbox" value="${t.id}">
            <span>${t.nome}</span>
        </label>
    `).join('');

    lista.innerHTML = `
        <label class="multi-topic-check-item">
            <input type="checkbox" class="gerar-topico-checkbox" value="">
            <span>Qualquer tópico</span>
        </label>
        ${itens}
    `;

    if (!lista.dataset.boundChange) {
        lista.addEventListener('change', (event) => {
            const alvo = event.target;
            if (!alvo || !alvo.classList.contains('gerar-topico-checkbox')) return;

            const todos = Array.from(lista.querySelectorAll('.gerar-topico-checkbox'));
            const qualquer = lista.querySelector('.gerar-topico-checkbox[value=""]');

            if (alvo.value === '' && alvo.checked) {
                todos.forEach(cb => {
                    if (cb.value !== '') cb.checked = false;
                });
                return;
            }

            if (alvo.value !== '' && alvo.checked && qualquer) {
                qualquer.checked = false;
            }
        });
        lista.dataset.boundChange = '1';
    }
}

async function carregarTags() {
    try {
        const response = await fetch(`${API_URL}/tags`);
        tags = await response.json();
    } catch (error) {
        console.error('Erro ao carregar tags:', error);
    }
}

function abrirModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

function fecharModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

function mostrarErro(mensagem) {
    const aviso = document.getElementById('avisoConexaoAluno');
    if (aviso && /conexão|conexao|rede|certificado|privada|fetch/i.test(mensagem)) {
        aviso.classList.remove('hidden');
    }
    alert('❌ ' + mensagem);
}

function mensagemErroRede(error) {
    if (!error) return 'Erro de conexão. Verifique a internet.';
    if (error.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(String(error.message || error))) {
        return 'Sem conexão com o servidor. Se houver aviso de certificado, use Avançado → Continuar, ou tente 4G.';
    }
    return error.message || String(error);
}

async function verificarConexaoAluno() {
    const aviso = document.getElementById('avisoConexaoAluno');
    if (!aviso) return;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`${API_URL}/healthcheck`, { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(t);
        aviso.classList.toggle('hidden', r.ok);
    } catch (_) {
        aviso.classList.remove('hidden');
    }
}

window.verificarConexaoAluno = verificarConexaoAluno;

function mostrarSucesso(mensagem) {
    alert('✅ ' + mensagem);
}

function formatarData(dataString) {
    const data = new Date(dataString);
    return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatarTempo(segundos) {
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const segs = segundos % 60;

    if (horas > 0) {
        return `${horas}h ${minutos}m`;
    } else if (minutos > 0) {
        return `${minutos}m ${segs}s`;
    } else {
        return `${segs}s`;
    }
}

function getPontuacaoCor(pontuacao) {
    if (pontuacao >= 70) return 'var(--success)';
    if (pontuacao >= 50) return 'var(--warning)';
    return 'var(--error)';
}

function getDificuldadeBadge(dificuldade) {
    const badges = {
        'facil': 'badge-facil',
        'medio': 'badge-medio',
        'dificil': 'badge-dificil'
    };
    return badges[dificuldade] || 'badge-primary';
}

function getDificuldadeTexto(dificuldade) {
    const textos = {
        'facil': 'Fácil',
        'medio': 'Médio',
        'dificil': 'Difícil'
    };
    return textos[dificuldade] || dificuldade;
}

// Fechar modal ao clicar fora
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});
