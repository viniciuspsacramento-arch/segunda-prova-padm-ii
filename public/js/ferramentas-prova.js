// ============================================
// FERRAMENTAS DE PROVA — Google Sheets / Excel Online
// ============================================

let ferramentasConfig = null;
let googleAccessToken = null;
let googleTokenClient = null;
let msalInstance = null;
let planilhaConectada = false;
let planilhaProvedor = null;

const GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
].join(' ');

function carregarScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Falha ao carregar: ${src}`));
        document.head.appendChild(script);
    });
}

async function carregarConfigFerramentas() {
    if (ferramentasConfig) return ferramentasConfig;

    try {
        const response = await fetch(`${API_URL}/config/ferramentas`);
        ferramentasConfig = await response.json();
    } catch (error) {
        console.error('Erro ao carregar config de ferramentas:', error);
        ferramentasConfig = {};
    }

    return ferramentasConfig;
}

function ferramentasDisponiveis() {
    return !!(ferramentasConfig?.googleClientId || ferramentasConfig?.microsoftClientId);
}

function renderizarPainelSetupPlanilha() {
    const painel = document.getElementById('painelPlanilhaSetup');
    if (!painel) return;

    const googleOk = !!ferramentasConfig?.googleClientId;
    const microsoftOk = !!ferramentasConfig?.microsoftClientId;

    if (!googleOk && !microsoftOk) {
        painel.innerHTML = `
            <div class="planilha-setup">
                <h4>Planilha na prova</h4>
                <p class="text-muted">Integração não configurada pelo professor. Você pode usar Excel ou Google Sheets em outra aba, mas trocas de aba serão registradas.</p>
            </div>
        `;
        return;
    }

    painel.innerHTML = `
        <div class="planilha-setup">
            <h4>Sua planilha</h4>
            <p class="text-muted mb-3">Conecte sua conta para editar e salvar Excel ou Google Sheets sem sair desta página.</p>
            <div class="planilha-botoes-provedor">
                ${googleOk ? `
                    <button type="button" class="btn btn-planilha btn-google" onclick="conectarGooglePlanilha()">
                        <span class="planilha-icone">G</span> Google Sheets
                    </button>
                ` : ''}
                ${microsoftOk ? `
                    <button type="button" class="btn btn-planilha btn-microsoft" onclick="conectarMicrosoftPlanilha()">
                        <span class="planilha-icone">M</span> Excel Online
                    </button>
                ` : ''}
            </div>
            <div id="planilhaSetupStatus" class="planilha-status"></div>
            <div id="planilhaSetupAcoes" class="planilha-acoes hidden">
                <button type="button" class="btn btn-secondary btn-sm" onclick="criarNovaPlanilha()">Nova planilha</button>
                ${googleOk && ferramentasConfig?.googleApiKey ? `<button type="button" class="btn btn-secondary btn-sm" onclick="abrirPlanilhaExistenteGoogle()">Abrir existente</button>` : ''}
                ${microsoftOk ? `<button type="button" class="btn btn-secondary btn-sm" onclick="abrirPlanilhaExistenteMicrosoft()">Abrir existente</button>` : ''}
            </div>
            ${googleOk && !ferramentasConfig?.googleApiKey ? `<p class="text-muted" style="font-size:0.8rem;margin-top:0.5rem;">Use <strong>Nova planilha</strong> para criar e editar. Para abrir arquivo que já existe no Drive, o professor precisa configurar a API Key no Railway.</p>` : ''}
        </div>
    `;
}

async function inicializarFerramentasProva() {
    await carregarConfigFerramentas();
    renderizarPainelSetupPlanilha();
}

function setStatusPlanilha(mensagem, tipo = 'info') {
    const el = document.getElementById('planilhaSetupStatus');
    if (!el) return;
    el.className = `planilha-status planilha-status-${tipo}`;
    el.textContent = mensagem;
}

function mostrarAcoesPlanilha() {
    const acoes = document.getElementById('planilhaSetupAcoes');
    if (acoes) acoes.classList.remove('hidden');
}

function ocultarSetupPlanilha() {
    const setup = document.getElementById('painelPlanilhaSetup');
    const frame = document.getElementById('planilhaFrame');
    const badge = document.getElementById('planilhaBadgeStatus');

    if (setup) setup.classList.add('hidden');
    if (frame) frame.classList.remove('hidden');
    if (badge) {
        badge.textContent = planilhaProvedor === 'google' ? 'Google Sheets' : 'Excel Online';
        badge.classList.remove('hidden');
    }
}

function embutirPlanilha(url, provedor) {
    const frame = document.getElementById('planilhaFrame');
    if (!frame) return;

    frame.src = url;
    planilhaConectada = true;
    planilhaProvedor = provedor;
    ocultarSetupPlanilha();
    marcarFocoPlanilha(true);

    frame.addEventListener('mouseenter', () => marcarFocoPlanilha(true));
    frame.addEventListener('focus', () => marcarFocoPlanilha(true));
}

// ============================================
// GOOGLE
// ============================================

async function garantirGoogleCarregado() {
    await carregarScript('https://accounts.google.com/gsi/client');
    await carregarScript('https://apis.google.com/js/api.js');

    await new Promise((resolve) => {
        if (window.gapi?.load) {
            window.gapi.load('picker', resolve);
        } else {
            resolve();
        }
    });
}

function obterTokenGoogle() {
    return new Promise(async (resolve, reject) => {
        try {
            await garantirGoogleCarregado();

            if (googleAccessToken) {
                resolve(googleAccessToken);
                return;
            }

            googleTokenClient = google.accounts.oauth2.initTokenClient({
                client_id: ferramentasConfig.googleClientId,
                scope: GOOGLE_SCOPES,
                callback: (response) => {
                    if (response.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    googleAccessToken = response.access_token;
                    resolve(googleAccessToken);
                }
            });

            googleTokenClient.requestAccessToken({ prompt: 'select_account' });
        } catch (error) {
            reject(error);
        }
    });
}

async function conectarGooglePlanilha() {
    try {
        planilhaProvedor = 'google';
        setStatusPlanilha('Conectando conta Google...', 'info');
        await obterTokenGoogle();
        setStatusPlanilha('Conta Google conectada. Crie ou abra uma planilha.', 'success');
        mostrarAcoesPlanilha();
    } catch (error) {
        console.error('Erro Google:', error);
        setStatusPlanilha('Não foi possível conectar ao Google. Tente novamente.', 'error');
    }
}

async function criarNovaPlanilhaGoogle() {
    const token = await obterTokenGoogle();
    const nomeAluno = document.getElementById('nomeAluno')?.value?.trim() || 'Aluno';

    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            properties: { title: `Prova Estatística - ${nomeAluno}` }
        })
    });

    if (!response.ok) {
        throw new Error('Erro ao criar planilha no Google Sheets');
    }

    const data = await response.json();
    const url = `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit?rm=minimal`;
    embutirPlanilha(url, 'google');
}

async function abrirSeletorGooglePlanilha() {
    const token = await obterTokenGoogle();
    await garantirGoogleCarregado();

    if (!ferramentasConfig.googleApiKey) {
        setStatusPlanilha('Chave de API Google não configurada para abrir arquivos existentes.', 'error');
        return;
    }

    const picker = new google.picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(ferramentasConfig.googleApiKey)
        .addView(new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
            .setIncludeFolders(false)
            .setSelectFolderEnabled(false))
        .setCallback((data) => {
            if (data.action === google.picker.Action.PICKED && data.docs?.[0]) {
                const doc = data.docs[0];
                const url = `https://docs.google.com/spreadsheets/d/${doc.id}/edit?rm=minimal`;
                embutirPlanilha(url, 'google');
            }
        })
        .setTitle('Selecione sua planilha')
        .build();

    picker.setVisible(true);
}

// ============================================
// MICROSOFT
// ============================================

async function garantirMsalCarregado() {
    await carregarScript('https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js');

    if (!msalInstance) {
        msalInstance = new msal.PublicClientApplication({
            auth: {
                clientId: ferramentasConfig.microsoftClientId,
                authority: `https://login.microsoftonline.com/${ferramentasConfig.microsoftTenantId || 'common'}`,
                redirectUri: window.location.origin + window.location.pathname
            },
            cache: {
                cacheLocation: 'sessionStorage'
            }
        });
        await msalInstance.initialize();
    }
}

async function obterTokenMicrosoft() {
    await garantirMsalCarregado();

    const request = {
        scopes: ['Files.ReadWrite', 'User.Read']
    };

    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
        try {
            const silent = await msalInstance.acquireTokenSilent({ ...request, account: accounts[0] });
            return silent.accessToken;
        } catch (_) {
            // popup abaixo
        }
    }

    const result = await msalInstance.loginPopup(request);
    return result.accessToken;
}

async function conectarMicrosoftPlanilha() {
    try {
        planilhaProvedor = 'microsoft';
        setStatusPlanilha('Conectando conta Microsoft...', 'info');
        await obterTokenMicrosoft();
        setStatusPlanilha('Conta Microsoft conectada. Crie ou abra uma planilha.', 'success');
        mostrarAcoesPlanilha();
    } catch (error) {
        console.error('Erro Microsoft:', error);
        setStatusPlanilha('Não foi possível conectar à Microsoft. Tente novamente.', 'error');
    }
}

async function criarNovaPlanilhaMicrosoft() {
    const token = await obterTokenMicrosoft();
    const nomeAluno = document.getElementById('nomeAluno')?.value?.trim() || 'Aluno';

    const createRes = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: `Prova Estatística - ${nomeAluno}.xlsx`,
            file: {},
            '@microsoft.graph.conflictBehavior': 'rename'
        })
    });

    if (!createRes.ok) {
        throw new Error('Erro ao criar arquivo Excel no OneDrive');
    }

    const file = await createRes.json();
    await embutirPlanilhaMicrosoft(token, file.id);
}

async function embutirPlanilhaMicrosoft(token, itemId) {
    const linkRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: 'embed', scope: 'anonymous' })
    });

    if (linkRes.ok) {
        const linkData = await linkRes.json();
        if (linkData.link?.webUrl) {
            embutirPlanilha(linkData.link.webUrl, 'microsoft');
            return;
        }
    }

    const itemRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}?select=webUrl`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!itemRes.ok) {
        throw new Error('Erro ao obter link da planilha');
    }

    const item = await itemRes.json();
    embutirPlanilha(item.webUrl, 'microsoft');
}

async function abrirSeletorMicrosoftPlanilha() {
    const token = await obterTokenMicrosoft();

    const response = await fetch(
        "https://graph.microsoft.com/v1.0/me/drive/root/search(q='.xlsx')?$select=id,name,webUrl&$top=20",
        { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
        setStatusPlanilha('Erro ao buscar arquivos Excel.', 'error');
        return;
    }

    const data = await response.json();
    const arquivos = (data.value || []).filter((f) => f.name?.toLowerCase().endsWith('.xlsx'));

    if (arquivos.length === 0) {
        setStatusPlanilha('Nenhum arquivo .xlsx encontrado no OneDrive.', 'error');
        return;
    }

    const painel = document.getElementById('painelPlanilhaSetup');
    const lista = document.createElement('div');
    lista.className = 'planilha-lista-arquivos';
    lista.innerHTML = '<p class="text-muted mb-2">Selecione um arquivo:</p>';

    arquivos.forEach((arquivo) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary btn-sm planilha-arquivo-item';
        btn.textContent = arquivo.name;
        btn.onclick = async () => {
            try {
                setStatusPlanilha('Abrindo planilha...', 'info');
                await embutirPlanilhaMicrosoft(token, arquivo.id);
            } catch (error) {
                setStatusPlanilha(error.message, 'error');
            }
        };
        lista.appendChild(btn);
    });

    painel.querySelector('.planilha-setup')?.appendChild(lista);
}

// ============================================
// AÇÕES COMUNS
// ============================================

async function criarNovaPlanilha() {
    try {
        setStatusPlanilha('Criando planilha...', 'info');

        if (planilhaProvedor === 'google') {
            await criarNovaPlanilhaGoogle();
            return;
        }

        if (planilhaProvedor === 'microsoft') {
            await criarNovaPlanilhaMicrosoft();
            return;
        }

        setStatusPlanilha('Conecte uma conta antes de criar a planilha.', 'error');
    } catch (error) {
        console.error('Erro ao criar planilha:', error);
        setStatusPlanilha(error.message || 'Erro ao criar planilha.', 'error');
    }
}

async function abrirPlanilhaExistenteGoogle() {
    planilhaProvedor = 'google';
    try {
        await obterTokenGoogle();
        await abrirSeletorGooglePlanilha();
    } catch (error) {
        setStatusPlanilha(error.message || 'Erro ao abrir planilha.', 'error');
    }
}

async function abrirPlanilhaExistenteMicrosoft() {
    planilhaProvedor = 'microsoft';
    try {
        await abrirSeletorMicrosoftPlanilha();
    } catch (error) {
        setStatusPlanilha(error.message || 'Erro ao abrir planilha.', 'error');
    }
}

function alternarPainelPlanilha() {
    const col = document.getElementById('provaColPlanilha');
    if (col) col.classList.toggle('planilha-colapsada');
}

function marcarFocoPlanilha(ativo) {
    window._focoNaPlanilha = ativo;
    setTimeout(() => {
        if (!document.activeElement?.closest('#provaColPlanilha')) {
            window._focoNaPlanilha = false;
        }
    }, 300);
}

function resetarFerramentasProva() {
    planilhaConectada = false;
    planilhaProvedor = null;
    googleAccessToken = null;
    window._focoNaPlanilha = false;

    const frame = document.getElementById('planilhaFrame');
    if (frame) {
        frame.src = 'about:blank';
        frame.classList.add('hidden');
    }
}
