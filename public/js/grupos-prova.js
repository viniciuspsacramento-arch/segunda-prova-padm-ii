(function () {
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

    function obterGrupoPorPath(pathname) {
        const path = String(pathname || '').replace(/\/$/, '') || '/';
        for (const config of Object.values(GRUPOS_PROVA)) {
            if (config.path === path) return config.id;
        }
        return GRUPO_PADRAO;
    }

    function obterConfigGrupo(grupo) {
        if (grupo && GRUPOS_PROVA[grupo]) return GRUPOS_PROVA[grupo];
        return null;
    }

    function usarMarcaUfca() {
        const host = String(window.location.hostname || '').toLowerCase();
        if (host.includes('provasestatistica')) return true;
        return obterGrupoPorPath(window.location.pathname) !== GRUPO_PADRAO;
    }

    function obterMarcaSite() {
        if (usarMarcaUfca()) return 'Provas Estatística UFCA';
        return 'Banco de Questões';
    }

    function aplicarMarcaSite() {
        const marca = obterMarcaSite();
        const config = obterConfigGrupo(obterGrupoPorPath(window.location.pathname));
        const tituloPagina = config
            ? `${config.nomeExibicao} — UFCA`
            : `${marca} de Estatística`;

        document.title = tituloPagina;

        const h1 = document.querySelector('header .logo h1');
        if (h1) h1.textContent = marca;

        const subtitulo = document.querySelector('header .logo p');
        if (subtitulo && config) {
            subtitulo.textContent = config.nomeExibicao;
        }
    }

    window.GRUPO_PADRAO = GRUPO_PADRAO;
    window.GRUPOS_PROVA = GRUPOS_PROVA;
    window.obterGrupoPorPath = obterGrupoPorPath;
    window.obterConfigGrupo = obterConfigGrupo;
    window.usarMarcaUfca = usarMarcaUfca;
    window.obterMarcaSite = obterMarcaSite;
    window.aplicarMarcaSite = aplicarMarcaSite;

    document.addEventListener('DOMContentLoaded', aplicarMarcaSite);
})();
