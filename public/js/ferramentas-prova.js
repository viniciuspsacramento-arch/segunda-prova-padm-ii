// ============================================
// FERRAMENTAS DE PROVA — Excel Online (Microsoft)
// ============================================

let ferramentasConfig = null;
let msalInstance = null;
let msalRedirectTratado = false;
let msalTokenPromise = null;
let planilhaTravada = false;
let planilhaNomeArquivo = null;
let planilhaConectada = false;
let planilhaProvedor = null;
let uploadPlanilhaPendente = false;
let planilhaUrlAtual = null;
let planilhaUrlAdmin = null;
let planilhaItemIdAtual = null;
let planilhaPopup = null;
let planilhaExcelNavegou = false;
let planilhaAcaoPendenteAtual = null;
let planilhaMonitorTimer = null;
let planilhaItemIdMonitor = null;
const permissoesCompartilhamentoReportadas = new Set();
const PLANILHA_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
const SESSAO_PLANILHA_KEY = 'provaPlanilhaAtiva';
const PLANILHA_ACAO_PENDENTE_KEY = 'planilhaAcaoPendente';
const PLANILHA_RETORNO_URL_KEY = 'planilhaRetornoUrl';
const PLANILHA_PASTA_ONEDRIVE = 'Prova';
// .xlsx mínimo válido (planilha em branco real — evita arquivo vazio que quebra o Excel Online)
const XLSX_BLANK_BASE64 = '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';

const MSAL_SCRIPT_URLS = [
    '/vendor/msal/msal-browser.min.js',
    '/js/msal-browser.min.js'
];

function carregarScript(src) {
    return new Promise((resolve, reject) => {
        const existente = document.querySelector(`script[src="${src}"]`);
        if (existente) {
            if (existente.dataset.loaded === '1') {
                resolve();
                return;
            }
            existente.addEventListener('load', () => resolve(), { once: true });
            existente.addEventListener('error', () => reject(new Error(`Falha ao carregar: ${src}`)), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => {
            script.dataset.loaded = '1';
            resolve();
        };
        script.onerror = () => reject(new Error(`Falha ao carregar: ${src}`));
        document.head.appendChild(script);
    });
}

async function carregarMsalBrowser() {
    if (window.msal?.PublicClientApplication) return;

    let ultimoErro = null;
    for (const url of MSAL_SCRIPT_URLS) {
        try {
            await carregarScript(url);
            if (window.msal?.PublicClientApplication) return;
        } catch (error) {
            ultimoErro = error;
        }
    }
    throw ultimoErro || new Error('Biblioteca MSAL indisponível.');
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
    return !!ferramentasConfig?.microsoftClientId;
}

function renderizarPainelSetupPlanilha() {
    const painel = document.getElementById('painelPlanilhaSetup');
    if (!painel) return;

    const microsoftOk = !!ferramentasConfig?.microsoftClientId;

    if (!microsoftOk) {
        painel.innerHTML = `
            <div class="planilha-setup">
                <h4>Planilha na prova</h4>
                <p class="text-muted">Integração do <strong>Excel Online</strong> não configurada pelo professor. Se você abrir o Excel em outra aba, trocas de aba serão registradas.</p>
            </div>
        `;
        return;
    }

    painel.innerHTML = `
        <div class="planilha-setup">
            <h4>Sua planilha</h4>
            <div class="planilha-aviso-conta" role="alert">
                <strong>⚠️ Conta Microsoft obrigatória para o Excel</strong>
                <p>Use <strong>@outlook.com</strong>, <strong>@hotmail.com</strong> ou <strong>@live.com</strong>.</p>
                <p><strong>Gmail (@gmail.com) não funciona</strong> na planilha — só no e-mail da prova. Sem conta? Crie grátis em <strong>outlook.com</strong>.</p>
            </div>
            <p class="text-muted mb-2">No <strong>início da prova</strong>, escolha <strong>uma única planilha</strong> para usar. Depois de abrir, <strong>não será possível enviar ou trocar</strong> o arquivo.</p>
            <p class="planilha-aviso-inicio text-muted mb-3">Clique <strong>uma vez</strong> em uma opção. O Excel abre em <strong>janela separada</strong> (Alt+Tab). Salva no OneDrive. Não clique várias vezes.</p>
            <div id="planilhaSetupStatus" class="planilha-status"></div>
            <div id="planilhaSetupAcoes" class="planilha-acoes">
                <p class="text-muted planilha-escolha-titulo mb-2">Escolha uma opção (só uma vez). Não tem planilha? Use <strong>Nova planilha em branco</strong>.</p>
                <button type="button" id="btnNovaPlanilha" class="btn btn-primary btn-sm" onclick="criarNovaPlanilha()">Nova planilha em branco</button>
                <button type="button" id="btnUploadComputador" class="btn btn-secondary btn-sm planilha-upload-btn" onclick="enviarPlanilhaDoComputadorMicrosoft()">↑ Enviar do computador</button>
                <button type="button" id="btnAbrirOneDrive" class="btn btn-secondary btn-sm" onclick="abrirPlanilhaExistenteMicrosoft()">Abrir do OneDrive</button>
            </div>
            <div id="planilhaSetupTravada" class="planilha-travada hidden">
                <p class="text-muted mb-0">Planilha definida. Edite normalmente no Excel Online; não é possível enviar ou trocar o arquivo durante a prova.</p>
            </div>
        </div>
    `;
}

async function inicializarFerramentasProva() {
    limparLockInteracaoMsalStale();
    await carregarConfigFerramentas();
    let temSessaoPlanilha = false;
    try {
        temSessaoPlanilha = !!sessionStorage.getItem(SESSAO_PLANILHA_KEY);
    } catch (_) {
        // ignora
    }
    if (!temSessaoPlanilha) {
        renderizarPainelSetupPlanilha();
    }
    await retomarAcaoPlanilhaPendenteSeExistir();
}

// Após um login Microsoft via redirecionamento de página inteira, o aluno volta
// para a prova automaticamente. Aqui retomamos a ação que ele tinha começado.
async function retomarAcaoPlanilhaPendenteSeExistir() {
    let acao = null;
    try {
        acao = sessionStorage.getItem(PLANILHA_ACAO_PENDENTE_KEY);
        sessionStorage.removeItem(PLANILHA_ACAO_PENDENTE_KEY);
        sessionStorage.removeItem(PLANILHA_RETORNO_URL_KEY);
    } catch (_) {
        return;
    }
    if (!acao || planilhaTravada) return;

    setStatusPlanilha('Login Microsoft concluído. Preparando sua planilha...', 'info');
    desabilitarBotoesPlanilha(true);

    try {
        if (acao === 'nova') {
            const token = await obterTokenMicrosoft();
            const nomeAluno = document.getElementById('nomeAluno')?.value?.trim()
                || window.tentativaAtual?.nome_aluno || 'Aluno';
            const nomeArquivo = `Prova Estatística - ${nomeAluno}.xlsx`;
            const caminho = encodeURIComponent(nomeSeguroPlanilha(nomeArquivo));

            const response = await fetchComRetry(
                `https://graph.microsoft.com/v1.0/me/drive/root:/${PLANILHA_PASTA_ONEDRIVE}/${caminho}:/content`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    },
                    body: bytesPlanilhaEmBranco()
                }
            );
            if (!response.ok) throw new Error('Erro ao criar arquivo Excel no OneDrive. Tente novamente.');

            const item = await response.json();
            const urlExcel = await resolverUrlExcelMicrosoft(token, item.id, item.webUrl);
            apresentarBotaoAbrirPlanilhaPendente(urlExcel, item.name || nomeArquivo, item.id);
        } else if (acao === 'onedrive') {
            await abrirSeletorMicrosoftPlanilha();
        } else if (acao === 'upload') {
            setStatusPlanilha('Conta Microsoft conectada. Clique novamente em "Enviar do computador" para escolher o arquivo.', 'success');
        }
    } catch (error) {
        console.error('Erro ao retomar ação da planilha:', error);
        setStatusPlanilha(mensagemErroMicrosoft(error) || error.message || 'Erro ao concluir a conexão com a Microsoft.', 'error');
    } finally {
        if (!planilhaTravada) desabilitarBotoesPlanilha(false);
    }
}

function apresentarBotaoAbrirPlanilhaPendente(url, nomeArquivo, itemId) {
    const painel = document.getElementById('painelPlanilhaSetup');
    if (!painel) return;
    painel.querySelector('.planilha-abrir-pendente')?.remove();

    const bloco = document.createElement('div');
    bloco.className = 'planilha-abrir-pendente';
    bloco.innerHTML = `
        <p class="text-muted mb-2">Sua planilha <strong>${nomeArquivo}</strong> está pronta.</p>
        <button type="button" class="btn btn-primary btn-sm">▶ Abrir planilha agora</button>
    `;
    bloco.querySelector('button').onclick = () => {
        embutirPlanilha(url, nomeArquivo, itemId);
        bloco.remove();
    };
    painel.querySelector('.planilha-setup')?.appendChild(bloco);
    setStatusPlanilha('Planilha pronta. Clique em "Abrir planilha agora".', 'success');
}

function setStatusPlanilha(mensagem, tipo = 'info') {
    const el = document.getElementById('planilhaSetupStatus');
    if (!el) return;
    el.className = `planilha-status planilha-status-${tipo}`;
    el.textContent = mensagem;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function marcarAuthInteracao(ativo) {
    window._authInteracaoEmAndamento = ativo;
}

async function fetchComRetry(url, options = {}, tentativas = 3, timeoutMs = 12000) {
    let ultimoErro = null;
    for (let i = 0; i < tentativas; i++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            if (res.ok || (res.status < 500 && res.status !== 429)) return res;
            if (i < tentativas - 1) await sleep(700 * (i + 1));
            else return res;
        } catch (error) {
            ultimoErro = error;
            if (i < tentativas - 1) await sleep(700 * (i + 1));
        } finally {
            clearTimeout(timeout);
        }
    }
    if (ultimoErro) throw ultimoErro;
    throw new Error('Servico temporariamente indisponivel. Aguarde alguns segundos e tente de novo.');
}

function desabilitarBotoesPlanilha(desabilitar) {
    document.querySelectorAll(
        '#painelPlanilhaSetup button, .planilha-botoes-provedor button, .planilha-acoes button'
    ).forEach((btn) => {
        if (!planilhaTravada) btn.disabled = desabilitar;
    });
}

function garantirPlanilhaNaoTravada() {
    if (planilhaTravada) {
        throw new Error('A planilha já foi definida. Não é possível enviar ou trocar o arquivo durante a prova.');
    }
}

function travarPlanilha(nomeArquivo) {
    planilhaTravada = true;
    planilhaNomeArquivo = nomeArquivo || planilhaNomeArquivo;
    uploadPlanilhaPendente = false;

    const input = document.getElementById('planilhaArquivoLocal');
    if (input) {
        input.value = '';
        input.disabled = true;
    }

    desabilitarBotoesPlanilha(true);
    document.getElementById('planilhaSetupAcoes')?.classList.add('hidden');
    document.getElementById('planilhaSetupTravada')?.classList.remove('hidden');

    const badge = document.getElementById('planilhaBadgeStatus');
    if (badge) {
        badge.textContent = planilhaNomeArquivo ? `Excel: ${planilhaNomeArquivo}` : 'Excel Online';
        badge.title = 'Planilha travada — não é possível trocar durante a prova';
    }
}

function mostrarAcoesPlanilha() {
    if (planilhaTravada) return;
    const acoes = document.getElementById('planilhaSetupAcoes');
    if (acoes) acoes.classList.remove('hidden');
}

function ocultarSetupPlanilha() {
    document.getElementById('painelPlanilhaSetup')?.classList.add('hidden');
    const badge = document.getElementById('planilhaBadgeStatus');
    if (badge) {
        badge.textContent = 'Excel Online';
        badge.classList.remove('hidden');
    }
}

function salvarSessaoPlanilha() {
    if (!planilhaUrlAtual || !planilhaTravada) return;
    try {
        sessionStorage.setItem(SESSAO_PLANILHA_KEY, JSON.stringify({
            url: planilhaUrlAtual,
            nomeArquivo: planilhaNomeArquivo,
            itemId: planilhaItemIdAtual || null
        }));
    } catch (_) {
        // sessionStorage indisponível
    }
}

function limparSessaoPlanilha() {
    try {
        sessionStorage.removeItem(SESSAO_PLANILHA_KEY);
    } catch (_) {
        // ignora
    }
}

function mostrarPainelPlanilhaAtiva(url) {
    const painel = document.getElementById('planilhaPainelAtivo');
    if (!painel) return;

    if (url) planilhaUrlAtual = url;
    painel.classList.remove('hidden');
    painel.innerHTML = `
        <div class="planilha-ativa-card">
            <h4>Excel Online — popup aberta</h4>
            <p class="text-muted mb-2">${planilhaNomeArquivo ? `<strong>${planilhaNomeArquivo}</strong><br>` : ''}O Excel está em uma <strong>janela separada</strong> (popup). Clique abaixo para trazê-la para frente da prova.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                <button type="button" class="btn btn-primary btn-sm" onclick="trazerPlanilhaParaFrente()">↑ Trazer popup do Excel para frente</button>
            </div>
        </div>
    `;
    salvarSessaoPlanilha();
}

function featuresJanelaPlanilha() {
    const largura = Math.min(1100, Math.floor(window.screen.width * 0.55));
    const altura = Math.floor(window.screen.height * 0.85);
    const esquerda = window.screenX + Math.max(0, window.outerWidth - largura - 24);
    const topo = window.screenY + 40;
    // Não removemos toolbar/location/menubar aqui: o Excel Online (Microsoft)
    // trata janelas "sem cara de navegador" como suspeitas (proteção
    // anti-phishing) e não carrega direito. Sem essas flags a planilha volta
    // a abrir normalmente.
    return `width=${largura},height=${altura},left=${esquerda},top=${topo},resizable=yes,scrollbars=yes`;
}

function escreverTelaAguardandoPlanilha(popup) {
    if (!popup) return;
    try {
        popup.document.open();
        popup.document.write(`
            <!doctype html>
            <html lang="pt-BR">
            <head><meta charset="utf-8"><title>Abrindo Excel Online</title></head>
            <body style="font-family:Arial,sans-serif;padding:24px;background:#111827;color:#e5e7eb">
                <h2>Abrindo Excel Online...</h2>
                <p>Finalize o login Microsoft, se aparecer. Em seguida a planilha será aberta automaticamente nesta janela.</p>
            </body>
            </html>
        `);
        popup.document.close();
    } catch (_) {
        // Alguns navegadores bloqueiam escrita se a janela já navegou para domínio Microsoft.
    }
}

function prepararJanelaPlanilha() {
    const features = featuresJanelaPlanilha();
    if (planilhaPopup && !planilhaPopup.closed) {
        planilhaPopup.focus();
        return planilhaPopup;
    }

    planilhaPopup = window.open('about:blank', 'planilhaProvaAluno', features);
    window.planilhaPopup = planilhaPopup;
    if (typeof window._registrarAberturaPopupProva === 'function') window._registrarAberturaPopupProva();
    escreverTelaAguardandoPlanilha(planilhaPopup);
    return planilhaPopup;
}

function bytesPlanilhaEmBranco() {
    const bin = atob(XLSX_BLANK_BASE64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function urlPareceHubMicrosoft(url) {
    if (!url) return true;
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const path = parsed.pathname.toLowerCase();

        if (host.includes('login.microsoftonline.com') || host.includes('account.microsoft.com')) return true;
        if (host.includes('portal.office.com')) return true;

        if (host === 'office.com' || host === 'www.office.com') {
            return !(path.includes('/excel') || path.includes('/open'));
        }

        if (host.includes('microsoft365.com') && !path.includes('excel')) return true;
        if (path.includes('/launch') || path.includes('/homepage') || path.includes('/hub')) return true;
        if (host.includes('onedrive.live.com') && path.includes('/redir')) return true;

        return false;
    } catch (_) {
        return true;
    }
}

function montarUrlExcelOffice(driveId, itemId) {
    if (!driveId || !itemId) return null;
    const params = new URLSearchParams({
        id: itemId,
        driveId
    });
    return `https://excel.office.com/open/onedrive/?${params.toString()}`;
}

function urlParaExcelOnline(url) {
    if (!url) return url;

    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();

        if (host.includes('onedrive.live.com')) {
            if (/\/view\.aspx$/i.test(parsed.pathname)) {
                parsed.pathname = parsed.pathname.replace(/\/view\.aspx$/i, '/edit.aspx');
            } else if (!/\/edit\.aspx$/i.test(parsed.pathname) && parsed.pathname.includes('.aspx')) {
                parsed.pathname = parsed.pathname.replace(/\.aspx$/i, '/edit.aspx');
            }
        }

        if (
            host.includes('onedrive.live.com')
            || host.includes('sharepoint.com')
            || host.includes('officeapps.live.com')
        ) {
            parsed.searchParams.set('web', '1');
            parsed.searchParams.set('action', 'edit');
        }

        return parsed.toString();
    } catch (_) {
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}web=1&action=edit`;
    }
}

async function tentarCreateLinkEdit(token, itemId) {
    const escopos = ['organization', 'anonymous'];
    for (const scope of escopos) {
        const res = await fetchComRetry(
            `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ type: 'edit', scope })
            },
            2
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.id) permissoesCompartilhamentoReportadas.add(data.id);
        if (data?.link?.webUrl) return urlParaExcelOnline(data.link.webUrl);
    }
    return null;
}

function obterEmailProfessorPlanilha() {
    const email = (
        ferramentasConfig?.microsoftProfessorEmail
        || ferramentasConfig?.professorEmail
        || ''
    ).trim().toLowerCase();
    return email.includes('@') ? email : '';
}

function urlPlanilhaParaProfessor(url) {
    if (!url) return url;
    try {
        const parsed = new URL(url);
        parsed.searchParams.set('web', '1');
        return parsed.toString();
    } catch (_) {
        return url;
    }
}

async function convidarProfessorPlanilha(token, itemId) {
    const email = obterEmailProfessorPlanilha();
    if (!email) return null;

    const res = await fetchComRetry(
        `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/invite`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                recipients: [{ email }],
                message: 'Acesso de leitura — planilha da prova de Estatística (monitoramento do professor).',
                requireSignIn: true,
                sendInvitation: false,
                roles: ['read']
            })
        },
        2
    );
    if (!res.ok) {
        console.warn('Convite do professor à planilha falhou:', res.status, await res.text().catch(() => ''));
        return null;
    }

    const data = await res.json();
    const entrada = (data?.value || []).find((p) => p?.link?.webUrl) || data?.value?.[0];
    if (entrada?.id) permissoesCompartilhamentoReportadas.add(entrada.id);
    if (entrada?.link?.webUrl) return urlPlanilhaParaProfessor(entrada.link.webUrl);
    return null;
}

async function criarLinkPlanilhaParaAdmin(token, itemId) {
    const convite = await convidarProfessorPlanilha(token, itemId);
    if (convite) return convite;

    const configs = [
        { type: 'view', scope: 'anonymous' },
        { type: 'view', scope: 'organization' },
        { type: 'edit', scope: 'anonymous' }
    ];

    for (const cfg of configs) {
        const res = await fetchComRetry(
            `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/createLink`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(cfg)
            },
            2
        );
        if (!res.ok) continue;
        const data = await res.json();
        if (data?.id) permissoesCompartilhamentoReportadas.add(data.id);
        if (data?.link?.webUrl) return urlPlanilhaParaProfessor(data.link.webUrl);
    }
    return null;
}

async function resolverUrlExcelMicrosoft(token, itemId, webUrlFallback) {
    const headers = { Authorization: `Bearer ${token}` };
    let itemRes = await fetchComRetry(
        `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}?$select=id,name,webUrl,parentReference`,
        { headers },
        4
    );

    if (!itemRes.ok) {
        if (webUrlFallback) {
            const urlFallback = urlParaExcelOnline(webUrlFallback);
            if (urlFallback && !urlPareceHubMicrosoft(urlFallback)) return urlFallback;
        }
        if (itemRes.status === 429 || itemRes.status >= 500) {
            await sleep(2000);
            itemRes = await fetchComRetry(
                `https://graph.microsoft.com/v1.0/me/drive/items/${itemId}?$select=id,name,webUrl,parentReference`,
                { headers },
                2
            );
        }
    }

    if (!itemRes.ok) {
        if (webUrlFallback) {
            const urlFallback = urlParaExcelOnline(webUrlFallback);
            if (urlFallback && !urlPareceHubMicrosoft(urlFallback)) return urlFallback;
        }
        throw new Error(`Erro ao obter link da planilha (${itemRes.status}). Aguarde e tente novamente.`);
    }

    const item = await itemRes.json();
    const driveId = item.parentReference?.driveId;
    const candidatos = [];

    // excel.office.com é o formato mais confiável para janela externa.
    const excelOffice = montarUrlExcelOffice(driveId, item.id);
    if (excelOffice) candidatos.push(excelOffice);

    if (item.webUrl) candidatos.push(urlParaExcelOnline(item.webUrl));
    if (webUrlFallback) candidatos.push(urlParaExcelOnline(webUrlFallback));

    for (const url of candidatos) {
        if (url && !urlPareceHubMicrosoft(url)) return url;
    }

    const linkEdit = await tentarCreateLinkEdit(token, itemId);
    if (linkEdit && !urlPareceHubMicrosoft(linkEdit)) return linkEdit;

    throw new Error('Não foi possível abrir o Excel Online. Tente novamente.');
}

function urlPareceExcelOnline(href) {
    if (!href || href === 'about:blank') return false;
    try {
        const host = new URL(href).hostname.toLowerCase();
        return host.includes('excel.office.com')
            || host.includes('excel.cloud.microsoft')
            || host.includes('officeapps.live.com')
            || (host.includes('onedrive.live.com') && /edit\.aspx/i.test(href));
    } catch (_) {
        return /excel\.(office|cloud)\.microsoft|officeapps\.live\.com/i.test(href);
    }
}

/** Popup já carregou o Excel (não login Microsoft nem tela "Aguardando"). */
function popupJaTemExcelExterno(janela) {
    if (!janela || janela.closed || !planilhaExcelNavegou) return false;
    try {
        const href = janela.location.href;
        if (!href || href === 'about:blank') return false;
        if (janela.location.origin === window.location.origin) return false;
        return urlPareceExcelOnline(href);
    } catch (_) {
        return planilhaExcelNavegou;
    }
}

function abrirPlanilhaExterna(url) {
    if (!url) return null;
    const urlExcel = urlParaExcelOnline(url);

    if (urlPareceHubMicrosoft(urlExcel)) {
        setStatusPlanilha('O navegador tentou abrir o hub da Microsoft em vez do Excel. Clique em Reabrir planilha.', 'error');
        return null;
    }

    // Excel já aberto — só foca (sem recarregar; Chrome quebra location.href cross-origin)
    if (planilhaPopup && !planilhaPopup.closed && popupJaTemExcelExterno(planilhaPopup)) {
        focarJanelaPlanilha(planilhaPopup);
        marcarFocoPlanilha(true);
        window.planilhaPopup = planilhaPopup;
        return planilhaPopup;
    }

    const features = featuresJanelaPlanilha();
    // window.open com nome fixo reutiliza a popup preparada no clique (Chrome exige gesto)
    planilhaPopup = window.open(urlExcel, 'planilhaProvaAluno', features);
    window.planilhaPopup = planilhaPopup;

    if (planilhaPopup) {
        planilhaExcelNavegou = true;
        if (typeof window._registrarAberturaPopupProva === 'function') window._registrarAberturaPopupProva();
        focarJanelaPlanilha(planilhaPopup);
        marcarFocoPlanilha(true);
        setStatusPlanilha('Planilha aberta ao lado. Use Alt+Tab ou o botão verde.', 'success');
    } else {
        setStatusPlanilha(
            'Não foi possível abrir a planilha. No Chrome: clique no ícone à direita da barra de endereço e permita pop-ups para este site.',
            'error'
        );
    }
    return planilhaPopup;
}

function focarJanelaPlanilha(janela) {
    if (!janela) return;
    try { janela.focus(); } catch (_) { /* ignora */ }
}

function trazerPlanilhaParaFrente(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (typeof window._registrarAberturaPopupProva === 'function') window._registrarAberturaPopupProva();

    // Popup já aberta — só foca, sem recarregar.
    if (planilhaPopup && !planilhaPopup.closed) {
        focarJanelaPlanilha(planilhaPopup);
        return;
    }

    // Reanexa pela janela nomeada sem navegar (instantâneo se ainda existir).
    let alvo = null;
    try { alvo = window.open('', 'planilhaProvaAluno'); } catch (_) { /* bloqueado */ }
    if (alvo) {
        let jaTemExcel = false;
        try { jaTemExcel = alvo.location.href !== 'about:blank'; } catch (_) { jaTemExcel = true; }
        if (jaTemExcel) {
            planilhaPopup = alvo;
            window.planilhaPopup = alvo;
            planilhaExcelNavegou = true;
            focarJanelaPlanilha(alvo);
            return;
        }
        alvo.close();
    }

    setStatusPlanilha('A planilha foi fechada. Reabra pelo OneDrive.', 'error');
}

async function reabrirPlanilhaExterna() {
    if (!planilhaUrlAtual && !planilhaItemIdAtual) {
        setStatusPlanilha('Nenhuma planilha definida.', 'error');
        return;
    }

    prepararJanelaPlanilha();
    setStatusPlanilha('Reabrindo Excel Online...', 'info');

    if (planilhaItemIdAtual) {
        try {
            const token = await obterTokenMicrosoft();
            const url = await resolverUrlExcelMicrosoft(token, planilhaItemIdAtual, planilhaUrlAtual);
            planilhaUrlAtual = url;
            salvarSessaoPlanilha();
        } catch (error) {
            console.warn('Reabrir com URL salva:', error);
        }
    }

    abrirPlanilhaExterna(planilhaUrlAtual);
}

async function restaurarPlanilhaDaSessao() {
    let data = null;
    try {
        const raw = sessionStorage.getItem(SESSAO_PLANILHA_KEY);
        if (raw) data = JSON.parse(raw);
    } catch (_) {
        return;
    }
    if (!data?.url && !data?.itemId) return;

    planilhaConectada = true;
    planilhaProvedor = 'microsoft';
    planilhaNomeArquivo = data.nomeArquivo || null;
    planilhaItemIdAtual = data.itemId || null;
    travarPlanilha(planilhaNomeArquivo);
    ocultarSetupPlanilha();

    let url = data.url;
    if (data.itemId) {
        try {
            const token = await obterTokenMicrosoft();
            url = await resolverUrlExcelMicrosoft(token, data.itemId, data.url);
            planilhaUrlAtual = url;
            salvarSessaoPlanilha();
        } catch (error) {
            console.warn('Restaurar planilha com URL salva:', error);
            planilhaUrlAtual = data.url;
        }
    } else {
        planilhaUrlAtual = data.url;
    }

    // Restaura painel verde; popup só reabre se o aluno clicar no botão.
    planilhaUrlAtual = url;
    mostrarPainelPlanilhaAtiva(url);
    if (data.itemId) iniciarMonitoramentoCompartilhamentoMicrosoft(data.itemId);
}

function pararMonitoramentoCompartilhamento() {
    if (planilhaMonitorTimer) {
        clearInterval(planilhaMonitorTimer);
        planilhaMonitorTimer = null;
    }
    planilhaItemIdMonitor = null;
    permissoesCompartilhamentoReportadas.clear();
}

// Não conseguimos "ver" o que acontece dentro da janela do Excel Online
// (é um domínio da Microsoft; o navegador bloqueia qualquer acesso via
// script por segurança — a mesma proteção que impede qualquer site de
// espionar o conteúdo de outro). O que DÁ para verificar, usando o token
// que o próprio aluno concedeu, é se o arquivo passou a ter permissões de
// compartilhamento (link público, convite a outra pessoa, etc.) via
// Microsoft Graph — nesse caso alertamos o professor por e-mail.
async function verificarCompartilhamentoMicrosoft(itemId) {
    if (!itemId) return;
    try {
        // Usa somente acquireTokenSilent — NUNCA dispara redirect de página
        // (que destruiria a prova). Se não conseguir token silenciosamente, desiste.
        await garantirMsalCarregado();
        const account = obterContaMicrosoftAtiva();
        if (!account) return;
        let token;
        try {
            const redirectUri = obterRedirectUriMicrosoft();
            const silent = await msalInstance.acquireTokenSilent({
                scopes: ['Files.ReadWrite', 'User.Read', 'openid', 'profile', 'offline_access'],
                redirectUri,
                account
            });
            token = silent.accessToken;
        } catch (_) {
            // Token silencioso falhou — não faz redirect, só descarta esta verificação
            return;
        }

        const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/permissions`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;

        const data = await res.json();
        for (const p of data.value || []) {
            if (permissoesCompartilhamentoReportadas.has(p.id)) continue;

            const link = p.link;
            const ehLink = !!link && (link.scope === 'anonymous' || link.scope === 'organization');
            const ehConvite = !!p.invitation;
            if (!ehLink && !ehConvite) continue;

            permissoesCompartilhamentoReportadas.add(p.id);

            let detalhes = 'Permissão adicional detectada na planilha';
            if (link?.scope === 'anonymous') detalhes = 'Link público ("qualquer pessoa com o link") criado na planilha';
            else if (link?.scope === 'organization') detalhes = 'Link compartilhado com toda a organização';
            else if (ehConvite) detalhes = `Convidou ${p.invitation?.email || 'outro usuário'} para a planilha`;

            if (typeof window.reportarCompartilhamentoPlanilha === 'function') {
                await window.reportarCompartilhamentoPlanilha({ tipo: 'onedrive', detalhes, planilha_id: itemId });
            }
        }
    } catch (err) {
        console.warn('Monitor de compartilhamento (Microsoft):', err);
    }
}

function iniciarMonitoramentoCompartilhamentoMicrosoft(itemId) {
    if (!itemId) return;
    pararMonitoramentoCompartilhamento();
    planilhaItemIdMonitor = itemId;
    // Primeira verificação com delay para não interferir com a abertura da planilha
    setTimeout(() => {
        if (planilhaItemIdMonitor === itemId) verificarCompartilhamentoMicrosoft(itemId);
    }, 30000);
    planilhaMonitorTimer = setInterval(() => {
        if (planilhaItemIdMonitor === itemId) verificarCompartilhamentoMicrosoft(itemId);
    }, 45000);
}

function embutirPlanilha(url, nomeArquivo, itemId) {
    garantirPlanilhaNaoTravada();
    const urlExcel = urlParaExcelOnline(url);

    prepararJanelaPlanilha();
    const popup = abrirPlanilhaExterna(urlExcel);
    if (!popup) {
        throw new Error('Não foi possível abrir a janela do Excel. Permita pop-ups para este site.');
    }

    planilhaConectada = true;
    planilhaProvedor = 'microsoft';
    planilhaNomeArquivo = nomeArquivo || null;
    planilhaItemIdAtual = itemId || null;
    planilhaUrlAtual = urlExcel;
    travarPlanilha(nomeArquivo);
    ocultarSetupPlanilha();

    // Excel Online não funciona em iframe (Microsoft bloqueia) — janela externa.
    const frame = document.getElementById('planilhaFrame');
    if (frame) {
        frame.src = 'about:blank';
        frame.classList.add('hidden');
    }

    mostrarPainelPlanilhaAtiva(urlExcel);
    marcarFocoPlanilha(true);
    registrarPlanilhaNaTentativa(urlExcel, nomeArquivo, itemId);
    if (itemId) iniciarMonitoramentoCompartilhamentoMicrosoft(itemId);
    setStatusPlanilha('Planilha aberta em janela separada. Use Alt+Tab ou o botão verde.', 'success');
}

function urlPareceLinkPessoalAluno(url) {
    if (!url) return false;
    return /excel\.office\.com\/open\/onedrive/i.test(url);
}

async function garantirLinkPlanilhaAdmin(itemId, forcar = false) {
    if (!itemId) return planilhaUrlAdmin;
    const deveAtualizar = forcar
        || !planilhaUrlAdmin
        || (obterEmailProfessorPlanilha() && urlPareceLinkPessoalAluno(planilhaUrlAdmin));
    if (!deveAtualizar) return planilhaUrlAdmin;
    try {
        const token = await obterTokenMicrosoft();
        const link = await criarLinkPlanilhaParaAdmin(token, itemId);
        if (link) planilhaUrlAdmin = link;
    } catch (error) {
        console.warn('Não foi possível gerar link da planilha para o professor:', error);
    }
    return planilhaUrlAdmin;
}

function registrarPlanilhaNaTentativa(url, nome, itemId) {
    const tentativaId = window.tentativaAtual?.id;
    if (!tentativaId || !url) return;

    (async () => {
        const urlAdmin = itemId ? await garantirLinkPlanilhaAdmin(itemId) : null;
        const urlSalvar = urlAdmin || url;
        fetch(`${API_URL}/tentativas/${tentativaId}/planilha`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: urlSalvar,
                nome: nome || planilhaNomeArquivo || null,
                item_id: itemId || planilhaItemIdAtual || null
            }),
            keepalive: true
        }).catch(() => {});
    })();
}

async function obterDadosPlanilhaParaServidor() {
    if (planilhaItemIdAtual) {
        await garantirLinkPlanilhaAdmin(planilhaItemIdAtual, true);
    }

    return {
        planilha_usada: !!(planilhaTravada && (planilhaUrlAtual || planilhaItemIdAtual)),
        planilha_url: planilhaUrlAdmin || planilhaUrlAtual || null,
        planilha_nome: planilhaNomeArquivo || null,
        planilha_item_id: planilhaItemIdAtual || null
    };
}

// ============================================
// MICROSOFT / EXCEL ONLINE
// ============================================

function obterRedirectUriMicrosoft() {
    const configurado = ferramentasConfig?.microsoftRedirectUri?.replace(/\/$/, '');
    if (configurado) return configurado;
    const fallback = `${window.location.origin.replace(/\/$/, '')}/auth/microsoft.html`;
    return fallback;
}

function mensagemErroMicrosoft(error) {
    const msg = error?.errorMessage || error?.message || String(error || '');
    const code = error?.errorCode || '';
    const redirectUri = obterRedirectUriMicrosoft();
    if (code === 'interaction_in_progress' || /interaction is currently in progress/i.test(msg)) {
        return 'Login Microsoft em andamento. Aguarde o pop-up fechar. Não clique várias vezes — espere e tente de novo em alguns segundos.';
    }
    if (/popup_window_error|empty_window_error|user_cancelled/i.test(msg)) {
        return 'Login Microsoft bloqueado pelo navegador. Permita pop-ups para este site e clique novamente em Nova planilha em branco.';
    }
    if (/AADSTS500113|AADSTS50011|redirect_uri|reply address/i.test(msg)) {
        return 'Redirect URI não cadastrado no Azure (plataforma SPA). '
            + 'Entre em portal.azure.com → Registros de aplicativo → app com Client ID '
            + (ferramentasConfig?.microsoftClientId || '?')
            + ' → Autenticação → Aplicativo de página única (SPA) → adicione exatamente: '
            + redirectUri;
    }
    if (/AADSTS50020|AADSTS50105|tenant/i.test(msg)) {
        return 'Esta conta Microsoft não pertence ao tenant do app. Use @outlook.com, @hotmail.com ou a conta indicada pelo professor.';
    }
    if (/unauthorized|not authorized|access denied|não autorizado|sem autorização|permission/i.test(msg)) {
        return 'Conta Microsoft sem permissão para abrir o Excel no OneDrive. Saia da conta errada, entre de novo e aceite as permissões de Arquivos (Files.ReadWrite).';
    }
    if (msg) return msg;
    return 'Não foi possível conectar à Microsoft. Tente novamente.';
}

function isMsalInteractionInProgress(error) {
    const msg = error?.errorMessage || error?.message || '';
    const code = error?.errorCode || '';
    return code === 'interaction_in_progress' || /interaction is currently in progress/i.test(msg);
}

// Login antigo travava tentando usar pop-up + postMessage, o que falha por
// bloqueio de pop-up e por Cross-Origin-Opener-Policy da Microsoft (a janela
// fica presa em "Abrindo Excel Online..." para sempre). Agora usamos
// redirecionamento de página inteira: a própria aba da prova navega até a
// Microsoft e volta — muito mais confiável entre navegadores.
function limparLockInteracaoMsalStale() {
    try {
        Object.keys(localStorage).forEach((chave) => {
            if (/interaction\.status|interaction_in_progress/i.test(chave)) {
                localStorage.removeItem(chave);
            }
        });
    } catch (_) {
        // ignora
    }
}

async function iniciarLoginRedirectPaginaCompleta(request) {
    try {
        sessionStorage.setItem(PLANILHA_ACAO_PENDENTE_KEY, planilhaAcaoPendenteAtual || '');
        sessionStorage.setItem(PLANILHA_RETORNO_URL_KEY, window.location.href);
    } catch (_) {
        // ignora
    }

    // Fecha popup órfã antes do redirect (a página da prova vai navegar)
    if (planilhaPopup && !planilhaPopup.closed) {
        try { planilhaPopup.close(); } catch (_) { /* ignora */ }
    }
    planilhaPopup = null;
    window.planilhaPopup = null;
    planilhaExcelNavegou = false;

    setStatusPlanilha('Redirecionando para o login da Microsoft. Você voltará para a prova automaticamente...', 'info');
    await sleep(250);

    try {
        await msalInstance.loginRedirect(request);
    } catch (error) {
        if (isMsalInteractionInProgress(error)) {
            limparLockInteracaoMsalStale();
            await sleep(300);
            await msalInstance.loginRedirect(request);
            return;
        }
        throw error;
    }
}

async function garantirMsalCarregado() {
    await carregarMsalBrowser();
    limparLockInteracaoMsalStale();

    if (!msalInstance) {
        const redirectUri = obterRedirectUriMicrosoft();
        msalInstance = new msal.PublicClientApplication({
            auth: {
                clientId: ferramentasConfig.microsoftClientId,
                authority: `https://login.microsoftonline.com/${ferramentasConfig.microsoftTenantId || 'common'}`,
                redirectUri,
                postLogoutRedirectUri: redirectUri
            },
            cache: {
                cacheLocation: 'localStorage'
            },
            system: {
                allowNativeBroker: false
            }
        });
        await msalInstance.initialize();
    }

    if (!msalRedirectTratado) {
        await msalInstance.handleRedirectPromise();
        msalRedirectTratado = true;
    }
}

function obterContaMicrosoftAtiva() {
    let account = msalInstance.getActiveAccount();
    const accounts = msalInstance.getAllAccounts();
    if (!account && accounts.length > 0) {
        account = accounts[0];
        msalInstance.setActiveAccount(account);
    }
    return account;
}

async function obterTokenMicrosoftInterno() {
    await garantirMsalCarregado();
    marcarAuthInteracao(true);

    try {
        const redirectUri = obterRedirectUriMicrosoft();
        const request = {
            scopes: ['Files.ReadWrite', 'User.Read', 'openid', 'profile', 'offline_access'],
            redirectUri
        };

        const account = obterContaMicrosoftAtiva();
        if (account) {
            try {
                const silent = await msalInstance.acquireTokenSilent({ ...request, account });
                return silent.accessToken;
            } catch (error) {
                if (isMsalInteractionInProgress(error)) {
                    limparLockInteracaoMsalStale();
                    await sleep(600);
                    try {
                        const silent2 = await msalInstance.acquireTokenSilent({ ...request, account });
                        return silent2.accessToken;
                    } catch (retryErr) {
                        if (!isMsalInteractionInProgress(retryErr)) throw retryErr;
                    }
                }
                const precisaInteracao = error instanceof msal.InteractionRequiredAuthError
                    || ['interaction_required', 'consent_required', 'login_required'].includes(error?.errorCode);
                if (!precisaInteracao && !isMsalInteractionInProgress(error)) throw error;
                try {
                    const popup = await msalInstance.acquireTokenPopup({ ...request, account });
                    return popup.accessToken;
                } catch (popupErr) {
                    if (isMsalInteractionInProgress(popupErr)) {
                        limparLockInteracaoMsalStale();
                        await sleep(800);
                    }
                }
            }
        }

        try {
            const popup = await msalInstance.loginPopup(request);
            return popup.accessToken;
        } catch (loginPopupErr) {
            if (isMsalInteractionInProgress(loginPopupErr)) {
                limparLockInteracaoMsalStale();
                await sleep(800);
            }
        }
        await iniciarLoginRedirectPaginaCompleta(request);
        await sleep(8000);
        throw new Error('A navegação para o login da Microsoft não ocorreu. Tente novamente.');
    } finally {
        marcarAuthInteracao(false);
    }
}

async function obterTokenMicrosoft() {
    if (msalTokenPromise) {
        return msalTokenPromise;
    }

    planilhaProvedor = 'microsoft';
    desabilitarBotoesPlanilha(true);
    setStatusPlanilha('Conectando conta Microsoft...', 'info');

    msalTokenPromise = obterTokenMicrosoftInterno()
        .finally(() => {
            msalTokenPromise = null;
            if (!planilhaTravada) {
                desabilitarBotoesPlanilha(false);
            }
        });

    return msalTokenPromise;
}

async function conectarMicrosoftPlanilha() {
    try {
        garantirPlanilhaNaoTravada();
        await obterTokenMicrosoft();
        setStatusPlanilha('Conta conectada. Escolha UMA planilha — depois não poderá trocar.', 'success');
    } catch (error) {
        console.error('Erro Microsoft:', error);
        setStatusPlanilha(mensagemErroMicrosoft(error), 'error');
    }
}

async function criarNovaPlanilhaMicrosoft() {
    const token = await obterTokenMicrosoft();
    const nomeAluno = document.getElementById('nomeAluno')?.value?.trim() || 'Aluno';
    const nomeArquivo = `Prova Estatística - ${nomeAluno}.xlsx`;
    const caminho = encodeURIComponent(nomeSeguroPlanilha(nomeArquivo));

    const response = await fetchComRetry(
        `https://graph.microsoft.com/v1.0/me/drive/root:/${PLANILHA_PASTA_ONEDRIVE}/${caminho}:/content`,
        {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            },
            body: bytesPlanilhaEmBranco()
        }
    );

    if (!response.ok) {
        throw new Error('Erro ao criar arquivo Excel no OneDrive. Tente novamente em alguns segundos.');
    }

    const item = await response.json();
    await embutirPlanilhaMicrosoft(token, item.id, item.name || nomeArquivo, item.webUrl);
}

async function embutirPlanilhaMicrosoft(token, itemId, nomeArquivo, webUrlFallback, autoAbrir = false) {
    const urlExcel = await resolverUrlExcelMicrosoft(token, itemId, webUrlFallback);
    if (autoAbrir) {
        try {
            embutirPlanilha(urlExcel, nomeArquivo, itemId);
            return;
        } catch (error) {
            console.warn('Abertura automática da planilha falhou:', error);
        }
    }
    apresentarBotaoAbrirPlanilhaPendente(urlExcel, nomeArquivo, itemId);
}

async function listarPlanilhasOneDrive(token) {
    const headers = { Authorization: `Bearer ${token}` };
    const porId = new Map();
    let ultimoErro = null;

    const isArquivoExcel = (item) => {
        const nome = item?.name?.toLowerCase() || '';
        return nome.endsWith('.xlsx') || nome.endsWith('.xls') || nome.endsWith('.xlsm') || nome.endsWith('.csv');
    };

    const registrar = (items) => {
        for (const item of items || []) {
            if (item?.id && isArquivoExcel(item)) porId.set(item.id, item);
        }
    };

    const tentar = async (label, url) => {
        try {
            const response = await fetchComRetry(url, { headers }, 2);
            if (!response.ok) {
                let detalhe = '';
                try {
                    const body = await response.json();
                    detalhe = body?.error?.message || body?.error?.code || '';
                } catch (_) { /* ignora */ }
                ultimoErro = { status: response.status, detalhe, label };
                return false;
            }
            const data = await response.json();
            registrar(data.value || []);
            return true;
        } catch (error) {
            ultimoErro = { status: 0, detalhe: error.message, label };
            return false;
        }
    };

    await tentar(
        'pasta-prova',
        `https://graph.microsoft.com/v1.0/me/drive/root:/${PLANILHA_PASTA_ONEDRIVE}:/children?$select=id,name,webUrl&$top=50`
    );
    await tentar(
        'root',
        'https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,webUrl&$top=200'
    );
    if (porId.size === 0) {
        await tentar(
            'recent',
            'https://graph.microsoft.com/v1.0/me/drive/recent?$select=id,name,webUrl&$top=50'
        );
    }
    if (porId.size === 0) {
        for (const termo of ['xlsx', 'planilha', 'excel']) {
            const ok = await tentar(
                `search:${termo}`,
                `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${termo}')?$select=id,name,webUrl&$top=20`
            );
            if (ok && porId.size > 0) break;
        }
    }

    if (porId.size === 0 && ultimoErro?.status) {
        const msg = ultimoErro.status === 401
            ? 'Sessão Microsoft expirada. Clique em Conectar Microsoft novamente.'
            : ultimoErro.status === 403
                ? 'Sem permissão para listar arquivos no OneDrive. Use "Nova planilha em branco".'
                : ultimoErro.status === 429
                    ? 'OneDrive ocupado (muitas tentativas). Aguarde alguns segundos e tente de novo.'
                    : `Erro ao buscar arquivos Excel (${ultimoErro.status}). Use "Nova planilha em branco".`;
        throw new Error(msg);
    }

    return Array.from(porId.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

async function abrirSeletorMicrosoftPlanilha() {
    garantirPlanilhaNaoTravada();
    desabilitarBotoesPlanilha(true);
    setStatusPlanilha('Buscando planilhas no OneDrive...', 'info');

    try {
        const token = await obterTokenMicrosoft();
        const arquivos = await listarPlanilhasOneDrive(token);

        if (arquivos.length === 0) {
            setStatusPlanilha('Nenhum arquivo .xlsx encontrado no OneDrive.', 'error');
            return;
        }

        const vistos = new Set();
        const unicos = arquivos.filter((f) => {
            if (vistos.has(f.id)) return false;
            vistos.add(f.id);
            return true;
        });

        const painel = document.getElementById('painelPlanilhaSetup');
        painel.querySelector('.planilha-lista-arquivos')?.remove();

        const lista = document.createElement('div');
        lista.className = 'planilha-lista-arquivos';
        lista.innerHTML = '<p class="text-muted mb-2">Selecione um arquivo do OneDrive (escolha definitiva):</p>';

        unicos.forEach((arquivo) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-secondary btn-sm planilha-arquivo-item';
            btn.textContent = arquivo.name;
            btn.onclick = async () => {
                if (planilhaTravada) return;
                desabilitarBotoesPlanilha(true);
                try {
                    garantirPlanilhaNaoTravada();
                    prepararJanelaPlanilha();
                    setStatusPlanilha('Abrindo planilha...', 'info');
                    await embutirPlanilhaMicrosoft(token, arquivo.id, arquivo.name, arquivo.webUrl, true);
                } catch (error) {
                    setStatusPlanilha(mensagemErroMicrosoft(error) || error.message, 'error');
                    if (!planilhaTravada) desabilitarBotoesPlanilha(false);
                }
            };
            lista.appendChild(btn);
        });

        painel.querySelector('.planilha-setup')?.appendChild(lista);
        setStatusPlanilha('Selecione uma planilha na lista.', 'success');
    } finally {
        if (!planilhaTravada) desabilitarBotoesPlanilha(false);
    }
}

// ============================================
// AÇÕES COMUNS
// ============================================

async function criarNovaPlanilha() {
    try {
        garantirPlanilhaNaoTravada();
        planilhaAcaoPendenteAtual = 'nova';
        setStatusPlanilha('Criando planilha...', 'info');
        await criarNovaPlanilhaMicrosoft();
    } catch (error) {
        console.error('Erro ao criar planilha:', error);
        setStatusPlanilha(mensagemErroMicrosoft(error) || error.message || 'Erro ao criar planilha.', 'error');
    }
}

async function abrirPlanilhaExistenteMicrosoft() {
    try {
        garantirPlanilhaNaoTravada();
        planilhaAcaoPendenteAtual = 'onedrive';
        await abrirSeletorMicrosoftPlanilha();
    } catch (error) {
        setStatusPlanilha(mensagemErroMicrosoft(error) || error.message || 'Erro ao abrir planilha.', 'error');
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

async function enviarPlanilhaDoComputadorMicrosoft() {
    try {
        garantirPlanilhaNaoTravada();
        planilhaAcaoPendenteAtual = 'upload';
        uploadPlanilhaPendente = true;
        await obterTokenMicrosoft();
        setStatusPlanilha('Escolha o arquivo (.xlsx, .xls ou .csv)...', 'info');
        const input = garantirInputArquivoPlanilha();
        if (input.disabled) {
            uploadPlanilhaPendente = false;
            return;
        }
        input.value = '';
        input.click();
    } catch (error) {
        console.error('Erro ao iniciar envio:', error);
        setStatusPlanilha(mensagemErroMicrosoft(error) || error.message || 'Não foi possível conectar à Microsoft.', 'error');
        uploadPlanilhaPendente = false;
    }
}

async function onArquivoPlanilhaLocalSelecionado(ev) {
    const file = ev.target.files?.[0];
    if (!file || !uploadPlanilhaPendente || planilhaTravada) return;
    uploadPlanilhaPendente = false;

    try {
        garantirPlanilhaNaoTravada();
        if (file.size > PLANILHA_UPLOAD_MAX_BYTES) {
            throw new Error('Arquivo muito grande. Tamanho máximo: 15 MB.');
        }
        // Reserva popup no gesto de escolher o arquivo (Chrome exige isso)
        prepararJanelaPlanilha();
        await uploadPlanilhaParaMicrosoft(file);
    } catch (error) {
        console.error('Erro ao enviar planilha:', error);
        setStatusPlanilha(error.message || 'Erro ao enviar planilha do computador.', 'error');
    } finally {
        ev.target.value = '';
    }
}

async function uploadPlanilhaParaMicrosoft(file) {
    garantirPlanilhaNaoTravada();
    const token = await obterTokenMicrosoft();
    const nomeArquivo = nomeSeguroPlanilha(file.name);
    const caminho = encodeURIComponent(nomeArquivo);

    setStatusPlanilha('Enviando arquivo para o OneDrive (única vez)...', 'info');

    const response = await fetchComRetry(
        `https://graph.microsoft.com/v1.0/me/drive/root:/${PLANILHA_PASTA_ONEDRIVE}/${caminho}:/content`,
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
    await embutirPlanilhaMicrosoft(token, item.id, nomeArquivo, item.webUrl, true);
    setStatusPlanilha('Planilha enviada. A partir de agora não é possível trocar o arquivo.', 'success');
}

function alternarPainelPlanilha() {
    const col = document.getElementById('provaColPlanilha');
    if (col) col.classList.toggle('planilha-colapsada');
}

function marcarFocoPlanilha(ativo) {
    window._focoNaPlanilha = ativo;
    if (!ativo) return;
    setTimeout(() => {
        const col = document.getElementById('provaColPlanilha');
        const frame = document.getElementById('planilhaFrame');
        const materialFrame = document.getElementById('materialConsultaFrame');
        const alvo = document.activeElement;
        if (alvo?.closest('#provaColPlanilha') || alvo === frame || alvo === materialFrame) {
            window._focoNaPlanilha = true;
            return;
        }
        if (!col?.contains(alvo)) {
            window._focoNaPlanilha = false;
        }
    }, 500);
}

function resetarFerramentasProva() {
    pararMonitoramentoCompartilhamento();
    planilhaConectada = false;
    planilhaTravada = false;
    planilhaProvedor = null;
    uploadPlanilhaPendente = false;
    planilhaUrlAtual = null;
    planilhaNomeArquivo = null;
    planilhaItemIdAtual = null;
    planilhaAcaoPendenteAtual = null;
    limparSessaoPlanilha();
    try {
        sessionStorage.removeItem(PLANILHA_ACAO_PENDENTE_KEY);
        sessionStorage.removeItem(PLANILHA_RETORNO_URL_KEY);
    } catch (_) {
        // ignora
    }
    window._focoNaPlanilha = false;

    if (planilhaPopup && !planilhaPopup.closed) {
        planilhaPopup.close();
    }
    planilhaPopup = null;
    window.planilhaPopup = null;
    planilhaExcelNavegou = false;

    const input = document.getElementById('planilhaArquivoLocal');
    if (input) {
        input.value = '';
        input.disabled = false;
    }

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

    document.getElementById('btnPlanilhaJanela')?.classList.add('hidden');
}
