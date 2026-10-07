import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {deleteCredential, getCredential, saveCredential} from './src/infrastructure/secret-store.js';
import {ChatGPTUsageClient} from './src/infrastructure/chatgpt-usage-client.js';
import {UsageService} from './src/application/usage-service.js';

const STATUS = {
    neutral: 'dialog-information-symbolic',
    success: 'emblem-ok-symbolic',
    warning: 'dialog-warning-symbolic',
    error: 'dialog-error-symbolic',
};

export default class CodexMonitorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        let disposed = false;
        let activeCancellable = null;

        const accountPage = new Adw.PreferencesPage({
            title: 'Cuenta',
            icon_name: 'avatar-default-symbolic',
        });
        const accountGroup = new Adw.PreferencesGroup({
            title: 'Cuenta de ChatGPT',
            description: 'Conecta la sesión que usas para Codex. La cookie se guarda de forma segura en el llavero de GNOME.',
        });

        const statusIcon = new Gtk.Image({
            icon_name: STATUS.neutral,
            pixel_size: 16,
        });
        const statusRow = new Adw.ActionRow({
            title: 'Estado de la sesión',
            subtitle: 'Comprobando GNOME Keyring…',
        });
        statusRow.add_prefix(statusIcon);
        accountGroup.add(statusRow);

        const cookieEntry = new Gtk.PasswordEntry({
            show_peek_icon: true,
            hexpand: true,
            width_chars: 32,
            max_width_chars: 48,
            placeholder_text: 'Pega aquí la cookie de sesión',
            activates_default: false,
        });
        const cookieRow = new Adw.ActionRow({
            title: 'Cookie de sesión',
            subtitle: 'El contenido se oculta mientras escribes.',
        });
        cookieRow.add_suffix(cookieEntry);
        cookieRow.set_activatable_widget(cookieEntry);
        accountGroup.add(cookieRow);

        const makeActionButton = (iconName, accessibleLabel, styleClass = null) => {
            const button = new Gtk.Button({
                child: new Gtk.Image({icon_name: iconName, pixel_size: 16}),
                tooltip_text: accessibleLabel,
                has_frame: false,
                valign: Gtk.Align.CENTER,
                width_request: 32,
                height_request: 32,
            });
            button.add_css_class('flat');
            if (styleClass)
                button.add_css_class(styleClass);
            button.update_property([Gtk.AccessibleProperty.LABEL], [accessibleLabel]);
            return button;
        };
        const testButton = makeActionButton('network-transmit-receive-symbolic', 'Probar conexión');
        const saveButton = makeActionButton('document-save-symbolic', 'Guardar cookie', 'suggested-action');
        const deleteButton = makeActionButton('user-trash-symbolic', 'Eliminar cookie', 'destructive-action');
        const actionBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 4,
            homogeneous: false,
            halign: Gtk.Align.END,
        });
        actionBox.append(testButton);
        actionBox.append(saveButton);
        actionBox.append(deleteButton);
        const actionsRow = new Adw.ActionRow({
            title: 'Acciones de sesión',
            subtitle: 'Probar, guardar o eliminar la cookie.',
        });
        actionsRow.add_suffix(actionBox);
        accountGroup.add(actionsRow);

        const privacyGroup = new Adw.PreferencesGroup({title: 'Privacidad'});
        privacyGroup.add(new Adw.ActionRow({
            title: 'Almacenamiento protegido',
            subtitle: 'La cookie se conserva en GNOME Keyring, no en las preferencias ni en archivos de texto.',
            activatable: false,
        }));

        accountPage.add(accountGroup);
        accountPage.add(privacyGroup);
        window.add(accountPage);

        const generalPage = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        const displayGroup = new Adw.PreferencesGroup({
            title: 'Visualización',
            description: 'El modo seleccionado se aplica al porcentaje del panel y a los valores destacados del menú.',
        });
        const displayModel = Gtk.StringList.new(['Porcentaje restante', 'Porcentaje usado']);
        const displayRow = new Adw.ComboRow({
            title: 'Mostrar en el panel',
            subtitle: 'El indicador del panel usa el límite de 5 horas.',
            model: displayModel,
            selected: settings.get_string('display-mode') === 'used' ? 1 : 0,
        });
        displayRow.connect('notify::selected', () => {
            if (!disposed)
                settings.set_string('display-mode', displayRow.selected === 1 ? 'used' : 'remaining');
        });
        displayGroup.add(displayRow);

        const refreshGroup = new Adw.PreferencesGroup({
            title: 'Actualización',
            description: 'La consulta se realiza en segundo plano. También puedes actualizar manualmente desde el menú del panel.',
        });
        const interval = new Adw.SpinRow({
            title: 'Intervalo de actualización',
            subtitle: 'Cada cuántos minutos consultar el uso (entre 5 y 120).',
            adjustment: new Gtk.Adjustment({
                lower: 5,
                upper: 120,
                step_increment: 5,
                page_increment: 15,
            }),
            numeric: true,
            digits: 0,
        });
        interval.set_value(settings.get_int('refresh-interval'));
        interval.connect('notify::value', () => {
            if (!disposed)
                settings.set_int('refresh-interval', Math.round(interval.get_value()));
        });
        refreshGroup.add(interval);

        generalPage.add(displayGroup);
        generalPage.add(refreshGroup);
        window.add(generalPage);

        const setStatus = (message, level = 'neutral') => {
            if (disposed)
                return;
            statusRow.set_subtitle(message);
            statusIcon.set_from_icon_name(STATUS[level] ?? STATUS.neutral);
            statusIcon.remove_css_class('success');
            statusIcon.remove_css_class('warning');
            statusIcon.remove_css_class('error');
            if (level !== 'neutral')
                statusIcon.add_css_class(level);
        };

        const setBusy = busy => {
            if (disposed)
                return;
            testButton.set_sensitive(!busy);
            saveButton.set_sensitive(!busy);
            deleteButton.set_sensitive(!busy);
            cookieEntry.set_sensitive(!busy);
        };

        testButton.connect('clicked', async () => {
            const cookie = cookieEntry.get_text().trim();
            if (!cookie) {
                setStatus('Pega la cookie de sesión antes de probar la conexión.', 'warning');
                cookieEntry.grab_focus();
                return;
            }

            setBusy(true);
            setStatus('Validando la sesión con ChatGPT…');
            const client = new ChatGPTUsageClient();
            const cancellable = new Gio.Cancellable();
            activeCancellable = cancellable;
            try {
                const service = new UsageService(client);
                await service.testCredential(cookie, cancellable);
                setStatus('Conexión correcta. Pulsa «Guardar cookie» para conservar esta sesión.', 'success');
            } catch (error) {
                if (!cancellable.is_cancelled())
                    setStatus(error.message || 'No se pudo validar la sesión.', 'error');
            } finally {
                client.destroy();
                if (activeCancellable === cancellable)
                    activeCancellable = null;
                setBusy(false);
            }
        });

        saveButton.connect('clicked', async () => {
            const cookie = cookieEntry.get_text().trim();
            if (!cookie) {
                setStatus('Pega la cookie de sesión antes de guardarla.', 'warning');
                cookieEntry.grab_focus();
                return;
            }

            setBusy(true);
            setStatus('Guardando la cookie en GNOME Keyring…');
            try {
                await saveCredential(cookie);
                if (!disposed) {
                    cookieEntry.set_text('');
                    setStatus('Cookie guardada de forma segura en GNOME Keyring.', 'success');
                }
            } catch {
                setStatus('No se pudo guardar la cookie. Comprueba que GNOME Keyring esté desbloqueado.', 'error');
            } finally {
                setBusy(false);
            }
        });

        deleteButton.connect('clicked', async () => {
            setBusy(true);
            setStatus('Eliminando la credencial…');
            try {
                await deleteCredential();
                if (!disposed) {
                    cookieEntry.set_text('');
                    setStatus('Credencial eliminada de GNOME Keyring.', 'success');
                }
            } catch {
                setStatus('No se pudo eliminar la credencial de GNOME Keyring.', 'error');
            } finally {
                setBusy(false);
            }
        });

        getCredential().then(credential => {
            if (disposed)
                return;
            setStatus(credential
                ? 'Hay una cookie guardada en GNOME Keyring.'
                : 'No hay una cookie guardada. Pega una para conectar Codex.');
        }).catch(() => {
            setStatus('No se pudo acceder a GNOME Keyring.', 'error');
        });

        window.connect('close-request', () => {
            disposed = true;
            activeCancellable?.cancel();
            cookieEntry.set_text('');
            return false;
        });
    }
}
