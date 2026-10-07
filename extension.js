import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {ChatGPTUsageClient} from './src/infrastructure/chatgpt-usage-client.js';
import {UsageService} from './src/application/usage-service.js';
import {formatReset} from './src/domain/usage-model.js';

const WINDOWS = [
    {key: 'short', title: 'Límite de 5 horas', caption: 'Ventana de uso actual'},
    {key: 'weekly', title: 'Límite semanal', caption: 'Uso acumulado de la semana'},
];

export default class CodexMonitorExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._client = new ChatGPTUsageClient();
        this._service = new UsageService(this._client);
        this._cancellable = null;
        this._busy = false;
        this._usage = null;
        this._status = 'Conectando con Codex…';

        this._theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        this._stylesheet = Gio.File.new_for_path(`${this.path}/stylesheet.css`);
        this._theme.load_stylesheet(this._stylesheet);

        this._indicator = new PanelMenu.Button(0, 'Codex usage', false);
        this._panelBox = new St.BoxLayout({
            style_class: 'codex-panel-box',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const iconFile = Gio.File.new_for_path(`${this.path}/src/ChatGPT-Logo.svg`);
        this._panelIcon = new St.Icon({
            gicon: new Gio.FileIcon({file: iconFile}),
            icon_size: 16,
            style_class: 'codex-panel-icon',
        });
        this._panelLabel = new St.Label({
            text: '—',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'codex-panel-percent',
        });
        this._panelBox.add_child(this._panelIcon);
        this._panelBox.add_child(this._panelLabel);
        this._indicator.add_child(this._panelBox);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._menuSection = new PopupMenu.PopupMenuSection();
        this._indicator.menu.addMenuItem(this._menuSection);
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._indicator.menu.addAction('Actualizar ahora', () => this._refresh());
        this._indicator.menu.addAction('Preferencias', () => this.openPreferences());

        this._settings.connectObject(
            'changed::refresh-interval', () => this._setupTimer(),
            'changed::display-mode', () => this._render(),
            this
        );
        this._setupTimer();
        this._refresh();
    }

    disable() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        this._cancellable?.cancel();
        this._client?.destroy();
        this._settings?.disconnectObject(this);
        this._indicator?.destroy();
        if (this._stylesheet && this._theme)
            this._theme.unload_stylesheet(this._stylesheet);
        this._stylesheet = null;
        this._theme = null;
        this._indicator = null;
        this._client = null;
        this._service = null;
        this._settings = null;
        this._usage = null;
    }

    _setupTimer() {
        if (this._timerId)
            GLib.source_remove(this._timerId);
        const seconds = this._settings.get_int('refresh-interval') * 60;
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    async _refresh() {
        if (this._busy || !this._service)
            return;
        this._busy = true;
        this._cancellable = new Gio.Cancellable();
        this._status = 'Actualizando…';
        this._render();
        try {
            this._usage = await this._service.fetch(this._cancellable);
            this._status = `Actualizado ${new Date(this._usage.fetchedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
        } catch (error) {
            this._status = error.message || 'No se pudieron obtener los datos.';
        } finally {
            this._busy = false;
            this._cancellable = null;
            this._render();
        }
    }

    _displayPercent(window) {
        const percent = this._settings.get_string('display-mode') === 'remaining'
            ? 100 - window.usedPercent
            : window.usedPercent;
        return Math.round(Math.min(100, Math.max(0, percent)));
    }

    _addHeader() {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'codex-menu-header-item',
        });
        const row = new St.BoxLayout({
            style_class: 'codex-menu-header',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const icon = new St.Icon({
            gicon: new Gio.FileIcon({file: Gio.File.new_for_path(`${this.path}/src/ChatGPT-Logo.svg`)}),
            icon_size: 28,
            style_class: 'codex-menu-logo',
        });
        const text = new St.BoxLayout({vertical: true, x_expand: true});
        text.add_child(new St.Label({text: 'Codex', style_class: 'codex-menu-title'}));
        text.add_child(new St.Label({text: 'Uso de tu plan', style_class: 'codex-menu-subtitle'}));
        const state = new St.Label({
            text: this._busy ? 'ACTUALIZANDO' : (this._usage ? 'AL DÍA' : 'SIN DATOS'),
            style_class: `codex-status-pill ${this._busy ? 'is-loading' : (this._usage ? 'is-ready' : 'is-idle')}`,
            y_align: Clutter.ActorAlign.CENTER,
        });
        row.add_child(icon);
        row.add_child(text);
        row.add_child(state);
        item.add_child(row);
        this._menuSection.addMenuItem(item);
    }

    _addUsageCard({title, caption, window}) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'codex-card-menu-item',
        });
        const card = new St.BoxLayout({
            vertical: true,
            style_class: 'codex-usage-card',
            x_expand: true,
        });

        const top = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'codex-card-top',
        });
        const nameBox = new St.BoxLayout({vertical: true, x_expand: true});
        nameBox.add_child(new St.Label({text: title, style_class: 'codex-card-title'}));
        nameBox.add_child(new St.Label({text: caption, style_class: 'codex-card-caption'}));
        const percent = this._displayPercent(window);
        const percentLabel = new St.Label({
            text: `${percent}%`,
            style_class: 'codex-card-percent',
            y_align: Clutter.ActorAlign.CENTER,
        });
        top.add_child(nameBox);
        top.add_child(percentLabel);

        const consumed = Math.min(100, Math.max(0, Number(window.usedPercent) || 0));
        const progress = new St.BoxLayout({
            style_class: 'codex-progress-track',
            x_expand: true,
            height: 6,
        });
        const fill = new St.Widget({
            style_class: `codex-progress-fill ${this._progressTone(window.usedPercent)}`,
            x_expand: false,
            width: 0,
            height: 6,
            reactive: false,
        });
        progress.add_child(fill);
        const updateProgress = () => {
            fill.set_width(Math.round(Math.max(0, progress.width) * consumed / 100));
        };
        progress.connect('notify::width', updateProgress);
        updateProgress();

        const bottom = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'codex-card-bottom',
        });
        bottom.add_child(new St.Label({text: `${Math.round(consumed)}% consumido`, style_class: 'codex-card-detail'}));
        bottom.add_child(new St.Label({
            text: formatReset(window),
            style_class: 'codex-card-reset',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        }));

        card.add_child(top);
        card.add_child(progress);
        card.add_child(bottom);
        item.add_child(card);
        this._menuSection.addMenuItem(item);
    }

    _progressTone(usedPercent) {
        if (usedPercent >= 85)
            return 'is-critical';
        if (usedPercent >= 65)
            return 'is-warning';
        return 'is-normal';
    }

    _render() {
        if (!this._indicator || !this._settings)
            return;
        const short = this._usage?.windows.short;
        this._panelLabel.set_text(short ? `${this._displayPercent(short)}%` : (this._busy ? '…' : '—'));
        this._indicator.accessible_name = short
            ? `Codex: ${this._displayPercent(short)} por ciento ${this._settings.get_string('display-mode') === 'remaining' ? 'restante' : 'usado'}`
            : `Codex: ${this._status}`;

        this._menuSection.removeAll();
        this._addHeader();

        if (!this._usage) {
            const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
            const state = new St.Label({text: this._status, style_class: 'codex-empty-state', x_expand: true});
            item.add_child(state);
            this._menuSection.addMenuItem(item);
            return;
        }

        for (const windowSpec of WINDOWS) {
            const window = this._usage.windows[windowSpec.key];
            if (window)
                this._addUsageCard({...windowSpec, window});
        }

        const footer = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'codex-menu-footer-item',
        });
        footer.add_child(new St.Label({text: this._status, style_class: 'codex-menu-footer', x_expand: true}));
        this._menuSection.addMenuItem(footer);
    }
}
