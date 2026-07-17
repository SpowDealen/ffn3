# Relevant Decision Retrieval (5E)

Retrieval evalúa si memorias 5D pueden ayudar a comprender una incidencia actual. No recomienda, decide, aplica ni copia resoluciones. Tampoco aprende reglas, usa similitud semántica, embeddings, IA, red, Sanity o productores.

La consulta se construye solo con datos presentes en `ReviewCase` y `ReviewIssue`. Los campos ausentes quedan declarados como limitaciones. 5D no conserva el cuerpo completo de la resolución histórica, por lo que 5E compara clasificación, versiones, estados y fingerprints disponibles sin reconstruir contenido.

Los candidatos proceden de índices deterministas: fingerprints disponibles y combinaciones de incidencia, entidad y decisión. El scoring separa relevancia, confianza histórica, compatibilidad, contradicción y vigencia. Mismo productor o fuente aporta como máximo una señal secundaria. Ningún score autoriza aplicación.

Memorias rechazadas se muestran como evidencia negativa contextual, nunca como regla universal. Clústeres `contested` conservan ambas posiciones y no eligen ganadora. Invalidated y obsolete se excluyen; superseded es historial no vigente; deprecated se degrada.

Los resultados y eventos se guardan separadamente en `ffn3.lab.review.retrieval.v1`. La reconciliación solo marca resultados stale; no reejecuta retrieval. La UI exige clic explícito y no alimenta al resolver autónomo. 5F y 5G quedan fuera de alcance.
