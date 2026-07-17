# Decision Memory Foundation (5D)

Este dominio local y append-only conserva experiencia editorial derivada exclusivamente de outcomes 5C confirmados, rechazados o posteriormente superseded. La memoria es un observador secundario: un fallo suyo nunca revierte ni bloquea el outcome.

## Contrato y límites

- Persistencia independiente: `ffn3.lab.review.memory.v1`.
- Sin red, Sanity, `fetch`, materialización, `resume`, `saveDraft` ni escritura documental.
- La importación histórica es explícita; montar el panel no crea memorias.
- Una memoria rechazada tiene `reusePolicy: never`. Una confirmada empieza en `manual_only`.
- 5D no recomienda ni aplica decisiones. Los selectores solo exponen candidatos inspeccionables.
- 5C conserva fingerprints y metadatos de decisión, no el patch completo. 5D no reconstruye ni inventa contenido ausente.

## Identidad, clústeres y confianza

`memoryFingerprint` incluye patrón, decisión editorial y evidencia. `clusterFingerprint` excluye confirmación/rechazo para que experiencias equivalentes y contradictorias compartan grupo. Un clúster cuenta casos y fuentes distintas; duplicados del mismo caso no aumentan evidencia independiente.

Confianza individual confirmada: 30 puntos por confirmación humana, +10 estructural, +8 técnica y +7 operativa, con techo 55. Un rechazo conserva confianza 0. En clúster: base 35, +15 por caso independiente adicional y +8 por fuente adicional, techo 80. Una contradicción limita a 25 y marca `contested`.

## Compatibilidad y ciclo de vida

La compatibilidad registra versiones de Outcome, Review y engine. Estados: `active`, `invalidated`, `deprecated`, `obsolete`, `superseded`. Restaurar requiere acción humana explícita y no se permite para superseded. Toda transición exige motivo, actor e idempotency key.

La reconciliación compara únicamente ledgers locales y no modifica outcomes. Los clústeres se reconstruyen determinísticamente de snapshots activos y registran cambios de membresía.
