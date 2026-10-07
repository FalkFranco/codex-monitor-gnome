import {getCredential} from '../infrastructure/secret-store.js';
import {normalizeUsage} from '../domain/usage-model.js';
import {UsageError} from '../domain/usage-errors.js';

export class UsageService {
    constructor(client) {
        this._client = client;
    }

    async fetch(cancellable = null) {
        let credential;
        try {
            credential = await getCredential();
        } catch {
            throw new UsageError('No se pudo acceder a GNOME Keyring.', 'keyring');
        }
        if (!credential)
            throw new UsageError('Pega y guarda tu cookie de sesión en Preferencias.', 'missing-credential');
        return normalizeUsage(await this._client.fetchUsage(credential, cancellable));
    }

    async testCredential(cookie, cancellable = null) {
        return normalizeUsage(await this._client.fetchUsage(cookie, cancellable));
    }
}
