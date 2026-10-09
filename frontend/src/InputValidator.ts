export class InputValidator {
    static validateUsername(username: string): { valid: boolean; error?: string } {
        if (!username || username.trim().length === 0) {
            return { valid: false, error: 'Benutzername ist erforderlich.' };
        }

        if (username.length < 3 || username.length > 32) {
            return { valid: false, error: 'Benutzername muss zwischen 3 und 32 Zeichen lang sein.' };
        }

        if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
            return { valid: false, error: 'Benutzername darf nur Buchstaben, Zahlen, Punkte, Unterstriche und Bindestriche enthalten.' };
        }

        return { valid: true };
    }

    static validatePassword(password: string): { valid: boolean; error?: string } {
        if (!password) {
            return { valid: false, error: 'Passwort ist erforderlich.' };
        }

        if (password.length < 8) {
            return { valid: false, error: 'Passwort muss mindestens 8 Zeichen lang sein.' };
        }

        if (password.length > 128) {
            return { valid: false, error: 'Passwort darf maximal 128 Zeichen lang sein.' };
        }

        if (!/[A-Z]/.test(password)) {
            return { valid: false, error: 'Passwort muss mindestens einen Großbuchstaben enthalten.' };
        }

        if (!/[a-z]/.test(password)) {
            return { valid: false, error: 'Passwort muss mindestens einen Kleinbuchstaben enthalten.' };
        }

        if (!/[0-9]/.test(password)) {
            return { valid: false, error: 'Passwort muss mindestens eine Ziffer enthalten.' };
        }

        return { valid: true };
    }

    static validateName(name: string): { valid: boolean; error?: string } {
        if (!name || name.trim().length === 0) {
            return { valid: false, error: 'Name ist erforderlich.' };
        }

        if (name.length > 255) {
            return { valid: false, error: 'Name darf maximal 255 Zeichen lang sein.' };
        }

        if (this.containsXssPayload(name)) {
            return { valid: false, error: 'Name enthält ungültige Zeichen.' };
        }

        return { valid: true };
    }

    static validateDescription(description: string | null): { valid: boolean; error?: string } {
        if (!description) {
            return { valid: true };
        }

        if (description.length > 5000) {
            return { valid: false, error: 'Beschreibung darf maximal 5000 Zeichen lang sein.' };
        }

        if (this.containsXssPayload(description)) {
            return { valid: false, error: 'Beschreibung enthält ungültige Zeichen.' };
        }

        return { valid: true };
    }

    static sanitizeInput(input: string): string {
        if (!input) return '';

        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML.trim();
    }

    private static containsXssPayload(input: string): boolean {
        const xssPatterns = [
            '<script',
            'javascript:',
            'onerror=',
            'onload=',
            'onclick=',
            '<iframe',
            '<object',
            '<embed',
            'eval(',
            'expression('
        ];

        const lowerInput = input.toLowerCase();
        return xssPatterns.some(pattern => lowerInput.includes(pattern));
    }
}
