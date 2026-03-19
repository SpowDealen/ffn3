# Panel IA FFN3 · Plan aterrizado a schemas reales de Sanity

## Estado actual

El laboratorio IA de FFN3 debe dejar de trabajar con aproximaciones editoriales genéricas y pasar a funcionar con correspondencia real contra los schemas actuales de Sanity.

Este documento redefine la base del laboratorio para que todo el sistema se apoye en los tipos reales del proyecto y no en nombres inventados o estructuras abstractas.

La idea no es limitar la IA, sino ordenar bien dos capas distintas:

1. **Inputs auxiliares del panel IA**
   - Sirven para dar contexto, enfoque, tono o intención al generador.
   - No tienen por qué existir como campos en Sanity.
   - Son útiles para generar mejor.

2. **Output real para Sanity**
   - Debe respetar exactamente los campos reales del schema.
   - No debe inventar propiedades finales que no existan.
   - Es la base del guardado real futuro.

---

## Tipos reales a soportar

Los content types reales confirmados para esta fase son:

- `noticia`
- `evento`
- `luchador`
- `combate`
- `categoriaPeso`
- `disciplina`

Además, hay un tipo relacionado imprescindible porque aparece como referencia directa en varios documentos:

- `organizacion`

Aunque el foco del panel siga siendo los 6 tipos principales, el laboratorio debe contemplar a `organizacion` como entidad de soporte para relaciones y selección de referencias.

---

## Principio operativo del laboratorio

El panel IA no debe generar directamente “documentos libres”.

Debe trabajar con este flujo conceptual:

1. El editor elige un tipo de contenido real.
2. El panel muestra:
   - inputs auxiliares IA
   - campos reales esperados por Sanity
3. El sistema genera un borrador estructurado.
4. El borrador se divide en dos capas:
   - **vista editorial humana**
   - **payload normalizado para Sanity**
5. Más adelante, cuando se conecte guardado real, el sistema solo deberá persistir el payload compatible con Sanity.

---

## Contrato general por tipo

---

# 1) `noticia`

## Schema real confirmado

Campos reales:

- `titulo` → `string` → requerido
- `slug` → `slug` → requerido
- `imagenPrincipal` → `image` → requerido
- `extracto` → `text` → requerido
- `contenido` → `array` de bloques → requerido
- `fechaPublicacion` → `datetime` → requerido
- `disciplina` → `reference` a `disciplina` → requerido
- `organizacionRelacionada` → `reference` a `organizacion` → opcional
- `luchadoresRelacionados` → `array` de `reference` a `luchador` → opcional
- `eventoRelacionado` → `reference` a `evento` → opcional
- `destacada` → `boolean` → requerido

## Restricciones reales relevantes

- `titulo`: min 8, max 160
- `extracto`: min 20, max 220
- `contenido`: mínimo 1 bloque
- `fechaPublicacion`: obligatoria
- `disciplina`: obligatoria
- `imagenPrincipal`: obligatoria
- `destacada`: obligatoria
- `luchadoresRelacionados`: unique

## Input IA auxiliar recomendado

Estos campos pueden existir en el panel para ayudar a generar, pero no forman parte del schema final:

- `anguloEditorial`
- `hechoPrincipal`
- `contextoPrevio`
- `tono`
- `seoObjetivo`
- `protagonistasTexto`
- `instruccionesRedaccion`

## Output real Sanity esperado

```ts
type NoticiaSanityOutput = {
  titulo: string
  slug: { current: string }
  imagenPrincipal: unknown
  extracto: string
  contenido: Array<unknown>
  fechaPublicacion: string
  disciplina: { _type: 'reference'; _ref: string }
  organizacionRelacionada?: { _type: 'reference'; _ref: string }
  luchadoresRelacionados?: Array<{ _type: 'reference'; _ref: string }>
  eventoRelacionado?: { _type: 'reference'; _ref: string }
  destacada: boolean
}