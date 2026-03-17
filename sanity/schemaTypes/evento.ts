import {defineField, defineType} from 'sanity'

export const eventoType = defineType({
  name: 'evento',
  title: 'Eventos',
  type: 'document',
  fields: [
    defineField({
      name: 'nombre',
      title: 'Nombre',
      type: 'string',
      validation: Rule => Rule.required().min(3).max(140),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'nombre',
        maxLength: 96,
      },
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'organizacion',
      title: 'Organización',
      type: 'reference',
      to: [{type: 'organizacion'}],
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'disciplina',
      title: 'Disciplina',
      type: 'reference',
      to: [{type: 'disciplina'}],
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'fecha',
      title: 'Fecha',
      type: 'datetime',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'ciudad',
      title: 'Ciudad',
      type: 'string',
      validation: Rule => Rule.max(100),
    }),
    defineField({
      name: 'pais',
      title: 'País',
      type: 'string',
      validation: Rule => Rule.max(100),
    }),
    defineField({
      name: 'recinto',
      title: 'Recinto',
      type: 'string',
      validation: Rule => Rule.max(140),
    }),
    defineField({
      name: 'cartelPrincipal',
      title: 'Cartel principal',
      type: 'string',
      description: 'Ejemplo: Topuria vs Holloway',
      validation: Rule => Rule.max(140),
    }),
    defineField({
      name: 'imagen',
      title: 'Imagen',
      type: 'image',
      options: {
        hotspot: true,
      },
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'estado',
      title: 'Estado',
      type: 'string',
      options: {
        list: [
          {title: 'Próximo', value: 'proximo'},
          {title: 'Celebrado', value: 'celebrado'},
          {title: 'Cancelado', value: 'cancelado'},
        ],
        layout: 'radio',
      },
      initialValue: 'proximo',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'descripcion',
      title: 'Descripción',
      type: 'text',
      rows: 5,
      description: 'Resumen editorial del evento para su página y listados.',
      validation: Rule => Rule.min(20).max(1600),
    }),
  ],
  preview: {
    select: {
      title: 'nombre',
      cartelPrincipal: 'cartelPrincipal',
      organizacion: 'organizacion.nombre',
      estado: 'estado',
      fecha: 'fecha',
      media: 'imagen',
    },
    prepare({title, cartelPrincipal, organizacion, estado, fecha, media}) {
      const fechaFormateada = fecha
        ? new Date(fecha).toLocaleDateString('es-ES')
        : 'Sin fecha'

      const subtitleParts = [
        organizacion,
        cartelPrincipal,
        estado ? `Estado: ${estado}` : null,
        fechaFormateada,
      ].filter(Boolean)

      return {
        title,
        subtitle: subtitleParts.join(' · '),
        media,
      }
    },
  },
})