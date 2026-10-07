import Secret from 'gi://Secret';

const schema = new Secret.Schema(
    'org.gnome.shell.extensions.codex-monitor.credential',
    Secret.SchemaFlags.NONE,
    {provider: Secret.SchemaAttributeType.STRING}
);
const attributes = {provider: 'codex'};

export function getCredential() {
    return new Promise((resolve, reject) => {
        Secret.password_lookup(schema, attributes, null, (source, result) => {
            try {
                resolve(Secret.password_lookup_finish(result));
            } catch (error) {
                reject(error);
            }
        });
    });
}

export function saveCredential(value) {
    return new Promise((resolve, reject) => {
        Secret.password_store(schema, attributes, Secret.COLLECTION_DEFAULT,
            'Codex Monitor session cookie', value, null, (source, result) => {
                try {
                    const stored = Secret.password_store_finish(result);
                    if (!stored)
                        reject(new Error('Keyring did not store the credential'));
                    else
                        resolve(true);
                } catch (error) {
                    reject(error);
                }
            });
    });
}

export function deleteCredential() {
    return new Promise((resolve, reject) => {
        Secret.password_clear(schema, attributes, null, (source, result) => {
            try {
                resolve(Secret.password_clear_finish(result));
            } catch (error) {
                reject(error);
            }
        });
    });
}
