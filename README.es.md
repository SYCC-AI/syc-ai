<div align="center">

<img src="public/assets/syc-logo.svg" width="104" alt="SYC-AI">

# SYC-AI

### All You Need With AI — In One.

**Todo lo que necesitas de la IA, en un solo lugar. Todas tus suscripciones de IA — Claude, Codex y más — en una sesión, una carpeta de proyecto y una memoria. En tu propio ordenador, manejado desde la web, el móvil o el escritorio.**

[English](README.md) · [فارسی](README.fa.md) · [中文](README.zh-CN.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · **Español**

[![tests](https://github.com/SYCC-AI/syc-ai/actions/workflows/test.yml/badge.svg)](https://github.com/SYCC-AI/syc-ai/actions/workflows/test.yml)
[![release](https://img.shields.io/github/v/release/SYCC-AI/syc-ai?label=release&color=4f8cff)](https://github.com/SYCC-AI/syc-ai/releases/latest)
[![License: BSL 1.1](https://img.shields.io/badge/license-BSL%201.1-8b7bff.svg)](LICENSE)

[**Empieza gratis →**](https://app.syc-ai.com/login?lang=es)

</div>

<p align="center"><img src="screenshots/demo.gif" width="860" alt="SYC-AI"></p>

## Por qué SYC-AI

Pagas por Claude **y** ChatGPT, pero cada uno vive en su propia terminal, con su propia memoria, en una sola máquina. Cuando uno llega a su límite a mitad de una tarea, el trabajo se detiene. No puedes empezar una sesión desde el móvil y nunca sabes cuándo un agente espera tu aprobación.

**SYC-AI lo reúne todo en un solo lugar.** Conecta tu ordenador una vez y abre **SYC-AI — All in One**: una sesión donde Claude planifica, Codex construye y las preguntas cortas van a un modelo más ligero, en la misma carpeta de proyecto y con la misma memoria. Cuando una suscripción llega a su límite, el siguiente motor continúa el mismo mensaje. Tus accesos y tus archivos se quedan en tu ordenador.

<p align="center"><img src="screenshots/all-in-one.png" width="860" alt="SYC-AI All in One"></p>

## Funciones

Ordenadas según lo que más pide la gente que trabaja con agentes de IA.

| | Función | Qué significa para ti |
|---|---|---|
| ✨ | **SYC-AI — All in One** | Una sesión para todos tus motores. Cada mensaje va al que mejor encaja — la planificación a Claude, la construcción a Codex, las preguntas cortas a un modelo más ligero — o al que elijas. Una carpeta de proyecto y una memoria compartida (`AGENTS.md`), para que nada se pierda cuando los motores se turnan. |
| 🔁 | **Tu trabajo sigue cuando llega un límite** | Cuando una suscripción llega a su límite de uso, el mismo mensaje continúa con el siguiente motor en *tu* orden, con un breve resumen de lo ocurrido. (SYC-AI nunca salta a una segunda cuenta del mismo proveedor para saltarse su límite.) |
| 📊 | **Todo tu uso en un solo lugar** | El uso de 5 horas y semanal de cada cuenta conectada, con la hora de reinicio, sin enviar nada a ningún modelo. |
| 🪙 | **Ahorro de tokens, activado por defecto** | Respuestas cortas y exactas y sin lecturas inútiles, con habilidades de código abierto y sus autores citados. Sus autores midieron hasta un 65% menos de tokens de salida. |
| 📱 | **Empieza y dirige desde el móvil** | Abre una sesión nueva — no solo mírala — desde la web, la app de Android o el escritorio. |
| 🔔 | **Avisos en el móvil cuando un agente te necesita** | Tu móvil te avisa cuando un agente espera tu aprobación o termina una tarea larga. Lo activas tú; nada se abre solo. |
| 🧑‍🔧 | **Sesiones especializadas** | Creador de webs, reparador de errores, revisor de código, asistente de investigación, redactor y traductor, analista de datos, entrenador para principiantes, creador de juegos: empieza con un clic o descárgalas como `AGENTS.md` para cualquier agente de terminal. |
| 👥 | **Dos cuentas por proveedor** | Una cuenta personal y otra de trabajo de Claude o Codex en el mismo dispositivo; tú eliges cuál usa cada motor. |
| 💻 | **Funciona en tu ordenador** | Las CLI de IA se instalan e inician sesión en tu dispositivo con tus cuentas. Accesos y archivos se quedan allí. |
| ✅ | **Tú decides qué pueden hacer los agentes** | Solo lectura, trabajar en el proyecto o acceso total, con palabras claras. |
| ⚡ | **Sin terminal** | Un comando conecta el ordenador e instala Node.js si falta. Después, todo son botones. |
| 🛡️ | **Agente de dispositivo de código abierto** | [SYC Node](node-agent/) solo ejecuta las CLI de IA, solo toca su propia carpeta, registra cada petición y se puede pausar en cualquier momento. |
| 🔏 | **Actualizaciones firmadas con reversión** | El panel y SYC Node solo instalan versiones firmadas por SYC y vuelven a la anterior si falla una comprobación. |
| 🌍 | **Seis idiomas** | English, 中文, Español, العربية, Русский y فارسی: el panel, los instaladores y las respuestas de los agentes. |

**Próximamente en SYC-AI:** Gemini, Cursor y Kimi dentro de All in One · conectores con inicio de sesión oficial (GitHub, Google Drive, Gmail, Notion, Telegram, Figma) · estudio de imágenes personal · estudio de vídeos cortos · webs y tiendas en un clic · documentos y traducción · escritorio de investigación para estudiantes · taller para crear juegos · agentes de finanzas · bots inteligentes de Telegram (solo audiencias que aceptan) · panel para equipos y empresas · asistente diario en tu móvil.

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

## Agradecimientos

El ahorro de tokens de SYC-AI se apoya en trabajo de código abierto, citado dentro del producto allí donde se usa: [Caveman](https://github.com/JuliusBrussee/caveman) de Julius Brussee (MIT) y las habilidades de [Superpowers](https://github.com/obra/superpowers) de Jesse Vincent (MIT). Sus licencias acompañan a las habilidades en [`skills/`](skills/).

## Licencia

Código fuente disponible (source-available) bajo la [Business Source License 1.1](LICENSE). `SYC` y `SYC-AI` son marcas de SYC.
