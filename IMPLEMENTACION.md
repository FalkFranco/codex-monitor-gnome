# Guía de implementación

## Objetivo y criterios

Proyecto mantenido por FrankooSeb.

Extensión propia para GNOME Shell 45+ que muestra el límite de Codex de cinco horas y el semanal. La cookie se introduce manualmente desde Preferencias y se guarda solo en GNOME Keyring. No debe persistirse en GSettings ni aparecer en logs.

La arquitectura mantiene independientes la UI, la aplicación, el modelo de dominio y la infraestructura para facilitar futuros cambios de autenticación o fuente de datos.

## Módulos

- `extension.js`: ciclo de vida de GNOME Shell, temporizador y coordinación de la UI.
- `prefs.js`: Preferencias GTK4, gestión de cookie, prueba de conexión e intervalo.
- `src/infrastructure/secret-store.js`: acceso a GNOME Keyring mediante libsecret.
- `src/infrastructure/chatgpt-usage-client.js`: peticiones HTTP con libsoup3 a ChatGPT.
- `src/application/usage-service.js`: acceso a credenciales, cliente y normalización.
- `src/domain/usage-model.js`: normaliza porcentajes y ventanas por duración.
- `src/domain/usage-errors.js`: categorías de error para estados de la UI.
- `schemas/org.gnome.shell.extensions.codex-monitor.gschema.xml`: preferencias no sensibles.
- `stylesheet.css`: estilos del panel y las barras del menú.

## Flujo

1. El usuario pega la cookie en Preferencias.
2. Se guarda mediante libsecret en GNOME Keyring; el campo se limpia.
3. El servicio lee la credencial y la entrega al cliente HTTP.
4. El cliente obtiene un token temporal desde `/api/auth/session` y consulta `/backend-api/wham/usage`.
5. El modelo identifica las ventanas de cinco horas y siete días por duración.
6. La extensión muestra porcentajes, restablecimiento y hora de actualización.

Los endpoints son internos de la web de ChatGPT, no una API pública estable. Sus rutas y campos deben quedar aislados en el cliente y validarse antes de mostrar datos.

## Seguridad y credenciales

- Cookie y token temporal nunca se guardan en GSettings, archivos ni registros.
- La cookie se almacena exclusivamente en GNOME Keyring; si el servicio no está disponible, se comunica el error.
- Preferencias ofrece guardar, probar y eliminar la credencial.
- Los errores HTTP no deben incluir encabezados ni contenido sensible.
- `Gio.Cancellable` cancela peticiones al desactivar la extensión.

## Actualización y ciclo de vida

- Consulta al habilitar, botón de actualización manual e intervalo configurable (15 minutos iniciales, rango 5–120).
- Evitar consultas simultáneas.
- Al desactivar: cancelar operaciones, eliminar temporizadores, desconectar señales y destruir actores.
- Conservar los últimos datos válidos en memoria si una actualización falla y marcar su antigüedad.

## Interfaz

- Panel compacto con indicador de 5 horas y semanal.
- Menú con barras, porcentaje usado/restante, tiempo de restablecimiento, última actualización, actualizar y Preferencias.
- Estados claros para carga, credencial ausente, sesión caducada, red inaccesible y formato desconocido.
- Si no se reconoce una ventana, no inventar su porcentaje ni etiquetarla como un límite conocido.

## Empaquetado y validación

Compilar el esquema con `glib-compile-schemas --strict schemas`. Para el bundle, usar `gnome-extensions pack --force --extra-source=src .` y revisar que el ZIP contenga `src/application`, `src/domain`, `src/infrastructure` y `src/ChatGPT-Logo.svg`. No instalar un bundle incompleto: el instalador reemplaza el directorio completo de la extensión.

Validar sintaxis JS, carga de módulos con GJS, metadatos, esquema y estados HTTP. La prueba de red real requiere una cookie vigente y nunca debe registrarse.

## Mejoras futuras

La separación permite añadir otro proveedor de credenciales, un importador auxiliar opcional, notificaciones de umbral o una fuente alternativa sin cambiar el modelo presentado a la UI.
