(function () {
    'use strict';

    const typographyKey = 'sla-typography';
    const themeKey = 'sla-theme';
    const scales = {
        normal: 1,
        large: 1.1,
        'extra-large': 1.2
    };

    function normalizeTypography(value) {
        return value === 'large' || value === 'extra-large' ? value : 'normal';
    }

    function readTypography() {
        try {
            const saved = JSON.parse(localStorage.getItem(typographyKey) || '{}');
            const normalized = {
                heading: normalizeTypography(saved.heading),
                body: normalizeTypography(saved.body)
            };
            localStorage.setItem(typographyKey, JSON.stringify(normalized));
            return normalized;
        } catch (error) {
            return { heading: 'normal', body: 'normal' };
        }
    }

    function applyPreferences() {
        const typography = readTypography();
        const theme = localStorage.getItem(themeKey) === 'light' ? 'light' : 'dark';
        const scale = scales[typography.body] || scales.normal;
        const headingScale = scales[typography.heading] || scales.normal;
        document.documentElement.style.setProperty('--global-page-scale', scale);
        document.documentElement.style.setProperty('--auth-heading-scale', headingScale);
        document.documentElement.style.setProperty('--auth-body-scale', scale);
        document.documentElement.style.setProperty('--welcome-heading-scale', headingScale);
        document.documentElement.style.setProperty('--welcome-body-scale', scale);
        document.documentElement.dataset.globalHeadingScale = headingScale;
        document.body.classList.toggle('global-theme-dark', theme === 'dark');
        document.body.classList.toggle('global-theme-light', theme === 'light');
        document.body.classList.toggle('theme-dark', theme === 'dark');
        updateButtons(theme, typography);
    }

    function updateButtons(theme, typography) {
        const themeButton = document.querySelector('[data-global-theme]');
        const fontButton = document.querySelector('[data-global-font]');
        if (themeButton) {
            themeButton.textContent = theme === 'dark' ? '☀' : '☾';
            themeButton.title = theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro';
            themeButton.setAttribute('aria-label', themeButton.title);
        }
        if (fontButton) {
            fontButton.textContent = 'Aa';
            fontButton.title = 'Cambiar tamaño de letra';
            fontButton.setAttribute('aria-label', fontButton.title);
        }
        const headingSelect = document.querySelector('[data-global-heading-size]');
        const bodySelect = document.querySelector('[data-global-body-size]');
        if (headingSelect) headingSelect.value = typography.heading;
        if (bodySelect) bodySelect.value = typography.body;
    }

    function addControls() {
        const currentPage = window.location.pathname.toLowerCase();
        const isAdministratorPage = currentPage.endsWith('/login_administrador.html') || currentPage.endsWith('/administrador_dashboard.html');
        if (document.querySelector('.welcome-page') || document.querySelector('.global-preferences') || isAdministratorPage) return;
        const controls = document.createElement('div');
        controls.className = 'global-preferences global-preferences-header';
        controls.innerHTML = '<a class="global-help-link" href="ayuda.html" title="Abrir centro de ayuda" aria-label="Abrir centro de ayuda">?</a><div class="global-font-menu-wrap"><button type="button" data-global-font>Aa</button><div class="global-font-menu" role="dialog" aria-label="Personalizar tipografia"><strong>Personalizar texto</strong><label for="global-heading-size">Tamano de titulos</label><select id="global-heading-size" data-global-heading-size><option value="normal">Normal</option><option value="large">Grande</option><option value="extra-large">Muy grande</option></select><label for="global-body-size">Tamano del texto</label><select id="global-body-size" data-global-body-size><option value="normal">Normal</option><option value="large">Grande</option><option value="extra-large">Muy grande</option></select></div></div><button type="button" data-global-theme></button>';
        const header = document.querySelector('.topbar-right')
            || document.querySelector('.user-box')
            || document.querySelector('.auth-form-panel')
            || document.body;
        (header || document.body).appendChild(controls);
        const fontButton = controls.querySelector('[data-global-font]');
        const fontMenu = controls.querySelector('.global-font-menu');
        fontButton.addEventListener('click', function () {
            const isOpen = fontMenu.classList.toggle('open');
            fontButton.setAttribute('aria-expanded', isOpen);
        });
        controls.querySelector('[data-global-heading-size]').addEventListener('change', function (event) {
            const current = readTypography();
            localStorage.setItem(typographyKey, JSON.stringify({ heading: event.target.value, body: current.body }));
            applyPreferences();
        });
        controls.querySelector('[data-global-body-size]').addEventListener('change', function (event) {
            const current = readTypography();
            localStorage.setItem(typographyKey, JSON.stringify({ heading: current.heading, body: event.target.value }));
            applyPreferences();
        });
        controls.querySelector('[data-global-theme]').addEventListener('click', function () {
            localStorage.setItem(themeKey, document.body.classList.contains('global-theme-dark') ? 'light' : 'dark');
            applyPreferences();
        });
    }

    window.SlaPreferences = { apply: applyPreferences };
    addControls();
    applyPreferences();
    window.addEventListener('storage', applyPreferences);
}());
