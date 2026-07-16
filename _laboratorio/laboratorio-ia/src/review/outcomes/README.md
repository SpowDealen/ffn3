# Outcome and Feedback Engine

Un outcome es el registro persistente del resultado observado de una decisión real del Centro de revisión. No es una propuesta, una simulación, una entidad preparada ni una regla aprendida.

El dominio separa un `DecisionOutcomeRecord`, que funciona como snapshot actual, de sus `DecisionOutcomeEvent` append-only. Los eventos nunca se editan: una corrección, un fallo, una reconciliación o una supersession añade un evento nuevo y recalcula el snapshot.

## Cuatro dimensiones

- **Técnica:** confirma exclusivamente ejecución, respuesta, IDs y persistencia.
- **Estructural:** valida tipos, requisitos, referencias e invariantes conocidas.
- **Editorial:** requiere confirmación o rechazo explícito; nunca se deriva de `saveDraft`.
- **Operativa:** indica si la reanudación o proceso terminó, sin afirmar corrección editorial.

El lifecycle general progresa entre `pending`, éxitos parciales, confirmaciones y los estados terminales `failed`, `rejected` o `superseded`. Un outcome reemplazado conserva todos sus eventos y apunta a su sucesor.

## Fingerprints y correlación

Los fingerprints usan canonicalización con claves ordenadas, excluyen timestamps e IDs volátiles e incluyen una versión de algoritmo. La correlación prioriza IDs reales y referencias explícitas; un fingerprint solo es suficiente cuando produce una coincidencia inequívoca. Los títulos o textos similares nunca fusionan outcomes.

## Reconciliación

La reconciliación inspecciona exclusivamente el ledger local. Detecta operaciones iniciadas sin evento terminal, referencias inconsistentes y eventos ausentes. No repite materialización, resume, builder, `saveDraft` ni ninguna operación externa, y nunca inventa un éxito.

## Persistencia y migración conservadora

El ledger usa una clave independiente de `ReviewCase`, por lo que puede sobrevivir a su TTL o purga. Los datos corruptos se descartan de forma segura. Los casos existentes solo se importan bajo acción explícita desde resoluciones reales; se conservan como `pending`, con provenance `legacy_import`, sin inferir éxito editorial.

## Límites de 5C

Esta fase no recupera decisiones similares, no reutiliza outcomes, no genera reglas, no aprende, no automatiza materialización o reanudación y no modifica documentos ni schemas. Únicamente prepara evidencia fiable para una futura Fase 5D.
