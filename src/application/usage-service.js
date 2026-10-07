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
            throw new UsageError('Unable to access GNOME Keyring.', 'keyring');
        }
        if (!credential)
            throw new UsageError('Add and save a session cookie in Preferences.', 'missing-credential');
        return normalizeUsage(await this._client.fetchUsage(credential, cancellable));
    }

    async testCredential(cookie, cancellable = null) {
        return normalizeUsage(await this._client.fetchUsage(cookie, cancellable));
    }
}
