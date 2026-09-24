<div align="center">

<img src="public/assets/syc-logo.svg" width="104" alt="SYC-AI">

# SYC-AI

### All You Need With AI — In One.

**Todo lo que necesitas de la IA, en un solo lugar. Claude Code y Codex en tu propio ordenador: iniciados, seguidos y aprobados desde la web, el móvil o el escritorio.**

[English](README.md) · [فارسی](README.fa.md) · [中文](README.zh-CN.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · **Español**

[![tests](https://github.com/SYCC-AI/syc-ai/actions/workflows/test.yml/badge.svg)](https://github.com/SYCC-AI/syc-ai/actions/workflows/test.yml)
[![release](https://img.shields.io/github/v/release/SYCC-AI/syc-ai?label=release&color=4f8cff)](https://github.com/SYCC-AI/syc-ai/releases/latest)
[![License: BSL 1.1](https://img.shields.io/badge/license-BSL%201.1-8b7bff.svg)](LICENSE)

[**Empieza gratis →**](https://app.syc-ai.com/login?lang=es)

</div>

<p align="center"><img src="screenshots/demo.gif" width="860" alt="SYC-AI"></p>

## Por qué SYC-AI

Los agentes de programación con IA son potentes, pero viven en la terminal de un solo ordenador: no puedes iniciar una sesión desde el móvil, no sabes cuándo esperan tu aprobación y cada herramienta tiene su propio acceso y su propia pantalla.

**SYC-AI lo reúne todo en un solo lugar.** Conecta tu ordenador una vez; a partir de ahí inicias y diriges Claude Code y Codex desde cualquier navegador, desde la app de Android o desde el escritorio. Tu móvil te avisa cuando un agente necesita tu visto bueno. Tus accesos y tus archivos se quedan en tu propio ordenador.

## Funciones

Ordenadas por lo que más piden quienes trabajan con agentes de IA.

| | Función | Qué significa para ti |
|---|---|---|
| 📱 | **Inicia y dirige desde el móvil** | Abre una sesión nueva de Claude Code o Codex —no solo mirarla— desde la web, la app de Android o el escritorio. |
| 🔔 | **Avisos en el móvil** | Tu móvil te avisa cuando un agente espera tu visto bueno o cuando termina una tarea larga. Lo activas tú; nada se abre solo. |
| 🧩 | **Todas las cuentas en un solo lugar** | Claude y Codex funcionan de principio a fin hoy. Gemini, Cursor y Kimi se instalan hoy en tu dispositivo; iniciar sesión en ellos es lo siguiente. |
| 💻 | **Funciona en tu propio ordenador** | Las CLI de IA se instalan e inician sesión con tus cuentas en tu dispositivo. Tus accesos y archivos se quedan allí. |
| ✅ | **Tú das el visto bueno** | Los comandos y los cambios de archivos esperan tu aprobación. Tú decides cuánto puede hacer un agente por su cuenta. |
| ⚡ | **Sin terminal** | Un solo comando conecta el ordenador e instala Node.js si falta. Después, todo son botones. |
| 🔀 | **Elige dónde se ejecuta** | Cada sesión se ejecuta en el dispositivo que elijas: portátil, servidor o PC con Windows. |
| 📊 | **Consumo en cada turno** | Mira lo que consumió cada respuesta para que tu cuota nunca te sorprenda. |
| 🛡️ | **Agente de dispositivo abierto** | [SYC Node](node-agent/) solo ejecuta las CLI de IA, solo toca su propia carpeta, registra cada petición y se puede pausar en cualquier momento. |
| 🔏 | **Actualizaciones firmadas con reversión** | El panel y SYC Node solo instalan versiones firmadas por SYC y vuelven a la anterior si falla una comprobación. |
| 🌍 | **Seis idiomas** | English, 中文, Español, العربية, Русский y فارسی: el panel, los instaladores y las respuestas de los agentes. |
| 💬 | **Ayuda donde trabajas** | Tickets y avisos dentro del panel, vinculados a tu cuenta. |

**Próximamente:** inicio de sesión en Gemini, Cursor y Kimi · Comunicaciones (Telegram, WhatsApp, Instagram) conectadas a tus agentes · espacios de equipo · las ediciones profesionales.

## Empezar

Una cuenta, cuatro formas de entrar. Regístrate en **[app.syc-ai.com](https://app.syc-ai.com/login?lang=es)** con una dirección de Gmail, un usuario y una contraseña.

| | Dónde | Cómo |
|---|---|---|
| 🌐 | **Web** | Abre **[app.syc-ai.com](https://app.syc-ai.com/login?lang=es)** en cualquier navegador. |
| 📱 | **Android** | **[Descarga la app SYC-AI](https://syc-ai.com/download/syc-ai.apk)** (APK): el panel en tu móvil y el canal de los avisos. |
| 🐧 | **Linux / macOS** | `curl -fsSL https://syc-ai.com/node/es/install.sh \| bash` |
| 🪟 | **Windows** | `irm https://syc-ai.com/node/es/install.ps1 \| iex` — y en Chrome o Edge, «Instalar SYC-AI» convierte el panel en una app de escritorio. |

Después abre **Cuentas profesionales**, pulsa **Instalar** en Claude o Codex e **inicia sesión** una vez en tu propio navegador. Listo.

> Estos son enlaces de instalación en español: el instalador pregunta «¿English o Español?». Instala Node.js si falta; si se ejecuta como root en Linux, crea un usuario aparte llamado `syc-node`. Quítalo todo cuando quieras con `syc-node uninstall`.

## Cómo funciona

- Tu ordenador se conecta **hacia** syc-ai.com: no se abre ningún puerto en tu máquina ni hace falta un servidor.
- El panel pide a SYC Node que inicie la CLI de IA que instalaste; la CLI habla directamente con Anthropic u OpenAI con tu propia cuenta.
- Tus mensajes y las respuestas de los agentes pasan por el panel y se guardan en el historial de la sesión para que puedas seguir en otro dispositivo.

## Dónde están tus datos

| En tu ordenador | En syc-ai.com | Bajo tu control |
|---|---|---|
| Tus accesos de Claude y OpenAI (los guardan las CLI) | Tu cuenta de SYC-AI (correo, usuario, hash de la contraseña) | `syc-node pause`: el panel no usa el dispositivo hasta que reanudes |
| Tus archivos y proyectos | El historial de sesiones, para seguir en cualquier lugar | `syc-node log`: cada petición del panel a tu dispositivo |
| Los comandos que ejecutan los agentes | Nombres de dispositivos, avisos, tickets | `syc-node uninstall` · descarga tus datos desde tu perfil |

Detalles: [privacidad](https://syc-ai.com/privacy) · [términos](https://syc-ai.com/terms).

## SYC Node: el agente en tu dispositivo

SYC Node es un único archivo sin dependencias ([`node-agent/syc-node.mjs`](node-agent/syc-node.mjs)). Ejecuta **solo** las CLI de IA (`claude`, `codex`, `gemini`, `cursor-agent`, `kimi`, `qwen`), la instalación con npm de esos mismos paquetes y el instalador oficial de Cursor, y **rechaza cualquier otro programa**; lee y escribe **solo dentro de `~/.syc-node`**; descarta variables de entorno que podrían redirigir una CLI a otro servidor o precargar código; **registra cada petición** en `~/.syc-node/activity.log`, y solo se actualiza con versiones firmadas con la clave de versiones de SYC.

## Ediciones

| Edición | Estado |
|---|---|
| **SYC-AI (Main)** | Disponible — **gratis durante el lanzamiento** |
| Plus · Pro · Immortal Edition | Próximamente. El precio se muestra antes de elegir; los pagos aún no están abiertos. |

## Preguntas

**¿Es gratis?** SYC-AI (Main) es gratis durante el lanzamiento. Las ediciones de pago llegarán después, con el precio a la vista antes de elegir.

**¿Necesito un servidor?** No. Basta con tu portátil o tu PC; un servidor también sirve.

**¿Se envía mi código?** Tus archivos se quedan en tu ordenador. La conversación —tus mensajes y las respuestas, que pueden citar partes de archivos— pasa por syc-ai.com y se guarda en el historial de la sesión.

**¿Tenéis relación con Anthropic, OpenAI o Google?** No. SYC-AI es un producto independiente; usas tus propias cuentas según los términos de cada proveedor.

## Autoalojado

La edición autoalojada instala el panel completo en tu propio servidor Linux: comando y requisitos en el [README en inglés](README.md#self-host).

## Comunidad

Preguntas e ideas en [Discussions](https://github.com/SYCC-AI/syc-ai/discussions), errores en [Issues](https://github.com/SYCC-AI/syc-ai/issues), correo syc@syc-ai.com.

Si SYC-AI te facilita el trabajo, una ⭐ ayuda a que otros lo encuentren.

## Licencia

Código fuente disponible (source-available) bajo la [Business Source License 1.1](LICENSE). `SYC` y `SYC-AI` son marcas de SYC.
