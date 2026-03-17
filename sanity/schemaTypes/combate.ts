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
      title: 'Asalto',
      type: 'number',
      validation: Rule => Rule.integer().min(1).max(15),
    }),
    defineField({
      name: 'tiempo',
      title: 'Tiempo',
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
  ],
  preview: {
    select: {
      rojo: 'luchadorRojo.nombre',
      azul: 'luchadorAzul.nombre',
      evento: 'evento.nombre',
      estado: 'estado',
      cartelera: 'cartelera',
      tituloEnJuego: 'tituloEnJuego',
    },
    prepare({rojo, azul, evento, estado, cartelera, tituloEnJuego}) {
      const extras = [
        evento,
        cartelera,
        estado ? `Estado: ${estado}` : null,
        tituloEnJuego ? 'Título en juego' : null,
      ].filter(Boolean)

      return {
        title: `${rojo || 'Sin asignar'} vs ${azul || 'Sin asignar'}`,
        subtitle: extras.length > 0 ? extras.join(' · ') : 'Sin datos extra',
      }
    },
  },
})