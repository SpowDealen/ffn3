# Agente Editorial Autónomo: arquitectura del kernel

## Decisión

El agente se construye como un kernel basado en capacidades. El kernel no conoce luchadores, noticias, Sanity, React ni productores. Conoce objetivos, hechos, resultados requeridos, capacidades declarativas, políticas de efectos y artefactos auditables.

Una capacidad reside en memoria y contiene una función. Su manifiesto es estable y declara qué resultados aporta, qué precondiciones necesita, qué efectos puede causar, su riesgo, timeout, prioridad y límite de ejecuciones. Los planes y resultados nunca persisten funciones.

## Flujo

1. Un adaptador traduce una incidencia o proceso a un `EditorialAgentGoal`.
2. El planificador resuelve el grafo de resultados requeridos usando `provides` y `requires`.
3. La política autoriza o bloquea cada capacidad por riesgo y efectos declarados.
4. El ejecutor comprueba precondiciones, límites y timeout.
5. Cada resultado se valida como JSON, se inspecciona contra claves sensibles y exige un resumen explicable.
6. Los hechos alimentan pasos posteriores y los artefactos forman el ledger de la ejecución.
7. Si falta una capacidad, el resultado es `needs_capability`; no se disfraza como falta genérica de evidencia.

El agente ejecuta los subplanes resolubles aunque falten otras capacidades. Así conserva evidencia útil y declara con precisión qué contrato falta para continuar.

## Fronteras auditadas

- `review/autonomous`: resolución pura y síncrona a partir de evidencia persistida.
- `review/investigation`: adquisición e interpretación async del piloto 4D1.
- `review/resume/externalNews`: preview y ejecución específicas del productor, con fingerprint e idempotencia.
- `review/store`: persistencia local, estados, versiones y resoluciones.
- `builders`: validación y construcción por schema, hoy seleccionada con un switch por tipo editorial.
- `PanelIA`: composition root actual; carga referencias y concentra productores y llamadas API.
- `lib/saveDraft` y `lib/sanity`: frontera explícita de escritura de borradores.
- `sources` y rutas API: adquisición y resolución heterogéneas por productor.
- `notifications/NIE`: sistema independiente con normalización, política, auditoría y canales.
- `processes`: progreso UI efímero; no es un workflow durable.

## Regla de efectos

La política por defecto solo autoriza `read_local` y `read_external`, con riesgo máximo `low`. Crear o actualizar entidades, guardar borradores, publicar, reanudar, notificar o escribir en Review requiere que el invocador amplíe expresamente la política. Declarar un efecto no concede permiso para ejecutarlo.

## Extensión futura

Las futuras capacidades —duplicados, imágenes, relaciones, metadatos, creación, validación, preview y reanudación— se añaden como adapters registrados. El planificador no cambia: conecta resultados por contrato. Los efectos reales permanecen fuera del kernel y deben ofrecer idempotencia, preview, validación y compensación cuando corresponda.

Los adapters async deben respetar `AbortSignal`; JavaScript no puede cancelar por la fuerza una promesa que ignore la señal. Por eso los efectos de escritura están denegados por defecto y toda futura capacidad mutante deberá ser idempotente.
