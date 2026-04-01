// ============================================
// GERENCIAMENTO DE QUESTÕES
// ============================================

let questoesCache = [];
let alternativasCount = 0;

// ============================================
// CARREGAR E FILTRAR QUESTÕES
// ============================================

async function carregarQuestoes() {
    await filtrarQuestoes();
}

async function filtrarQuestoes() {
    const container = document.getElementById('listaQuestoes');
    if (container) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <div class="loading"></div>
                <p class="mt-2 text-muted">Carregando questões...</p>
            </div>
        `;
    }

    try {
        const topico = document.getElementById('filtroTopico').value;
        const dificuldade = document.getElementById('filtroDificuldade').value;
        const tipo = document.getElementById('filtroTipo').value;

        let url = `${API_URL}/questoes?`;
        if (topico) url += `topico_id=${topico}&`;
        if (dificuldade) url += `dificuldade=${dificuldade}&`;
        if (tipo) url += `tipo=${tipo}&`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Erro do servidor: ${response.status}`);
        }

        questoesCache = await response.json();
        renderizarQuestoes(questoesCache);

    } catch (error) {
        console.error('Erro ao carregar questões:', error);
        if (container) {
            container.innerHTML = `
                <div class="card" style="grid-column: 1 / -1; background: rgba(239, 68, 68, 0.1); border: 1px solid var(--error);">
                    <div style="text-align: center; padding: 1rem;">
                        <h3 style="color: var(--error); margin-bottom: 0.5rem;">❌ Erro ao buscar questões</h3>
                        <p>${error.message}</p>
                        <button class="btn btn-sm btn-secondary mt-2" onclick="filtrarQuestoes()">🔄 Tentar Novamente</button>
                    </div>
                </div>
            `;
        }
    }
}

function renderizarQuestoes(questoes) {
    const container = document.getElementById('listaQuestoes');

    if (!questoes || questoes.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: var(--radius-lg);">
                <div style="font-size: 2rem; margin-bottom: 1rem;">📝</div>
                <p>Nenhuma questão encontrada</p>
                <button class="btn btn-primary mt-2" onclick="abrirModalNovaQuestao()">
                    <span>➕</span> Criar Primeira Questão
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = questoes.map(q => `
        <div class="card">
            <div class="flex-between mb-2">
                <span class="badge ${getDificuldadeBadge(q.dificuldade)}">${getDificuldadeTexto(q.dificuldade)}</span>
                <div class="flex gap-1">
                    <button class="btn btn-sm btn-secondary" onclick="verQuestao(${q.id})" title="Ver detalhes">
                        👁️
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="editarQuestao(${q.id})" title="Editar">
                        ✏️
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deletarQuestao(${q.id})" title="Deletar">
                        🗑️
                    </button>
                </div>
            </div>
            
            <div class="mb-2">
                ${q.enunciado ? `<p style="color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 0.5rem;">${q.enunciado.substring(0, 150) + (q.enunciado.length > 150 ? '...' : '')}</p>` : ''}
                ${q.usa_imagem && q.enunciado_imagem ?
            `<img src="${q.enunciado_imagem}" style="max-width: 100%; max-height: 200px; object-fit: contain; border-radius: var(--radius-md);">` : ''
        }
            </div>
            
            <div style="font-size: 0.875rem; color: var(--text-muted);">
                <div>📚 ${q.topico_nome}</div>
                <div>📝 ${q.tipo === 'multipla_escolha' ? 'Múltipla Escolha' : 'Verdadeiro/Falso'}</div>
                ${q.usa_imagem ? '<div>🖼️ Usa imagem</div>' : ''}
            </div>
        </div>
    `).join('');

    // Renderizar LaTeX se disponível
    if (window.renderMathInElement) {
        renderMathInElement(container, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true }
            ]
        });
    }
}

async function verQuestao(id) {
    try {
        const response = await fetch(`${API_URL}/questoes/${id}`);
        const questao = await response.json();

        // Criar modal temporário
        const modalTemp = document.createElement('div');
        modalTemp.className = 'modal active';
        modalTemp.innerHTML = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3 class="modal-title">Detalhes da Questão</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div style="max-height: 70vh; overflow-y: auto; padding: 1.5rem;">
                    <div class="mb-3">
                        <strong>Tópico:</strong> ${questao.topico_nome}<br>
                        <strong>Dificuldade:</strong> <span class="badge ${getDificuldadeBadge(questao.dificuldade)}">${getDificuldadeTexto(questao.dificuldade)}</span><br>
                        <strong>Tipo:</strong> ${questao.tipo === 'multipla_escolha' ? 'Múltipla Escolha' : 'Verdadeiro/Falso'}
                    </div>
                    
                    <div class="mb-3">
                        <strong>Enunciado:</strong><br>
                        ${questao.enunciado ? `<p style="margin-top: 0.5rem; margin-bottom: 0.5rem;">${questao.enunciado}</p>` : ''}
                        ${questao.usa_imagem && questao.enunciado_imagem ?
                `<img src="${questao.enunciado_imagem}" style="max-width: 100%; border-radius: var(--radius-md); margin-bottom: 0.5rem;">` : ''
            }
                    </div>
                    
                    <div>
                        <strong>Alternativas:</strong>
                        <div class="alternativas-list mt-2">
                            ${questao.alternativas.map((alt, index) => `
                                <div class="alternativa-item ${alt.correta ? 'correta' : ''}" style="margin-bottom: 0.75rem;">
                                    <div class="alternativa-letra">${String.fromCharCode(65 + index)}</div>
                                    <div class="alternativa-content">
                                        ${alt.imagem ?
                    `<img src="${alt.imagem}" style="max-width: 100%; border-radius: var(--radius-md);">` :
                    alt.texto
                }
                                        ${alt.correta ? ' <strong style="color: var(--success);">✓ Correta</strong>' : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalTemp);

        // Renderizar LaTeX no modal
        if (window.renderMathInElement) {
            renderMathInElement(modalTemp, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false }
                ]
            });
        }

    } catch (error) {
        console.error('Erro ao carregar questão:', error);
        mostrarErro('Erro ao carregar questão');
    }
}

async function deletarQuestao(id) {
    if (!confirm('Tem certeza que deseja deletar esta questão?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/questoes/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            const payload = await response.json().catch(() => ({}));
            const extra = payload?.removidos
                ? ` (vínculos removidos: respostas ${payload.removidos.respostas}, provas ${payload.removidos.provas_questoes})`
                : '';
            mostrarSucesso(`Questão deletada com sucesso${extra}`);
            filtrarQuestoes();
        } else {
            const textBody = await response.text();
            let message = `Erro ao deletar questão (HTTP ${response.status})`;
            try {
                const data = JSON.parse(textBody);
                if (data.error) message = data.error;
                if (data.details) message += `: ${data.details}`;
            } catch (e) {
                if (textBody) message += `: ${textBody.substring(0, 180)}`;
            }
            mostrarErro(message);
        }
    } catch (error) {
        console.error('Erro ao deletar questão:', error);
        mostrarErro(`Erro ao deletar questão: ${error.message}`);
    }
}

// ============================================
// CRIAR/EDITAR QUESTÃO
// ============================================

let questaoEditandoId = null;

async function editarQuestao(id) {
    try {
        // Carregar dados da questão
        const response = await fetch(`${API_URL}/questoes/${id}`);
        const questao = await response.json();

        // Guardar ID para atualização
        questaoEditandoId = id;

        // Preencher formulário
        document.getElementById('questaoTopico').value = questao.topico_id;
        document.getElementById('questaoDificuldade').value = questao.dificuldade;
        document.getElementById('questaoTipo').value = questao.tipo;

        // Configurar enunciado
        document.getElementById('questaoUsaImagem').checked = questao.usa_imagem;
        document.getElementById('questaoEnunciado').value = questao.enunciado || ''; // Sempre preencher o texto
        toggleEnunciadoImagem();

        // Resetar preview
        const preview = document.getElementById('previewEnunciado');
        preview.innerHTML = '';
        preview.classList.add('hidden');

        if (questao.usa_imagem && questao.enunciado_imagem) {
            // Mostrar preview da imagem existente
            preview.innerHTML = `<img src="${questao.enunciado_imagem}" alt="Enunciado">`;
            preview.classList.remove('hidden');
        }

        // Limpar e adicionar alternativas
        alternativasCount = 0;
        document.getElementById('alternativasContainer').innerHTML = '';

        questao.alternativas.forEach((alt, index) => {
            adicionarAlternativa();
            const cards = document.querySelectorAll('#alternativasContainer .card');
            const card = cards[cards.length - 1];

            if (alt.imagem) {
                // Alternativa com imagem
                card.querySelector('.alternativa-usa-imagem').checked = true;
                toggleAlternativaImagem(card.querySelector('.alternativa-usa-imagem'));

                const preview = card.querySelector('.alternativa-imagem-preview');
                preview.innerHTML = `<img src="${alt.imagem}" alt="Alternativa">`;
                preview.classList.remove('hidden');
            } else {
                // Alternativa com texto
                card.querySelector('.alternativa-texto').value = alt.texto || '';
            }

            card.querySelector('.alternativa-correta').checked = alt.correta;
        });

        // Mudar título do modal
        document.querySelector('#modalQuestao .modal-title').textContent = 'Editar Questão';

        // Abrir modal
        abrirModal('modalQuestao');

    } catch (error) {
        console.error('Erro ao carregar questão para edição:', error);
        mostrarErro('Erro ao carregar questão');
    }
}

function abrirModalNovaQuestao() {
    // Resetar ID de edição
    questaoEditandoId = null;

    // Mudar título do modal
    document.querySelector('#modalQuestao .modal-title').textContent = 'Nova Questão';

    // Resetar formulário
    document.getElementById('formQuestao').reset();
    document.getElementById('questaoUsaImagem').checked = false;
    toggleEnunciadoImagem();

    // Limpar alternativas
    alternativasCount = 0;
    document.getElementById('alternativasContainer').innerHTML = '';

    // Adicionar 4 alternativas padrão
    for (let i = 0; i < 4; i++) {
        adicionarAlternativa();
    }

    abrirModal('modalQuestao');
}

function toggleEnunciadoImagem() {
    const usaImagem = document.getElementById('questaoUsaImagem').checked;
    const grupoTexto = document.getElementById('grupoEnunciadoTexto');
    const grupoImagem = document.getElementById('grupoEnunciadoImagem');

    if (usaImagem) {
        grupoTexto.classList.remove('hidden'); // Texto sempre visível agora
        grupoImagem.classList.remove('hidden');
        document.getElementById('questaoEnunciado').required = false; // Texto opcional se tem imagem
        document.getElementById('questaoEnunciado').placeholder = "Texto do enunciado (opcional junto com imagem)";
    } else {
        grupoTexto.classList.remove('hidden');
        grupoImagem.classList.add('hidden');
        document.getElementById('questaoEnunciado').required = true; // Texto obrigatório se não tem imagem
        document.getElementById('questaoEnunciado').placeholder = "";
    }
}

function adicionarAlternativa() {
    const container = document.getElementById('alternativasContainer');
    const index = alternativasCount++;
    const letra = String.fromCharCode(65 + index);

    const div = document.createElement('div');
    div.className = 'card mb-2';
    div.style.padding = '1rem';
    div.innerHTML = `
        <div class="flex-between mb-2">
            <strong>Alternativa ${letra}</strong>
            <button type="button" class="btn btn-sm btn-danger" onclick="removerAlternativa(this)">
                🗑️
            </button>
        </div>
        
        <div class="form-group">
            <label class="form-label">
                <input type="checkbox" class="alternativa-usa-imagem" onchange="toggleAlternativaImagem(this)">
                Usar imagem
            </label>
        </div>
        
        <div class="alternativa-texto-grupo">
            <div class="form-group">
                <input type="text" class="form-input alternativa-texto" placeholder="Texto da alternativa" required>
            </div>
        </div>
        
        <div class="alternativa-imagem-grupo hidden">
            <div class="form-group">
                <label class="file-upload-btn">
                    <span>📁</span> Selecionar Imagem
                    <input type="file" class="form-file alternativa-imagem-file" accept="image/*" onchange="previewImagemAlternativa(this)">
                </label>
                <div class="alternativa-imagem-preview image-preview hidden"></div>
            </div>
        </div>
        
        <div class="form-group">
            <label class="form-label">
                <input type="checkbox" class="alternativa-correta">
                Esta é a resposta correta
            </label>
        </div>
    `;

    container.appendChild(div);
}

function removerAlternativa(btn) {
    btn.closest('.card').remove();
}

function toggleAlternativaImagem(checkbox) {
    const card = checkbox.closest('.card');
    const textoGrupo = card.querySelector('.alternativa-texto-grupo');
    const imagemGrupo = card.querySelector('.alternativa-imagem-grupo');
    const textoInput = card.querySelector('.alternativa-texto');

    if (checkbox.checked) {
        textoGrupo.classList.add('hidden');
        imagemGrupo.classList.remove('hidden');
        textoInput.required = false;
    } else {
        textoGrupo.classList.remove('hidden');
        imagemGrupo.classList.add('hidden');
        textoInput.required = true;
    }
}

function previewImagem(input, previewId) {
    const preview = document.getElementById(previewId);

    if (input.files && input.files[0]) {
        const reader = new FileReader();

        reader.onload = (e) => {
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            preview.classList.remove('hidden');
        };

        reader.readAsDataURL(input.files[0]);
    }
}

function previewImagemAlternativa(input) {
    const card = input.closest('.card');
    const preview = card.querySelector('.alternativa-imagem-preview');

    if (input.files && input.files[0]) {
        const reader = new FileReader();

        reader.onload = (e) => {
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            preview.classList.remove('hidden');
        };

        reader.readAsDataURL(input.files[0]);
    }
}

async function salvarQuestao(event) {
    event.preventDefault();

    try {
        const usaImagem = document.getElementById('questaoUsaImagem').checked;
        let enunciadoImagem = null;

        // Upload da imagem do enunciado se necessário
        if (usaImagem) {
            const imagemFile = document.getElementById('questaoImagemFile').files[0];
            if (imagemFile) {
                enunciadoImagem = await uploadImagem(imagemFile);
            } else if (!questaoEditandoId) {
                // Só exigir imagem se for nova questão
                mostrarErro('Por favor, selecione uma imagem para o enunciado');
                return;
            }
        }

        // Coletar alternativas
        const alternativasElements = document.querySelectorAll('#alternativasContainer .card');
        const alternativas = [];

        for (const altElement of alternativasElements) {
            const usaImagemAlt = altElement.querySelector('.alternativa-usa-imagem').checked;
            let imagemUrl = null;
            let texto = null;

            if (usaImagemAlt) {
                const imagemFile = altElement.querySelector('.alternativa-imagem-file').files[0];
                if (imagemFile) {
                    imagemUrl = await uploadImagem(imagemFile);
                }
            } else {
                texto = altElement.querySelector('.alternativa-texto').value;
            }

            const correta = altElement.querySelector('.alternativa-correta').checked;

            alternativas.push({
                texto: texto,
                imagem: imagemUrl,
                correta: correta
            });
        }

        // Verificar se há pelo menos uma alternativa correta
        if (!alternativas.some(a => a.correta)) {
            mostrarErro('Marque pelo menos uma alternativa como correta');
            return;
        }

        // CORREÇÃO: Permitir salvar o texto do enunciado mesmo com imagem
        const enunciadoTexto = document.getElementById('questaoEnunciado').value;

        // CORREÇÃO: Se estiver editando e não enviou nova imagem, manter a antiga
        if (usaImagem && !enunciadoImagem && questaoEditandoId) {
            // Tenta recuperar do preview ou de uma variável. 
            // Como não armazenamos explicitamente, vamos pegar do preview se existir
            const previewImg = document.querySelector('#previewEnunciado img');
            if (previewImg) {
                // O src pode ser completo (http://...) ou relativo (/uploads/...).
                // O backend espera o caminho relativo salvo no banco (/uploads/...)
                const src = previewImg.getAttribute('src');
                if (src) {
                    // Se for uma URL completa, extrair o caminho relativo se possível, ou usar como está
                    // Mas o ideal é salvar o que veio do banco.
                    // Vamos assumir que o src do preview é o que queremos manter (ex: /uploads/img.png)
                    enunciadoImagem = src;
                }
            }
        }

        // Criar/Atualizar questão
        const questao = {
            enunciado: enunciadoTexto, // Agora envia o texto sempre
            enunciado_imagem: enunciadoImagem,
            topico_id: parseInt(document.getElementById('questaoTopico').value),
            dificuldade: document.getElementById('questaoDificuldade').value,
            tipo: document.getElementById('questaoTipo').value,
            usa_imagem: usaImagem,
            alternativas: alternativas,
            tags: [] // Pode ser expandido para incluir tags
        };

        // Determinar método e URL
        const method = questaoEditandoId ? 'PUT' : 'POST';
        const url = questaoEditandoId ?
            `${API_URL}/questoes/${questaoEditandoId}` :
            `${API_URL}/questoes`;

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(questao)
        });

        if (response.ok) {
            const mensagem = questaoEditandoId ?
                'Questão atualizada com sucesso!' :
                'Questão criada com sucesso!';
            mostrarSucesso(mensagem);
            fecharModal('modalQuestao');
            filtrarQuestoes();
            questaoEditandoId = null;
        } else {
            mostrarErro('Erro ao salvar questão');
        }

    } catch (error) {
        console.error('Erro ao salvar questão:', error);
        mostrarErro('Erro ao salvar questão');
    }
}

async function uploadImagem(file) {
    const formData = new FormData();
    formData.append('imagem', file);

    const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error('Erro no upload da imagem');
    }

    const data = await response.json();
    return data.url;
}
