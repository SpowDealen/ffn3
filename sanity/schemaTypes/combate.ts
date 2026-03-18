import {defineField, defineType} from 'sanity'

export const combateType = defineType({
  name: 'combate',
  title: 'Combates',
  type: 'document',
  fields: [
    defineField({
      name: 'evento',
      title: 'Evento',
      type: 'reference',
      to: [{type: 'evento'}],
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'luchadorRojo',
      title: 'Luchador rojo',
      type: 'reference',
      to: [{type: 'luchador'}],
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'luchadorAzul',
      title: 'Luchador azul',
      type: 'reference',
      to: [{type: 'luchador'}],
      validation: Rule =>
        Rule.required().custom((value, context) => {
          const rojoRef = (context.document as {luchadorRojo?: {_ref?: string}} | undefined)
            ?.luchadorRojo?._ref

          if (!value?._ref || !rojoRef) return true
          if (value._ref === rojoRef) {
            return 'El luchador azul no puede ser el mismo que el luchador rojo.'
          }

          return true
        }),
    }),
    defineField({
      name: 'ganador',
      title: 'Ganador',
      type: 'reference',
      to: [{type: 'luchador'}],
      description: 'Déjalo vacío si el combate aún no ha finalizado.',
      validation: Rule =>
        Rule.custom((value, context) => {
          const doc = context.document as
            | {
                estado?: string
                luchadorRojo?: {_ref?: string}
                luchadorAzul?: {_ref?: string}
              }
            | undefined

          if (!doc) return true

          if (doc.estado === 'finalizado' && !value?._ref) {
            return 'Si el combate está finalizado, debes indicar un ganador.'
          }

          if (!value?._ref) return true

          const rojoRef = doc.luchadorRojo?._ref
          const azulRef = doc.luchadorAzul?._ref

          if (value._ref !== rojoRef && value._ref !== azulRef) {
            return 'El ganador debe ser uno de los dos luchadores del combate.'
          }

          return true
        }),
    }),
    defineField({
      name: 'metodo',
      title: 'Método',
      type: 'string',
      description: 'Ejemplo: KO, TKO, Sumisión, Decisión unánime',
      validation: Rule => Rule.max(120),
    }),
    defineField({
      name: 'asalto',
      title: 'Asalto final',
      type: 'number',
      validation: Rule => Rule.integer().min(1).max(15),
    }),
    defineField({
      name: 'tiempo',
      title: 'Tiempo final',
      type: 'string',
      description: 'Ejemplo: 3:42',
      validation: Rule =>
        Rule.regex(/^\d{1,2}:\d{2}$/, {
          name: 'tiempo',
          invert: false,
        }).warning('Usa el formato 3:42'),
    }),
    defineField({
      name: 'categoriaPeso',
      title: 'Categoría de peso',
      type: 'reference',
      to: [{type: 'categoriaPeso'}],
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'tituloEnJuego',
      title: 'Título en juego',
      type: 'boolean',
      initialValue: false,
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'cartelera',
      title: 'Cartelera',
      type: 'string',
      options: {
        list: [
          {title: 'Preliminar', value: 'preliminar'},
          {title: 'Principal', value: 'principal'},
        ],
        layout: 'radio',
      },
      initialValue: 'principal',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'orden',
      title: 'Orden en el evento',
      type: 'number',
      description: '1 = combate principal, 2 = coestelar, etc.',
      validation: Rule =>
        Rule.integer().min(1).warning('Usa 1, 2, 3... según el orden del combate'),
    }),
    defineField({
      name: 'estado',
      title: 'Estado',
      type: 'string',
      options: {
        list: [
          {title: 'Programado', value: 'programado'},
          {title: 'Finalizado', value: 'finalizado'},
          {title: 'Cancelado', value: 'cancelado'},
        ],
        layout: 'radio',
      },
      initialValue: 'programado',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'resumen',
      title: 'Resumen del combate',
      type: 'text',
      rows: 3,
      description:
        'Resumen breve de lo ocurrido en el combate. Ideal para la ficha pública y bloques relacionados.',
      validation: Rule => Rule.max(400),
    }),
    defineField({
      name: 'desarrollo',
      title: 'Desarrollo del combate',
      type: 'text',
      rows: 8,
      description:
        'Explica cómo se desenvolvió el combate: ritmo, dominio, momentos clave, cambios de guion y desenlace.',
      validation: Rule => Rule.max(3000),
    }),
    defineField({
      name: 'momentoClave',
      title: 'Momento clave',
      type: 'text',
      rows: 3,
      description:
        'Golpe, derribo, sumisión, corte, cuenta o instante decisivo que cambió el combate.',
      validation: Rule => Rule.max(500),
    }),
    defineField({
      name: 'consecuencia',
      title: 'Consecuencia del resultado',
      type: 'text',
      rows: 3,
      description:
        'Qué implica este resultado: defensa titular, ascenso en el ranking, revancha, polémica, oportunidad futura, etc.',
      validation: Rule => Rule.max(700),
    }),
  ],
  preview: {
    select: {
      rojo: 'luchadorRojo.nombre',
      azul: 'luchadorAzul.nombre',
      evento: 'evento.nombre',
      estado: 'estado',
      cartelera: 'cartelera',
      tituloEnJuego: 'tituloEnJuego',
      metodo: 'metodo',
      asalto: 'asalto',
    },
    prepare({rojo, azul, evento, estado, cartelera, tituloEnJuego, metodo, asalto}) {
      const extras = [
        evento,
        cartelera,
        estado ? `Estado: ${estado}` : null,
        metodo ? `Método: ${metodo}` : null,
        asalto ? `R${asalto}` : null,
        tituloEnJuego ? 'Título en juego' : null,
      ].filter(Boolean)

      return {
        title: `${rojo || 'Sin asignar'} vs ${azul || 'Sin asignar'}`,
        subtitle: extras.length > 0 ? extras.join(' · ') : 'Sin datos extra',
      }
    },
  },
})