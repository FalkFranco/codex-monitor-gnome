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
            title: 'Account',
            icon_name: 'avatar-default-symbolic',
        });
        const accountGroup = new Adw.PreferencesGroup({
            title: 'ChatGPT account',
            description: 'Your session cookie is sensitive and may grant access to your ChatGPT account. It is stored in GNOME Keyring and sent only to chatgpt.com to retrieve usage.',
        });

        const statusIcon = new Gtk.Image({
            icon_name: STATUS.neutral,
            pixel_size: 16,
        });
        const statusRow = new Adw.ActionRow({
            title: 'Session status',
            subtitle: 'Checking GNOME Keyring…',
        });
        statusRow.add_prefix(statusIcon);
        accountGroup.add(statusRow);

        const cookieEntry = new Gtk.PasswordEntry({
            show_peek_icon: true,
            hexpand: true,
            width_chars: 32,
            max_width_chars: 48,
            placeholder_text: 'Paste your session cookie',
            activates_default: false,
        });
        const cookieRow = new Adw.ActionRow({
            title: 'Session cookie',
            subtitle: 'The value is hidden while you type.',
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
        const testButton = makeActionButton('network-transmit-receive-symbolic', 'Test connection');
        const saveButton = makeActionButton('document-save-symbolic', 'Save cookie', 'suggested-action');
        const deleteButton = makeActionButton('user-trash-symbolic', 'Delete cookie', 'destructive-action');
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
            title: 'Session actions',
            subtitle: 'Test, save, or delete the cookie.',
        });
        actionsRow.add_suffix(actionBox);
        accountGroup.add(actionsRow);

        const privacyGroup = new Adw.PreferencesGroup({title: 'Privacy'});
        privacyGroup.add(new Adw.ActionRow({
            title: 'Credential use',
            subtitle: 'The cookie is sent to ChatGPT to obtain an access token; usage is then requested from chatgpt.com. No telemetry is collected.',
            activatable: false,
        }));
        privacyGroup.add(new Adw.ActionRow({
            title: 'Unofficial service integration',
            subtitle: 'Usage retrieval relies on private ChatGPT web endpoints that may change. Codex Monitor is independent and is not affiliated with OpenAI.',
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
            title: 'Display',
            description: 'The selected mode applies to the panel percentage and the highlighted values in the menu.',
        });
        const displayModel = Gtk.StringList.new(['Percent remaining', 'Percent used']);
        const displayRow = new Adw.ComboRow({
            title: 'Panel percentage',
            subtitle: 'The panel indicator uses the 5-hour limit.',
            model: displayModel,
            selected: settings.get_string('display-mode') === 'used' ? 1 : 0,
        });
        displayRow.connect('notify::selected', () => {
            if (!disposed)
                settings.set_string('display-mode', displayRow.selected === 1 ? 'used' : 'remaining');
        });
        displayGroup.add(displayRow);

        const refreshGroup = new Adw.PreferencesGroup({
            title: 'Refresh',
            description: 'Usage is checked in the background. You can also refresh manually from the panel menu.',
        });
        const interval = new Adw.SpinRow({
            title: 'Refresh interval',
            subtitle: 'How often to check usage, in minutes (5–120).',
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
                setStatus('Paste a session cookie before testing the connection.', 'warning');
                cookieEntry.grab_focus();
                return;
            }

            setBusy(true);
            setStatus('Validating the session with ChatGPT…');
            const client = new ChatGPTUsageClient();
            const cancellable = new Gio.Cancellable();
            activeCancellable = cancellable;
            try {
                const service = new UsageService(client);
                await service.testCredential(cookie, cancellable);
                setStatus('Connection successful. Select “Save cookie” to keep this session.', 'success');
            } catch (error) {
                if (!cancellable.is_cancelled())
                    setStatus(error.message || 'Unable to validate the session.', 'error');
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
                setStatus('Paste a session cookie before saving it.', 'warning');
                cookieEntry.grab_focus();
                return;
            }

            setBusy(true);
            setStatus('Saving the cookie to GNOME Keyring…');
            try {
                await saveCredential(cookie);
                if (!disposed) {
                    cookieEntry.set_text('');
                    setStatus('Cookie saved securely in GNOME Keyring.', 'success');
                }
            } catch {
                setStatus('Unable to save the cookie. Check that GNOME Keyring is unlocked.', 'error');
            } finally {
                setBusy(false);
            }
        });

        deleteButton.connect('clicked', async () => {
            setBusy(true);
            setStatus('Deleting the credential…');
            try {
                await deleteCredential();
                if (!disposed) {
                    cookieEntry.set_text('');
                    setStatus('Credential deleted from GNOME Keyring.', 'success');
                }
            } catch {
                setStatus('Unable to delete the credential from GNOME Keyring.', 'error');
            } finally {
                setBusy(false);
            }
        });

        getCredential().then(credential => {
            if (disposed)
                return;
            setStatus(credential
                ? 'A cookie is stored in GNOME Keyring.'
                : 'No cookie is stored. Add one to connect to Codex.');
        }).catch(() => {
            setStatus('Unable to access GNOME Keyring.', 'error');
        });

        window.connect('close-request', () => {
            disposed = true;
            activeCancellable?.cancel();
            cookieEntry.set_text('');
            return false;
        });
    }
}
