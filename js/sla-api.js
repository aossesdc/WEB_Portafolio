(function () {
    'use strict';

    const apiBaseUrl = window.SLA_API_BASE_URL || 'http://localhost:4000';
    const tokenKey = 'sla-session-token';

    async function request(path, options = {}) {
        const headers = new Headers(options.headers || {});
        const token = localStorage.getItem(tokenKey);

        if (options.body && !headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }
        if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        let response;
        try {
            response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
        } catch (error) {
            throw new Error('No se pudo conectar con el servidor. Comprueba que el backend esté iniciado.');
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.message || 'La solicitud no pudo completarse.');
        }
        return payload;
    }

    window.SlaApi = {
        request,
        login(email, password) {
            return request('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
        }
    };
}());
