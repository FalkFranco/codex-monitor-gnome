export class UsageError extends Error {
    constructor(message, kind = 'unknown') {
        super(message);
        this.name = 'UsageError';
        this.kind = kind;
    }
}
