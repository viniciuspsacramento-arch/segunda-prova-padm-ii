// ============================================
// FERRAMENTAS DE PROVA — Google Sheets / Excel Online
// ============================================

let ferramentasConfig = null;
let googleAccessToken = null;
let googleTokenClient = null;
let msalInstance = null;
let planilhaConectada = false;
let planilhaProvedor = null;
let planilhaUrlAtual = null;
let planilhaPopup = null;
let planilhaMonitorTimer = null;
let planilhaGoogleFileIdMonitor = null;
const permissoesCompartilhamentoReportadas = new Set();
let uploadPlanilhaProvedorPendente = null;
const PLANILHA_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

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
            <p class="text-muted mb-3">Conecte sua conta Google ou Microsoft. O Google Sheets abre em uma <strong>janela ao lado</strong> (o navegador não permite editar dentro da página). Você pode <strong>enviar um arquivo do computador</strong> (.xlsx, .xls ou .csv) ou abrir/criar na nuvem. Mantenha a janela da planilha aberta durante a prova.</p>
            <div class="planilha-botoes-provedor">
                ${googleOk ? `
                    <button type="button" class="btn btn-planilha btn-google" onclick="iniciarPlanilhaGoogle()">
                        <span class="planilha-icone">G</span> Google Sheets — nova planilha
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm planilha-upload-btn" onclick="enviarPlanilhaDoComputadorGoogle()">
                        ↑ Enviar planilha do computador (Google)
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="abrirGoogleSheetsModoSimples()">
                        Abrir planilha em branco (sem envio)
                    </button>
                ` : ''}
                ${microsoftOk ? `
                    <button type="button" class="btn btn-planilha btn-microsoft" onclick="conectarMicrosoftPlanilha()">
                        <span class="planilha-icone">M</span> Excel Online
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm planilha-upload-btn" onclick="enviarPlanilhaDoComputadorMicrosoft()">
                        ↑ Enviar planilha do computador (Excel)
                    </button>
                ` : ''}
            </div>
            <div id="planilhaSetupStatus" class="planilha-status"></div>
            <div id="planilhaSetupAcoes" class="planilha-acoes hidden">
                <button type="button" class="btn btn-secondary btn-sm" onclick="criarNovaPlanilha()">Nova planilha</button>
                ${googleOk && ferramentasConfig?.googleApiKey ? `<button type="button" class="btn btn-secondary btn-sm" onclick="abrirPlanilhaExistenteGoogle()">Abrir existente</button>` : ''}
                ${microsoftOk ? `<button type="button" class="btn btn-secondary btn-sm" onclick="abrirPlanilhaExistenteMicrosoft()">Abrir existente</button>` : ''}
            </div>
            ${googleOk && !ferramentasConfig?.googleApiKey ? `<p class="text-muted" style="font-size:0.8rem;margin-top:0.5rem;">Para <strong>Abrir existente</strong> no Drive (arquivo já na nuvem), o professor precisa configurar a API Key no Railway. <strong>Enviar do computador</strong> funciona sem API Key.</p>` : ''}
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
    const badge = document.getElementById('planilhaBadgeStatus');

    if (setup) setup.classList.add('hidden');
    if (badge) {
        badge.textContent = planilhaProvedor === 'google' ? 'Google Sheets' : 'Excel Online';
        badge.classList.remove('hidden');
    }
}

function abrirPlanilhaEmJanela(url) {
    if (!url) return null;

    const largura = Math.min(1100, Math.floor(window.screen.width * 0.55));
    const altura = Math.floor(window.screen.height * 0.85);
    const esquerda = window.screenX + window.outerWidth - largura - 24;
    const topo = window.screenY + 40;
    const features = `width=${largura},height=${altura},left=${esquerda},top=${topo},resizable=yes,scrollbars=yes`;

    if (planilhaPopup && !planilhaPopup.closed) {
        planilhaPopup.location.href = url;
        planilhaPopup.focus();
    } else {
        planilhaPopup = window.open(url, 'planilhaProvaAluno', features);
    }
    window.planilhaPopup = planilhaPopup;

    window._focoNaPlanilha = true;
    if (planilhaPopup) {
        planilhaPopup.focus();
    }
    return planilhaPopup;
}

function mostrarPainelPlanilhaAtiva(url, provedor) {
    const frame = document.getElementById('planilhaFrame');
    const painel = document.getElementById('planilhaPainelAtivo');
    if (!painel) return;

    frame?.classList.add('hidden');
    painel.classList.remove('hidden');

    const titulo = provedor === 'google' ? 'Google Sheets' : 'Excel Online';
    painel.innerHTML = `
        <div class="planilha-ativa-card">
            <h4>${titulo} — aberta</h4>
            <p class="text-muted">Sua planilha está em uma janela ao lado desta prova. Use <strong>Alt+Tab</strong> para alternar. <strong>Não compartilhe</strong> esta planilha com outras pessoas (link público desativado).</p>
            <button type="button" class="btn btn-primary btn-sm" onclick="reabrirPlanilhaAtual()">↗ Reabrir planilha</button>
        </div>
    `;

    planilhaUrlAtual = url;
    planilhaConectada = true;
    planilhaProvedor = provedor;
    ocultarSetupPlanilha();
}

function reabrirPlanilhaAtual() {
    if (planilhaUrlAtual) {
        abrirPlanilhaEmJanela(planilhaUrlAtual);
    }
}

function extrairIdPlanilhaGoogle(url) {
    if (!url) return null;
    const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : null;
}

function pararMonitoramentoCompartilhamento() {
    if (planilhaMonitorTimer) {
        clearInterval(planilhaMonitorTimer);
        planilhaMonitorTimer = null;
    }
    planilhaGoogleFileIdMonitor = null;
    permissoesCompartilhamentoReportadas.clear();
}

async function verificarCompartilhamentoGoogle(fileId) {
    if (!fileId || typeof window.reportarCompartilhamentoPlanilha !== 'function') return;

    try {
        const token = googleAccessToken || (await obterTokenGoogle());
        const permRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,type,role,emailAddress)`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!permRes.ok) return;

        const permData = await permRes.json();
        for (const p of permData.permissions || []) {
            const suspeito =
                p.type === 'anyone' ||
                p.type === 'domain' ||
                (p.type === 'user' && p.role && p.role !== 'owner');

            if (!suspeito || permissoesCompartilhamentoReportadas.has(p.id)) continue;

            permissoesCompartilhamentoReportadas.add(p.id);

            let detalhes = `Permissão ${p.type}`;
            if (p.type === 'anyone') detalhes = 'Link público ou “qualquer pessoa com o link”';
            else if (p.type === 'domain') detalhes = 'Compartilhamento com domínio inteiro';
            else if (p.type === 'user') {
                detalhes = `Convidou ${p.emailAddress || 'outro usuário'} (${p.role || 'acesso'})`;
            }

            await window.reportarCompartilhamentoPlanilha({
                tipo: 'google_drive',
                detalhes,
                planilha_id: fileId
            });
        }
    } catch (err) {
        console.warn('Monitor de compartilhamento:', err);
    }
}

function iniciarMonitoramentoCompartilhamentoGoogle(fileId) {
    if (!fileId) return;
    pararMonitoramentoCompartilhamento();
    planilhaGoogleFileIdMonitor = fileId;
    verificarCompartilhamentoGoogle(fileId);
    planilhaMonitorTimer = setInterval(() => {
        if (planilhaGoogleFileIdMonitor === fileId) {
            verificarCompartilhamentoGoogle(fileId);
        }
    }, 45000);
}

function embutirPlanilha(url, provedor) {
    planilhaUrlAtual = url;
    planilhaConectada = true;
    planilhaProvedor = provedor;
    ocultarSetupPlanilha();

    // Google bloqueia edição em iframe em sites externos (cookies/segurança)
    if (provedor === 'google') {
        abrirPlanilhaEmJanela(url);
        mostrarPainelPlanilhaAtiva(url, provedor);
        const fileId = extrairIdPlanilhaGoogle(url);
        if (fileId) iniciarMonitoramentoCompartilhamentoGoogle(fileId);
        return;
    }

    const frame = document.getElementById('planilhaFrame');
    const painel = document.getElementById('planilhaPainelAtivo');
    if (frame) {
        painel?.classList.add('hidden');
        frame.classList.remove('hidden');
        frame.src = url;
        marcarFocoPlanilha(true);
        frame.addEventListener('mouseenter', () => marcarFocoPlanilha(true));
        frame.addEventListener('focus', () => marcarFocoPlanilha(true));
    }
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

function obterTokenGoogle(opcoes = {}) {
    const forceConsent = opcoes.forceConsent === true;
    return new Promise(async (resolve, reject) => {
        try {
            await garantirGoogleCarregado();

            if (googleAccessToken && !forceConsent) {
                resolve(googleAccessToken);
                return;
            }

            if (forceConsent) {
                googleAccessToken = null;
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

            googleTokenClient.requestAccessToken({
                prompt: forceConsent ? 'consent' : 'select_account'
            });
        } catch (error) {
            reject(error);
        }
    });
}

function extrairMensagemErroApi(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    if (payload.error) {
        if (typeof payload.error === 'string') return payload.error;
        if (payload.error.message) return payload.error.message;
    }
    if (payload.google?.message) return payload.google.message;
    return '';
}

function traduzirErroGoogle(status, errBody, fallback, contexto = '') {
    const msg = extrairMensagemErroApi(errBody) || (errBody?.error?.message) || fallback || '';
    const isUpload = contexto === 'upload';

    if (/drive/i.test(msg) || /Google Drive API/i.test(msg)) {
        return 'Ative a Google Drive API no Cloud (APIs e serviços → Biblioteca). '
            + 'Criar planilha nova usa Sheets; enviar arquivo do PC usa Drive.';
    }
    if (status === 403 || /forbidden|access not|não autorizado|unauthorized/i.test(msg)) {
        if (isUpload) {
            return 'Upload negado pelo Google. Ative a Google Drive API no mesmo projeto do OAuth, '
                + 'faça login de novo (permissão Drive) e tente outra vez. '
                + 'Enquanto isso use "Google Sheets — nova planilha" e copie/cole os dados.';
        }
        return 'Google negou acesso. Ative Google Sheets API (e Drive API para upload), '
            + 'confira Usuários de teste no OAuth, e tente de novo.';
    }
    if (/not enabled|has not been used/i.test(msg)) {
        if (isUpload) {
            return 'Google Drive API não está ativa neste projeto. Ative na Biblioteca do Cloud e aguarde 2 minutos.';
        }
        return 'Ative a Google Sheets API na Biblioteca do Google Cloud e aguarde 2 minutos.';
    }
    return msg || 'Erro ao conectar com o Google.';
}

function abrirGoogleSheetsModoSimples() {
    planilhaProvedor = 'google';
    const url = 'https://docs.google.com/spreadsheets/create';
    const popup = abrirPlanilhaEmJanela(url);
    if (!popup) {
        setStatusPlanilha('Permita popups neste site (ícone na barra de endereço) e clique de novo.', 'error');
        return;
    }
    mostrarPainelPlanilhaAtiva(url, 'google');
    setStatusPlanilha('Planilha aberta ao lado. Faça login no Google se pedir.', 'success');
}

async function iniciarPlanilhaGoogle() {
    planilhaProvedor = 'google';
    try {
        setStatusPlanilha('Conectando e criando planilha...', 'info');
        await obterTokenGoogle();
        await criarNovaPlanilhaGoogle();
        setStatusPlanilha('Planilha aberta na janela ao lado. Use Alt+Tab para alternar.', 'success');
    } catch (error) {
        console.error('Erro Google:', error);
        setStatusPlanilha('Não foi possível criar pela API. Abrindo planilha em branco...', 'info');
        abrirGoogleSheetsModoSimples();
    }
}

async function conectarGooglePlanilha() {
    try {
        planilhaProvedor = 'google';
        setStatusPlanilha('Conectando conta Google...', 'info');
        await obterTokenGoogle();
        setStatusPlanilha('Conta Google conectada. Clique em Nova planilha.', 'success');
        mostrarAcoesPlanilha();
    } catch (error) {
        console.error('Erro Google:', error);
        setStatusPlanilha('Não foi possível conectar ao Google. Tente novamente.', 'error');
    }
}

async function restringirCompartilhamentoGoogle(token, fileId) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            writersCanShare: false,
            copyRequiresWriterPermission: true,
            viewersCanCopyContent: false
        })
    });

    const permRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,type,role)`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!permRes.ok) return;

    const permData = await permRes.json();
    for (const p of permData.permissions || []) {
        if (p.type === 'anyone' || p.type === 'domain') {
            await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${p.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
        }
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
        const errBody = await response.json().catch(() => ({}));
        throw new Error(traduzirErroGoogle(response.status, errBody, `Erro ${response.status} ao criar planilha`));
    }

    const data = await response.json();
    await restringirCompartilhamentoGoogle(token, data.spreadsheetId);
    const url = `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`;
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
        .setCallback(async (data) => {
            if (data.action === google.picker.Action.PICKED && data.docs?.[0]) {
                const doc = data.docs[0];
                try {
                    await restringirCompartilhamentoGoogle(token, doc.id);
                } catch (_) { /* segue mesmo se falhar */ }
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

function garantirInputArquivoPlanilha() {
    let input = document.getElementById('planilhaArquivoLocal');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'planilhaArquivoLocal';
        input.className = 'hidden';
        input.accept = '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
        input.addEventListener('change', onArquivoPlanilhaLocalSelecionado);
        document.body.appendChild(input);
    }
    return input;
}

function nomeSeguroPlanilha(nomeOriginal) {
    const base = String(nomeOriginal || 'planilha')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .trim() || 'planilha';
    return base.length > 120 ? base.slice(0, 120) : base;
}

async function enviarPlanilhaDoComputadorGoogle() {
    planilhaProvedor = 'google';
    uploadPlanilhaProvedorPendente = 'google';
    try {
        setStatusPlanilha(
            'Escolha o arquivo. Se o Google mostrar aviso, use Continuar (teste) — nao so Voltar a seguranca. Exige Drive API ativa no Cloud.',
            'info'
        );
        await obterTokenGoogle();
        const input = garantirInputArquivoPlanilha();
        input.value = '';
        input.click();
    } catch (error) {
        console.error('Erro ao iniciar envio Google:', error);
        setStatusPlanilha(error.message || 'Não foi possível conectar ao Google.', 'error');
        uploadPlanilhaProvedorPendente = null;
    }
}

async function enviarPlanilhaDoComputadorMicrosoft() {
    planilhaProvedor = 'microsoft';
    uploadPlanilhaProvedorPendente = 'microsoft';
    try {
        setStatusPlanilha('Conecte sua conta Microsoft para enviar o arquivo...', 'info');
        await obterTokenMicrosoft();
        const input = garantirInputArquivoPlanilha();
        input.value = '';
        input.click();
    } catch (error) {
        console.error('Erro ao iniciar envio Microsoft:', error);
        setStatusPlanilha(error.message || 'Não foi possível conectar à Microsoft.', 'error');
        uploadPlanilhaProvedorPendente = null;
    }
}

async function onArquivoPlanilhaLocalSelecionado(ev) {
    const file = ev.target.files?.[0];
    const provedor = uploadPlanilhaProvedorPendente;
    uploadPlanilhaProvedorPendente = null;
    if (!file || !provedor) return;

    try {
        if (file.size > PLANILHA_UPLOAD_MAX_BYTES) {
            throw new Error('Arquivo muito grande. Tamanho máximo: 15 MB.');
        }

        if (provedor === 'google') {
            await uploadPlanilhaParaGoogle(file);
            return;
        }
        if (provedor === 'microsoft') {
            await uploadPlanilhaParaMicrosoft(file);
        }
    } catch (error) {
        console.error('Erro ao enviar planilha:', error);
        setStatusPlanilha(error.message || 'Erro ao enviar planilha do computador.', 'error');
    } finally {
        ev.target.value = '';
    }
}

async function driveMultipartUpload(token, file, converterParaPlanilhaGoogle) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('access_token', token);
    formData.append('convert', converterParaPlanilhaGoogle ? '1' : '0');

    const response = await fetch(`${API_URL}/planilha/google-upload`, {
        method: 'POST',
        body: formData
    });

    const errBody = await response.json().catch(() => ({}));
    if (!response.ok) {
        const err = new Error(
            traduzirErroGoogle(response.status, errBody, 'Erro ao enviar planilha para o Google', 'upload')
        );
        err.status = response.status;
        err.errBody = errBody;
        const detalhe = extrairMensagemErroApi(errBody);
        if (detalhe && !err.message.includes(detalhe)) {
            err.message += ` (${detalhe})`;
        }
        throw err;
    }

    return errBody;
}

async function uploadPlanilhaParaGoogle(file) {
    let token = await obterTokenGoogle();
    setStatusPlanilha('Enviando arquivo (via servidor da prova) para o Google Drive...', 'info');

    const precisaReauth = (err) =>
        err?.status === 401 ||
        err?.status === 403 ||
        /token|auth|drive|not enabled|forbidden|insufficient|scope/i.test(String(err?.message || ''));

    let data;
    try {
        data = await driveMultipartUpload(token, file, true);
    } catch (err) {
        if (precisaReauth(err) && !err._retry) {
            googleAccessToken = null;
            setStatusPlanilha('Permissao Drive: na tela do Google use Continuar. Tentando login de novo...', 'info');
            token = await obterTokenGoogle({ forceConsent: true });
            err._retry = true;
            data = await driveMultipartUpload(token, file, true);
        } else {
            throw err;
        }
    }

    await restringirCompartilhamentoGoogle(token, data.id);

    const url =
        data.mimeType === 'application/vnd.google-apps.spreadsheet'
            ? `https://docs.google.com/spreadsheets/d/${data.id}/edit`
            : `https://drive.google.com/file/d/${data.id}/view`;

    embutirPlanilha(url, 'google');
    ocultarSetupPlanilha();
    setStatusPlanilha('Planilha enviada e aberta. Use Alt+Tab para alternar.', 'success');
}

async function uploadPlanilhaParaMicrosoft(file) {
    const token = await obterTokenMicrosoft();
    const nomeArquivo = nomeSeguroPlanilha(file.name);
    const caminho = encodeURIComponent(nomeArquivo);

    setStatusPlanilha('Enviando arquivo para o OneDrive...', 'info');

    const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/root:/Prova/${caminho}:/content`,
        {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            },
            body: file
        }
    );

    if (!response.ok) {
        throw new Error('Erro ao enviar planilha para o OneDrive. Tente novamente.');
    }

    const item = await response.json();
    await embutirPlanilhaMicrosoft(token, item.id);
    ocultarSetupPlanilha();
    setStatusPlanilha('Planilha enviada e aberta no Excel Online.', 'success');
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
    pararMonitoramentoCompartilhamento();
    planilhaConectada = false;
    planilhaProvedor = null;
    planilhaUrlAtual = null;
    googleAccessToken = null;
    window._focoNaPlanilha = false;

    if (planilhaPopup && !planilhaPopup.closed) {
        planilhaPopup.close();
    }
    planilhaPopup = null;

    const frame = document.getElementById('planilhaFrame');
    if (frame) {
        frame.src = 'about:blank';
        frame.classList.add('hidden');
    }

    const painel = document.getElementById('planilhaPainelAtivo');
    if (painel) {
        painel.classList.add('hidden');
        painel.innerHTML = '';
    }
}
