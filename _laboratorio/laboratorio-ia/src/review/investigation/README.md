# Deep Investigation Engine (5F)

5F construye un expediente auditable a partir de evidencia disponible. Es independiente de Review, Outcome, Memory y Retrieval: los observa mediante snapshots y nunca los muta.

## Límites

5F investiga. 5F no decide. 5F no propone patches. 5F no aplica. 5F no publica. 5F no reanuda. 5F no usa IA externa. 5F no inicia 5G.

El modo predeterminado es `local_only`. Montar o renderizar la UI no ejecuta investigación; siempre hace falta una acción humana explícita. No existe crawling, buscador web, URL arbitraria, GROQ libre ni cliente Sanity en el navegador.

## Arquitectura

- `deep/types.ts`: contratos versionados de request, plan, evidencia, claims, conflictos, findings, suficiencia, eventos y ledger.
- `deep/planning.ts`: preguntas deterministas y política de selección de proveedores.
- `deep/providers.ts`: proveedores internos read-only y registros externos explícitamente no disponibles.
- `deep/normalization.ts`, `analysis.ts`: normalización, deduplicación, dependencia, claims, conflictos, candidatos y suficiencia puras.
- `deep/engine.ts`: orquestador abortable con dependencias inyectables y variante pura de análisis.
- `deep/persistence.ts`, `store.ts`: ledger independiente `ffn3.lab.review.investigation.v1`, historial append-only, reconciliación y export.
- `deep/InvestigationPanel.tsx`: presentación y ejecución explícita sin lógica de resolución.

## Proveedores y evidencia disponible

`local_case`, `outcomes`, `memory`, `retrieval` y `source_snapshot` leen estructuras locales ya persistidas. Outcome, Memory y Retrieval se marcan como evidencia histórica o derivada y comparten grupos de independencia cuando proceden del mismo outcome. Un snapshot solo existe cuando el productor lo conservó; nunca se inventa ni se vuelve a descargar.

`sanity_read` y `authorized_producer` están registrados como no disponibles porque aún no existe una infraestructura 5F servidor, tipada, allowlisted y auditada. No se rebaja seguridad para habilitarlos.

## Seguridad y persistencia

La validación rechaza secretos, funciones, símbolos, bigint, ciclos, `Error`, `Date`, `Map`, `Set`, clases desconocidas y payloads sobredimensionados. Los errores de proveedor se sanitizan. No se persisten HTML, documentos completos, imágenes, tokens, headers, cookies ni stack traces. La reconciliación solo marca stale y nunca reejecuta.

La suficiencia indica únicamente que una fase futura podría formular una propuesta; no constituye aprobación ni permiso para aplicar, materializar, guardar, publicar o reanudar.
