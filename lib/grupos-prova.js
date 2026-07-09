const GRUPO_PADRAO = 'padrao';

const GRUPOS_PROVA = {
    estatisticaI202622: {
        id: 'estatisticaI202622',
        path: '/provaestatisticaI202622',
        prefixoTitulo: 'Prova Estatística I 2026.2',
        nomeExibicao: 'Prova Estatística I 2026.2',
        marcaSite: 'Provas Estatística UFCA'
    },
    estatisticaI202612: {
        id: 'estatisticaI202612',
        path: '/provaestatisticaI202612',
        prefixoTitulo: 'Prova Estatística I 2026.1.2',
        nomeExibicao: 'Prova Estatística I 2026.1.2',
        marcaSite: 'Provas Estatística UFCA'
    },
    estatisticaII202612: {
        id: 'estatisticaII202612',
        path: '/provaestatisticaII202612',
        prefixoTitulo: 'Prova Estatística II 2026.1.2',
        nomeExibicao: 'Prova Estatística II 2026.1.2',
        marcaSite: 'Provas Estatística UFCA'
    }
};

function obterConfigGrupo(grupo) {
    if (grupo && GRUPOS_PROVA[grupo]) return GRUPOS_PROVA[grupo];
    return null;
}

function normalizarGrupoProva(valor) {
    const grupo = String(valor || '').trim();
    if (GRUPOS_PROVA[grupo]) return grupo;
    return GRUPO_PADRAO;
}

function obterGrupoPorPath(pathname) {
    const path = String(pathname || '').replace(/\/$/, '') || '/';
    for (const config of Object.values(GRUPOS_PROVA)) {
        if (config.path === path) return config.id;
    }
    return GRUPO_PADRAO;
}

function nomeGrupoParaMensagem(grupo) {
    const config = obterConfigGrupo(grupo);
    if (config) return config.nomeExibicao;
    return 'Prova I–V';
}

module.exports = {
    GRUPO_PADRAO,
    GRUPOS_PROVA,
    obterConfigGrupo,
    normalizarGrupoProva,
    obterGrupoPorPath,
    nomeGrupoParaMensagem
};
