<div align="center">

<img src="public/assets/syc-logo.svg" width="104" alt="SYC-AI">

# SYC-AI

### Claude Code y Codex en una sola conversación.<br>Cuando uno llega a su límite, el otro sigue.

La misma carpeta de proyecto, la misma memoria: tus dos suscripciones, en tu propio teléfono Android o PC con Windows.<br>
En seis idiomas.

[![tests](https://github.com/SYCC-AI/syc-ai/actions/workflows/test.yml/badge.svg)](https://github.com/SYCC-AI/syc-ai/actions/workflows/test.yml)
[![release](https://img.shields.io/github/v/release/SYCC-AI/syc-ai?label=release&color=4f8cff)](https://github.com/SYCC-AI/syc-ai/releases/latest)
[![License: BSL 1.1](https://img.shields.io/badge/license-BSL%201.1-8b7bff.svg)](LICENSE)
[![Main is free until 31 Dec 2026](https://img.shields.io/badge/Main-free%20until%2031%20Dec%202026-34d399.svg)](#editions)
[![Free Professional: about 60 free AI models](https://img.shields.io/badge/Free%20Professional-60%20free%20AI%20models-f5c45a.svg)](https://syc-ai.com/free-professional/)

[English](README.md) · [فارسی](README.fa.md) · [中文](README.zh-CN.md) · [Русский](README.ru.md) · [العربية](README.ar.md) · **Español**

</div>

<p align="center"><img src="screenshots/demo.gif" width="860" alt="Recorrido por SYC-AI: inicio de sesión, cuentas profesionales, una conversación All in One en la que Claude llega a su límite de uso y Codex continúa el mismo mensaje, ajustes y sesiones especializadas"></p>

- **Nuevo: Free Professional — gratis para todos.** Sin suscripción y sin clave de API.
  - Unos 60 modelos de IA gratuitos en una sola sesión de programación, probados y clasificados cada día. Empieza el más potente; cuando se agota su cuota gratuita, el siguiente sigue en los mismos archivos.
  - Elige tú cualquier modelo, o deja que Claude o Codex solo escriban el plan mientras los modelos gratuitos hacen el trabajo, con el progreso en vivo («paso 3 de 8»). [Cómo funciona →](https://syc-ai.com/free-professional/)
- **Una conversación, dos motores.**
  - Claude planifica, Codex construye y las preguntas rápidas van a un modelo más ligero, todo en una carpeta con un `AGENTS.md` compartido.
  - Cuando una suscripción llega a su límite, el mismo mensaje sigue en tu *otro* motor, con un breve resumen de lo que se perdió.
  - Nunca cambia a una segunda cuenta del mismo proveedor.
- **Nada que configurar a mano.**
  - La app de Android y la app de Windows traen Claude Code y Codex.
  - El dispositivo se une a tu cuenta con un código que apruebas; en el teléfono, solo.
  - Tú mismo inicias sesión en Claude y Codex, en tu propio navegador.
- **Mira lo que gastas.**
  - Uso de 5 horas y semanal de cada cuenta.
  - Un doctor de tokens.
  - Un aviso antes de retomar una conversación "fría" y cara.
  - Todo calculado sin preguntar a ningún modelo.

**Descárgalo:** [regístrate gratis](https://app.syc-ai.com/login?lang=es) (Google, GitHub o Gmail) → Android: [**syc-ai.apk**](https://syc-ai.com/download/syc-ai.apk) · Windows: [**SYC-AI-Setup.exe**](https://syc-ai.com/download/SYC-AI-Setup.exe)

<sub>SYC-AI es un producto independiente de SYC, sin relación con Anthropic ni OpenAI. Usas tus propias cuentas según los términos de cada proveedor. Las CLI oficiales, sin modificar, se ejecutan en tu dispositivo.</sub>

## Funciones

<p align="center"><img src="screenshots/all-in-one.png" width="860" alt="SYC-AI All in One: Claude planifica, Codex construye, una sesión y una memoria, el uso de ambas cuentas al lado"></p>

| | Función | Qué significa para ti |
|---|---|---|
| ✨ | **SYC-AI — All in One** | Una sesión para Claude y Codex. Cada mensaje va al que mejor le corresponde —la planificación a Claude, la construcción a Codex, las preguntas cortas a un modelo más ligero— o al que tú elijas. Una carpeta de proyecto y una memoria compartida (`AGENTS.md`), para que nada se pierda cuando los motores se turnan. |
| 🆓 | **Free Professional — gratis para todos** | Unos 60 modelos de IA gratuitos, probados y clasificados cada día, en una sola sesión en tu dispositivo: empieza el más potente y, cuando se agota su cuota gratuita, sigue el siguiente. Elige tú el modelo, o deja que Claude o Codex solo escriban el plan y los modelos gratuitos lo construyan paso a paso. Sin suscripción ni clave de API; uso justo de 800 solicitudes al día. |
| 🔁 | **Tu trabajo sigue cuando llega el límite** | Cuando una suscripción alcanza su límite de uso, el mismo mensaje continúa con el siguiente motor en *tu* orden, con un breve traspaso de lo ocurrido. (SYC-AI nunca salta a una segunda cuenta del mismo proveedor para esquivar su límite.) |
| 📊 | **Todo tu uso en un solo lugar** | El uso de 5 horas y semanal de cada cuenta conectada, con la hora de reinicio, leído sin enviar nada a un modelo. |
| 🩺 | **Doctor de tokens y aviso de conversación fría** | Un chequeo de en qué gastan tokens tus conversaciones en Claude y en Codex —aciertos de caché, conversaciones cuya caché ha caducado, la parte fija de cada pregunta— con consejos sencillos. Si retomas una conversación larga tras una hora o más, SYC-AI te avisa de que el siguiente mensaje volvería a leerla entera a precio completo. Nada de esto consulta a un modelo. |
| 🪙 | **Ahorro de tokens, activado por defecto** | Respuestas cortas y exactas, sin lecturas inútiles, con skills de código abierto con crédito a sus autores (Caveman, Superpowers). |
| 📱 | **App de Android con Claude Code y Codex dentro** | Los agentes se ejecutan en el propio teléfono. Al primer inicio, la app prepara las CLI oficiales, sin modificar, en un espacio privado y conecta el teléfono a tu cuenta. Inicia sesión con Google o GitHub dentro de la app. |
| 🪟 | **App de Windows con Claude Code y Codex dentro** | Un solo Setup.exe, sin permisos de administrador: Node.js, SYC Node, Claude Code y Codex en una descarga. El ordenador se une a tu cuenta con un código que apruebas: no se escribe ninguna contraseña de SYC-AI en el dispositivo. |
| 🔔 | **Avisos cuando un agente te necesita** | Tu teléfono te avisa cuando un agente espera tu aprobación o cuando termina una tarea larga. Lo activas tú; nada se abre solo. |
| 🧑‍🔧 | **Sesiones especializadas** | Creador de sitios web, corrector de errores, revisor de código, asistente de investigación, redactor y traductor, analista de datos, tutor para principiantes, creador de juegos: empieza con un clic o descárgalas como `AGENTS.md` para cualquier agente de terminal. |
| 👥 | **Dos cuentas por proveedor** | Una cuenta personal y otra de trabajo de Claude o Codex en el mismo dispositivo; tú eliges cuál usa cada motor. |
| ✅ | **Tú decides qué pueden hacer los agentes** | Solo lectura, trabajar en el proyecto o acceso total: ajustes por sesión, en palabras sencillas. |
| 🛡️ | **Agente de dispositivo de código abierto** | [SYC Node](node-agent/) solo ejecuta las CLI de IA, solo toca su propia carpeta, registra cada petición y se puede pausar en cualquier momento. Los archivos de ajustes propios de SYC-AI en tu dispositivo van firmados, y uno modificado se restaura. |
| 🔏 | **Actualizaciones firmadas con reversión** | El panel y SYC Node solo instalan versiones firmadas por SYC y vuelven a la anterior si falla una comprobación. |
| 🌍 | **Seis idiomas** | English, 中文, Español, العربية, Русский y فارسی: el panel, las apps y las respuestas de los agentes. |

**Motores hoy:** Claude Code y Codex están probados y funcionan en todas las sesiones. Ya puedes iniciar sesión en Gemini, Cursor y Kimi en tu dispositivo; su panel de chat llegará pronto. Qwen llegará pronto.

## Comparación honesta

| | **SYC-AI** | Anthropic Remote Control | Happy | Paseo | CloudCLI |
|---|---|---|---|---|---|
| Agentes | Claude Code + Codex (Gemini, Cursor, Kimi: inicio de sesión disponible, chat próximamente) | Claude Code | Claude Code, Codex | Claude Code, Codex, Copilot, OpenCode, Pi | Claude Code, Cursor CLI, Codex |
| Una conversación compartida por dos motores, misma memoria | **Sí** (All in One) | — (un motor) | No anunciado | No anunciado (una interfaz, agentes separados) | No anunciado |
| Sigue en otro motor cuando una suscripción llega a su límite | **Sí**, solo con otro proveedor, nunca con una segunda cuenta del mismo | — | No anunciado | No anunciado | No anunciado |
| Instala las CLI de los agentes por ti | **Sí** (dentro de las apps de Android y Windows) | Instalas tú Claude Code | Instalas tú la CLI y luego `npm i -g happy` | La CLI es un requisito previo | Usa tus sesiones de CLI existentes |
| Teléfono | App de Android (APK) que ejecuta Claude Code + Codex en el teléfono. Aún sin iOS | App de Claude, iOS + Android | iOS, Android, web | iOS, Android | Navegador |
| Aviso cuando un agente te necesita | Sí (si lo activas) | Sí (push) | Sí (push) | No indicado en el README | No indicado en el README |
| Por dónde pasa la conversación | syc-ai.com (se guarda en tu historial de sesiones; sin cifrado de extremo a extremo) | Anthropic | Relé con cifrado de extremo a extremo | Tu daemon; relé E2E opcional | Tu máquina (o su Cloud) |
| Cuenta necesaria | Sí (Google, GitHub o Gmail) | Suscripción de Claude | — | Sin inicios de sesión obligatorios | No (autoalojado) |
| Licencia | BSL 1.1 (source-available; código de SYC Node en el repositorio) | Propietaria | MIT | Apache-2.0 | AGPL-3.0 |
| Precio | Main gratis hasta el 31 de diciembre de 2026, luego 1,75 USD/mes | Incluido en los planes de Claude | Gratis | Gratis | Autoalojado gratis; Cloud desde 7 €/mes |

<sub>"No anunciado" significa que el README del proyecto (leído el 2026-09-25) no lo dice; no significa que sea imposible. Las correcciones son bienvenidas en [Issues](https://github.com/SYCC-AI/syc-ai/issues).</sub>

## Empezar

1. **Regístrate** en **[app.syc-ai.com](https://app.syc-ai.com/login?lang=es)** con Google, GitHub, o una dirección de Gmail y una contraseña. Las cuentas de SYC-AI se basan en Gmail: para usar GitHub, tu cuenta de GitHub necesita una dirección de Gmail verificada.
2. **Consigue la app:**

   | | Dónde | Cómo |
   |---|---|---|
   | 📱 | **Android** | **[Descarga syc-ai.apk](https://syc-ai.com/download/syc-ai.apk)** (aún no está en Google Play; Android la instala cuando lo confirmas). Ábrela e inicia sesión. Al primer inicio instala Claude Code y Codex en el teléfono —unos minutos— y conecta el teléfono a tu cuenta por sí sola. |
   | 🪟 | **Windows (x64)** | **[Descarga SYC-AI-Setup.exe](https://syc-ai.com/download/SYC-AI-Setup.exe)** y ejecútalo. No necesita permisos de administrador. Muestra un código corto y un enlace: abre el enlace donde tengas la sesión de SYC-AI iniciada —en el ordenador o en el teléfono— y pulsa **Conectar este dispositivo** antes de 10 minutos. |
   | 🌐 | **Web** | **[app.syc-ai.com](https://app.syc-ai.com/login?lang=es)** en cualquier navegador muestra tu perfil, tu plan y el estado de tus dispositivos. Para conectar Claude y Codex necesitas la app de Android o de Windows. |

3. **Inicia sesión en Claude y Codex.** En **Cuentas profesionales**, pulsa **Iniciar sesión** en cada motor e inicia sesión una vez, en tu propio navegador. Después abre **SYC-AI — All in One** y empieza a trabajar.

> El Setup.exe de Windows aún no tiene firma de código, así que Windows SmartScreen puede pedirte que confirmes (**Más información → Ejecutar de todas formas**). Puedes quitarlo cuando quieras desde **Aplicaciones y características**.

## Cómo funciona

- Tu dispositivo se conecta **hacia fuera** a syc-ai.com. No se abre ningún puerto en él y no hace falta un servidor ([lee el código del agente](node-agent/syc-node.mjs)).
- El panel le pide a SYC Node que inicie la CLI de IA instalada en tu dispositivo. La CLI habla directamente con Anthropic u OpenAI, con tu propia cuenta.
- Tus mensajes y las respuestas de los agentes pasan por el panel y se guardan en tu historial de sesiones, para que puedas seguir en otro dispositivo. No tienen cifrado de extremo a extremo.

## Dónde están tus datos

| Se queda en tu dispositivo | Se guarda en syc-ai.com | Tus controles |
|---|---|---|
| Tus inicios de sesión de Claude y OpenAI (los guardan las CLI) | Tu cuenta de SYC-AI (correo, usuario, hash de la contraseña) | Pausar SYC Node: el panel no puede usar el dispositivo hasta que lo reanudes |
| Tus archivos y proyectos | Tu historial de sesiones, para seguir desde cualquier sitio | El registro de actividad: cada petición que el panel hizo a tu dispositivo |
| Los comandos que ejecutan los agentes | Nombres de dispositivos, avisos, tickets de soporte | Desinstalar cuando quieras · descarga tus datos desde tu perfil |

Todos los detalles: [aviso de privacidad](https://syc-ai.com/privacy) · [términos](https://syc-ai.com/terms).

## SYC Node: el agente en tu dispositivo

SYC Node es un único archivo sin dependencias ([`node-agent/syc-node.mjs`](node-agent/syc-node.mjs)) incluido en las apps de Android y Windows. Este agente:

- **solo ejecuta** las CLI de IA (`claude`, `codex`, `gemini`, `cursor-agent`, `kimi`, `qwen`), instalaciones con npm de exactamente esos paquetes en `~/.syc-node/npm` y el instalador oficial de Cursor; **rechaza cualquier otro programa**;
- **solo lee y escribe dentro de `~/.syc-node`**; las rutas de fuera se rechazan;
- **descarta cualquier variable de entorno** que pudiera redirigir una CLI a otro servidor o precargar código;
- **comprueba la firma** de cada archivo de ajustes de SYC-AI que escribe, y restaura uno que se haya modificado;
- **registra cada petición** en `~/.syc-node/activity.log`;
- **solo se actualiza** con versiones firmadas por la clave de publicación de SYC.

## Seis idiomas

El panel, las apps y las respuestas de los agentes hablan **English, 中文, Español, العربية, Русский y فارسی**. Las apps siguen el idioma de tu teléfono o de Windows.

<a id="editions"></a>

## Ediciones

| Edición | Estado |
|---|---|
| **SYC-AI (Main)** | Disponible ya: **gratis hasta el 31 de diciembre de 2026**, luego 1,75 USD al mes |
| Plus · Pro · Immortal Edition | Próximamente (4, 15 y 90 USD al mes). El precio se muestra antes de elegir nada; los pagos aún no están abiertos. |

## Próximamente

Chat con Gemini, Cursor, Kimi y Qwen dentro de SYC-AI · conectores con inicio de sesión oficial (GitHub, Google Drive, Gmail, Notion, Telegram, Figma) · estudio de imagen personal · estudio de vídeos cortos · sitios y tiendas en un clic · documentos y traducción · mesa de investigación para estudiantes · taller de creación de juegos · agentes de dinero y finanzas · bots inteligentes de Telegram (solo audiencias que se apuntan) · un panel para equipos y empresas · un asistente diario en tu teléfono.

## Preguntas

**¿Es gratis?** SYC-AI (Main) es gratis hasta el 31 de diciembre de 2026; después cuesta 1,75 USD al mes. Las ediciones de pago llegarán más adelante; su precio se muestra antes de elegir y los pagos aún no están abiertos.

**¿Necesito un servidor?** No. Basta con tu teléfono Android o tu PC con Windows.

**¿Tengo que instalar antes Claude Code o Codex?** No. Ambos vienen dentro de la app de Android y de la app de Windows. Solo inicias sesión una vez, desde el panel, en tus propias cuentas de Claude y ChatGPT.

**¿Qué puedo hacer en el navegador?** El panel web muestra tu perfil, tu plan y sus mejoras, y el estado de tus dispositivos. Trabajar con Claude y Codex requiere la app de Android o de Windows, porque los agentes se ejecutan en tu dispositivo.

**¿Se os envía mi código?** Tus archivos se quedan en tu dispositivo. La conversación —tus mensajes y las respuestas de los agentes, que pueden citar partes de archivos— pasa por syc-ai.com y se guarda en tu historial de sesiones.

**¿Qué puede hacer SYC Node en mi dispositivo?** Solo iniciar las CLI de IA, instalar exactamente esas CLI con npm y leer o escribir dentro de `~/.syc-node`. Todo lo demás se rechaza y se registra. Puedes pausarlo o quitarlo cuando quieras. [Lee el código](node-agent/syc-node.mjs).

**¿SYC-AI esquiva los límites de uso de mis suscripciones?** No. Cada motor funciona con tu propia cuenta y sus propios límites. Cuando una suscripción llega a su límite, SYC-AI puede seguir el mismo trabajo con un motor *distinto* que también pagas (por ejemplo, Codex después de Claude). Nunca rota entre varias cuentas del mismo proveedor para esquivar un límite.

**¿Hay versión para iPhone, Mac o Linux?** No. SYC-AI funciona en Android y Windows. En cualquier otro dispositivo, el panel web muestra tu perfil, tu plan y tus dispositivos.

**¿SYC-AI está afiliado a Anthropic, OpenAI o Google?** No. SYC-AI es un producto independiente. Usas tus propias cuentas con cada proveedor, según sus términos. Claude, Codex, Gemini, Cursor, Kimi y Qwen son marcas de sus respectivos dueños.

## Autoalojado

Las organizaciones que quieran ejecutar todo el panel en su propio servidor pueden pedir la edición autoalojada en syc@syc-ai.com.

## Seguridad

Las versiones y las actualizaciones de SYC Node van firmadas con Ed25519; el panel verifica el tamaño y el SHA-256 antes de escribir un solo byte, aplica las actualizaciones de forma transaccional y las revierte si fallan. Las sesiones usan cookies seguras y protección CSRF; las contraseñas se cifran con scrypt; los tokens de dispositivo solo se guardan como hashes. Informa de una vulnerabilidad en privado: [SECURITY.md](SECURITY.md).

## Comunidad

Preguntas e ideas en [Discussions](https://github.com/SYCC-AI/syc-ai/discussions), errores en [Issues](https://github.com/SYCC-AI/syc-ai/issues), correo syc@syc-ai.com.

Si SYC-AI te facilita el trabajo, una ⭐ ayuda a que otras personas lo encuentren.

## Agradecimientos

El ahorro de tokens de SYC-AI se basa en trabajo de código abierto, con crédito dentro del producto allí donde se usa: el skill [Caveman](https://github.com/JuliusBrussee/caveman) de Julius Brussee (solo el skill, MIT) y los skills [Superpowers](https://github.com/obra/superpowers) de Jesse Vincent (MIT). Sus licencias se incluyen con los skills en [`skills/`](skills/).

## Licencia

Código fuente disponible (source-available) bajo la [Business Source License 1.1](LICENSE). `SYC` y `SYC-AI` son marcas de SYC. SYC-AI no está afiliado a Anthropic, OpenAI, Google, Cursor, Moonshot AI ni Alibaba.
