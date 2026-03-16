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
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'ganador',
      title: 'Ganador',
      type: 'reference',
      to: [{type: 'luchador'}],
    }),
    defineField({
      name: 'metodo',
      title: 'Método',
      type: 'string',
      description: 'Ejemplo: KO, TKO, Sumisión, Decisión unánime',
    }),
    defineField({
      name: 'asalto',
      title: 'Asalto',
      type: 'number',
    }),
    defineField({
      name: 'tiempo',
      title: 'Tiempo',
      type: 'string',
      description: 'Ejemplo: 3:42',
    }),
    defineField({
      name: 'categoriaPeso',
      title: 'Categoría de peso',
      type: 'string',
    }),
    defineField({
      name: 'tituloEnJuego',
      title: 'Título en juego',
      type: 'boolean',
      initialValue: false,
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
    }),
    defineField({
      name: 'orden',
      title: 'Orden en el evento',
      type: 'number',
      description: '1 = combate principal, 2 = coestelar, etc.',
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
    },
    prepare({rojo, azul, evento}) {
      return {
        title: `${rojo || 'Sin asignar'} vs ${azul || 'Sin asignar'}`,
        subtitle: evento || 'Sin evento',
      }
    },
  },
})