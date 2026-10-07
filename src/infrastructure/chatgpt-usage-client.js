import Soup from 'gi://Soup';
import GLib from 'gi://GLib';
import {UsageError} from '../domain/usage-errors.js';

const BASE_URL = 'https://chatgpt.com';

export class ChatGPTUsageClient {
    constructor() {
        this._session = new Soup.Session();
        this._session.set_timeout(25);
    }

    async fetchUsage(cookie, cancellable = null) {
        if (!cookie?.trim())
            throw new UsageError('No saved session cookie was found.', 'missing-credential');
        const session = await this._request('/api/auth/session', {cookie: cookie.trim(), cancellable});
        if (!session?.accessToken)
            throw new UsageError('The session is invalid or expired. Update the cookie in Preferences.', 'auth');
        return this._request('/backend-api/wham/usage', {token: session.accessToken, cancellable});
    }

    _request(path, {cookie = null, token = null, cancellable = null} = {}) {
        return new Promise((resolve, reject) => {
            const message = Soup.Message.new('GET', `${BASE_URL}${path}`);
            const headers = message.get_request_headers();
            headers.append('Accept', 'application/json');
            headers.append('Referer', `${BASE_URL}/`);
            headers.append('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36');
            if (cookie) {
                headers.append('Cookie', cookie);
                const deviceId = cookie.match(/(?:^|;\s*)oai-did=([^;]+)/)?.[1];
                if (deviceId)
                    headers.append('oai-device-id', deviceId);
            }
            if (token)
                headers.append('Authorization', `Bearer ${token}`);

            this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
                let bytes;
                try {
                    bytes = session.send_and_read_finish(result);
                } catch {
                    reject(new UsageError('The ChatGPT request failed or was cancelled.', 'network'));
                    return;
                }
                const status = message.get_status();
                const body = new TextDecoder().decode(bytes.toArray());
                let payload;
                try {
                    payload = JSON.parse(body);
                } catch {
                    reject(new UsageError('ChatGPT returned an invalid JSON response.', 'invalid-data'));
                    return;
                }
                if (status === 401 || status === 403) {
                    reject(new UsageError('The session is invalid or expired. Update the cookie in Preferences.', 'auth'));
                    return;
                }
                if (status < 200 || status >= 300) {
                    reject(new UsageError(`ChatGPT returned HTTP ${status}.`, 'http'));
                    return;
                }
                resolve(payload);
            });
        });
    }

    destroy() {
        this._session.abort();
    }
}
