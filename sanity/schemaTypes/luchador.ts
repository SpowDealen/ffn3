import {defineField, defineType} from 'sanity'

export const luchadorType = defineType({
  name: 'luchador',
  title: 'Luchadores',
  type: 'document',
  fields: [
    defineField({
      name: 'nombre',
      title: 'Nombre',
      type: 'string',
      validation: Rule => Rule.required().min(2).max(120),
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
      name: 'apodo',
      title: 'Apodo',
      type: 'string',
      validation: Rule => Rule.max(120),
    }),
    defineField({
      name: 'imagen',
      title: 'Imagen',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'nacionalidad',
      title: 'Nacionalidad',
      type: 'string',
      validation: Rule => Rule.max(80),
    }),
    defineField({
      name: 'record',
      title: 'Récord',
      type: 'string',
      description: 'Ejemplo: 27-3-0',
      validation: Rule => Rule.max(40),
    }),
    defineField({
      name: 'disciplina',
      title: 'Disciplina',
      type: 'reference',
      to: [{type: 'disciplina'}],
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
      name: 'categoriaPeso',
      title: 'Categoría de peso',
      type: 'reference',
      to: [{type: 'categoriaPeso'}],
    }),
    defineField({
      name: 'activo',
      title: 'Activo',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'rankingDisciplina',
      title: 'Ranking editorial en disciplina',
      type: 'number',
      description:
        'Control manual para el top/ranking dentro de su disciplina. Ejemplo: 1, 2, 3...',
      validation: Rule => Rule.min(1).max(999),
    }),
    defineField({
      name: 'destacadoHome',
      title: 'Destacado en inicio',
      type: 'boolean',
      initialValue: false,
      description:
        'Activa este campo si quieres que el luchador pueda aparecer en la sección de luchadores destacados de la home.',
    }),
    defineField({
      name: 'ordenDestacadoHome',
      title: 'Orden en luchadores destacados de inicio',
      type: 'number',
      description:
        'Control manual del orden en la home. Ejemplo: 1, 2, 3, 4...',
      hidden: ({document}) => !document?.destacadoHome,
      validation: Rule =>
        Rule.custom((value, context) => {
          const destacado = Boolean(
            (context.document as {destacadoHome?: boolean} | undefined)?.destacadoHome
          )

          if (destacado && (value === undefined || value === null)) {
            return 'Si el luchador está destacado en inicio, debes indicar su orden.'
          }

          if (value !== undefined && value !== null && value < 1) {
            return 'El orden debe ser mayor que 0.'
          }

          return true
        }),
    }),
    defineField({
      name: 'descripcion',
      title: 'Descripción',
      type: 'text',
      rows: 5,
      validation: Rule => Rule.max(2000),
    }),
  ],
  preview: {
    select: {
      title: 'nombre',
      subtitle: 'organizacion.nombre',
      media: 'imagen',
      destacadoHome: 'destacadoHome',
      ordenDestacadoHome: 'ordenDestacadoHome',
    },
    prepare(selection) {
      const {title, subtitle, media, destacadoHome, ordenDestacadoHome} = selection as {
        title?: string
        subtitle?: string
        media?: any
        destacadoHome?: boolean
        ordenDestacadoHome?: number
      }

      const homeText = destacadoHome
        ? ` · Home #${ordenDestacadoHome ?? 'sin orden'}`
        : ''

      return {
        title: title || 'Luchador sin nombre',
        subtitle: `${subtitle || 'Sin organización'}${homeText}`,
        media,
      }
    },
  },
})