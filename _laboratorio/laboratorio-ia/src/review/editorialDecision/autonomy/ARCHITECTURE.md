# AU8 B3 — Autonomy & Risk Policy Engine

## Auditoría y autoridad

`evaluateAutonomyRiskPolicy` gobierna hasta dónde puede avanzar el Centro con
una decisión B1 que ya atravesó Evidence Sufficiency B2. Es una policy de
permiso, no otra medida de confianza ni un executor.

La auditoría encontró y reutiliza:

- los niveles `low`, `medium`, `high`, `destructive` de AU7;
- `read_only`, `pure_transform`, `external_effect` de cada step AU7;
- authorization `none`, `explicit`, `human_required` de AU7;
- compensación `none`, `logical_only`, `reversible_transform`,
  `explicit_compensator`, `manual_required` y sus decisiones Saga;
- ownership AU7 y sus estados `pre_existing`, `transaction_created`,
  `transaction_transformed`, `shared`, `unknown`;
- reconciliación AU4/AU7 e incidencias operacionales;
- Creation Guard y decisiones ready de AU6;
- identidad AU5;
- catálogo universal y manifests versionados de productores.

No se crea otro risk engine, authorization runtime, compensation engine o
reconciliation engine. B3 sólo consume sus proyecciones seguras.

El riesgo principal de duplicación estaba en volver a inferir políticas por
nombre de productor. Se evita mediante `ProducerAutonomyPolicy`, una declaración
opcional dentro del manifest existente. Si falta, B3 aplica fail-closed.

## Niveles

- `autonomous_safe`: evidencia suficiente, read-only o transformación pura
  reversible, riesgo bajo, capability permitida y sin auth/incidencias.
- `autonomous_supervised`: riesgo bajo/medio dentro del manifest, checkpoints y
  límites conocidos, pero requiere supervisión o reevaluación entre steps.
- `authorization_required`: la decisión es válida pero AU7, capability o
  manifest exigen aprobación efímera.
- `human_required`: riesgo high/destructive/unknown, compensación manual,
  ownership desconocido, conflicto de identidad o policy.
- `blocked`: B2 no suficiente, staleness, capability/policy desconocida o
  prohibida, Creation Guard ausente o reconciliación pendiente.

`canExecuteAutonomously` sólo es verdadero para `autonomous_safe`. B3 nunca
ejecuta aun cuando el campo sea verdadero; expresa permiso para una capa futura.

## Matriz declarativa

La evaluación combina:

1. decisión B1;
2. clasificación/fingerprint B2;
3. capability y operation kind;
4. mode, riesgo máximo y reversibilidad AU7;
5. authorization/reconciliation/compensation/ownership AU7;
6. Creation Guard y resolución AU6;
7. identidad AU5;
8. manifest de capability;
9. `ProducerAutonomyPolicy`.

No existe `if (producer === ...)`. Los manifests pueden declarar:

- `maximumAutonomousRisk`;
- `allowedAutonomousCapabilities`;
- `supervisedCapabilities`;
- `requiresAuthorizationCapabilities`;
- `forbiddenAutonomousCapabilities`.

Las listas se normalizan y fingerprintan. La validación rechaza capabilities no
declaradas y límites incompatibles.

## Riesgo y agregación

El riesgo agregado es el máximo; nunca se promedia. Un solo step `high` o
`destructive` domina el conjunto. También se proyectan efectos externos,
reversibilidad e incertidumbre. Riesgo ausente produce `unknown` y revisión
humana.

La confidence de B1/B2 no interviene en esta agregación. Confianza alta no
convierte una acción peligrosa en autónoma.

## Decisiones y guards

- investigar/validar read-only low pueden ser `autonomous_safe`;
- reuse exige B2 sufficient e identidad sin ambigüedad;
- create exige simultáneamente `create_new`, decisión AU6 `create` ready,
  Creation Guard y policy de capability/productor; el guard es necesario pero
  no suficiente;
- repair pure y reversible puede ser safe/supervised según manifest;
- external patch/resume respetan authorization AU7;
- block/wait/reconciliation no son ejecutables;
- compensation usa el plan Saga AU7 y nunca asume autonomía.

## Autorización y revisión humana

El descriptor de autorización sólo contiene policy, operation IDs,
capabilities y fingerprints B1/B2. Es efímero y declara explícitamente que no
persiste approval ni token.

Las razones humanas tipadas incluyen contradicción, riesgo alto/destructivo,
ambigüedad, capability no soportada, compensación manual, conflicto de policy,
ownership desconocido, autoridad insuficiente y riesgo desconocido.

## Reconciliación y compensación

Un efecto incierto o reconciliación pendiente bloquea. Evaluaciones AU4
`confirmed_succeeded`, `confirmed_not_applied` o `already_reconciled` permiten
reevaluar.

Una compensación manual permanece humana. Un compensator seguro y explícito
puede llegar como máximo a `authorization_required`. Ownership `unknown` impide
compensación autónoma.

## Staleness y determinismo

`AutonomyExpectedContext` puede vincular fingerprints de decisión, suficiencia,
riesgo agregado, capability manifests, producer manifest, Creation Guards y
reconciliación. Cualquier cambio marca el resultado stale y bloqueado.

El fingerprint de policy excluye timestamps externos y ordena operaciones,
manifests y reason codes. Ruido de orden no cambia el resultado; cualquier
cambio semántico vinculado sí lo cambia.

## Fachada y seguridad

`evaluateAutonomousEditorialGovernance` expresa:

```text
Decision Engine B1 (con gate B2)
→ Sufficiency descriptor
→ Autonomy B3
```

La fachada es pura y no introduce dependencias circulares. No usa executor,
Transaction execution, Sanity, fetch, localStorage, APIs externas ni writes.

## Integración con B4 y límites

B3 no representa autorizaciones vivas ni las valida; AU7 conserva esa autoridad.
Tampoco prioriza casos, persiste historial o ejecuta planes. AU8 B4 consume este
resultado para construir una estrategia topológica con el grafo AU2. La
memoria, UI y recuperación de inteligencia siguen pendientes para B5.
