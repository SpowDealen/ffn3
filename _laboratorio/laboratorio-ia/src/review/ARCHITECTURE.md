# Arquitectura resolutiva del Centro de Revisión

## Experiencia operativa

Desde AU10 B1, `Núcleo Resolutivo IA` es la entrada visual única a la cadena
AU2–AU9. Los módulos siguen desacoplados y conservan sus autoridades. La fachada
AU10 sólo deriva presentación, estado principal, CTA, completion y timeline.

La auditoría previa está en `nucleus/AUDIT.md` y el contrato completo en
`nucleus/ARCHITECTURE.md`.

## Fronteras estables

- AU3 persiste el caso y checkpoints.
- AU5 decide identidad.
- AU6 planifica resolución y protege creación.
- AU7 ejecuta efectos autorizados.
- AU8 decide y supervisa.
- AU9 aporta experiencia histórica gobernada.
- AU10 no sustituye ninguna autoridad ni añade persistencia.

Los paneles especializados se mantienen como detalle progresivo. Sólo una
sección se monta a la vez para evitar CTAs simultáneos y reducir coste de render.

AU10 B2 formaliza estas secciones como `OperationalWorkspaceViewModel`. El
workspace mantiene seis zonas, una navegación contextual y lazy loading real de
los paneles técnicos, sin introducir persistencia ni otra autoridad.

AU10 B3 añade una proyección transversal derivada del snapshot AU3. El grafo no
se persiste, sólo relaciona evidencia explícita y vigente, y genera ranking,
grupos y recomendaciones advisory-only. La sección “Inteligencia transversal”
es compacta, no añade CTA y nunca fusiona ni ejecuta casos.

AU10 B4 eleva esa composición a una vista global del laboratorio. El dashboard
deriva resumen, salud, actividad, cuellos de botella, ranking, filtros, timeline,
cross-case y knowledge sin guardar una segunda verdad. Sus detalles pesados se
cargan bajo demanda y AU7 continúa siendo la única vía de efectos.
