# Codex Monitor para GNOME — FrankooSeb

Extensión GNOME Shell 45+ para consultar desde el panel los límites de uso de Codex de cinco horas y semanales. La cookie se pega manualmente en Preferencias y se almacena en GNOME Keyring.

Desarrollada y mantenida por **FrankooSeb**.

## Preferencias

Las preferencias separan la cuenta de las opciones generales:

- En **Cuenta**, pega la cookie de sesión, comprueba la conexión y guárdala en GNOME Keyring. Probar la conexión no guarda la cookie ni limpia el campo.
- En **General**, elige si el panel muestra porcentaje restante o usado y configura la frecuencia de actualización.

La cookie solo se conserva en el llavero de GNOME; no se escribe en GSettings ni en archivos de preferencias.

## Desarrollo local

El repositorio fuente se mantiene separado del directorio de extensión instalado. Desde la raíz del repo, valida el esquema con:

```sh
glib-compile-schemas --strict schemas
```

Para construir el bundle, incluye explícitamente el código en subdirectorios y escribe el resultado fuera de este árbol fuente:

```sh
gnome-extensions pack --force --extra-source=src --extra-source=LICENSE --extra-source=README.md --out-dir=/tmp .
```

Sin `--extra-source=src`, `gnome-extensions pack` puede omitir los módulos y el logo local y producir un paquete incompleto. Para instalarlo en este equipo:

```sh
gnome-extensions install --force /tmp/codex-monitor@frankooseb.shell-extension.zip
gnome-extensions enable codex-monitor@frankooseb
```

El bundle se instala en el directorio de extensiones de GNOME, sin reemplazar el repo fuente.

Después de cambiar código de una extensión activa, puede ser necesario desactivarla y activarla de nuevo o reiniciar la sesión. Abre Preferencias con:

```sh
gnome-extensions prefs codex-monitor@frankooseb
```

Los endpoints web de ChatGPT son internos y pueden cambiar; su implementación está aislada en `src/infrastructure/chatgpt-usage-client.js`.

## Publicación

El proyecto usa licencia MIT; consulta `LICENSE`. La URL del repositorio y el UUID público están definidos en `metadata.json`.

## Instalar en otra computadora

Clona el repo en un directorio de proyectos, compílalo e instala el bundle:

```sh
git clone https://github.com/FalkFranco/codex-monitor-gnome.git "$HOME/Projects/codex-monitor-gnome"
cd "$HOME/Projects/codex-monitor-gnome"
glib-compile-schemas --strict schemas
gnome-extensions pack --force --extra-source=src --extra-source=LICENSE --extra-source=README.md --out-dir=/tmp .
gnome-extensions install --force /tmp/codex-monitor@frankooseb.shell-extension.zip
gnome-extensions enable codex-monitor@frankooseb
gnome-extensions prefs codex-monitor@frankooseb
```

En Preferencias, pega y guarda la cookie de esa computadora. Las cookies no se transfieren mediante Git y se guardan localmente en el GNOME Keyring de cada equipo.
