import {defineField, defineType} from 'sanity'

export const noticiaType = defineType({
  name: 'noticia',
  title: 'Noticias',
  type: 'document',
  fields: [
    defineField({
      name: 'titulo',
      title: 'Título',
      type: 'string',
      validation: Rule => Rule.required().min(8).max(160),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'titulo',
        maxLength: 96,
      },
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'imagenPrincipal',
      title: 'Imagen principal',
      type: 'image',
      options: {
        hotspot: true,
      },
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'extracto',
      title: 'Extracto',
      type: 'text',
      rows: 3,
      description: 'Resumen corto para listados, tarjetas y SEO editorial.',
      validation: Rule => Rule.required().min(20).max(220),
    }),
    defineField({
      name: 'contenido',
      title: 'Contenido',
      type: 'array',
      of: [{type: 'block'}],
      description: 'Cuerpo principal de la noticia en formato editorial.',
      validation: Rule =>
        Rule.required().min(1).error('La noticia debe tener contenido.'),
    }),
    defineField({
      name: 'fechaPublicacion',
      title: 'Fecha de publicación',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
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
      name: 'organizacionRelacionada',
      title: 'Organización relacionada',
      type: 'reference',
      to: [{type: 'organizacion'}],
      description: 'Organización principal vinculada a la noticia, si aplica.',
    }),
    defineField({
      name: 'luchadoresRelacionados',
      title: 'Luchadores relacionados',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{type: 'luchador'}],
        },
      ],
      description: 'Luchadores protagonistas o mencionados de forma relevante.',
      validation: Rule => Rule.unique(),
    }),
    defineField({
      name: 'eventoRelacionado',
      title: 'Evento relacionado',
      type: 'reference',
      to: [{type: 'evento'}],
      description: 'Evento principal asociado a la noticia, si existe.',
    }),
    defineField({
      name: 'destacada',
      title: 'Destacada',
      type: 'boolean',
      initialValue: false,
      validation: Rule => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'titulo',
      extracto: 'extracto',
      disciplina: 'disciplina.nombre',
      destacada: 'destacada',
      media: 'imagenPrincipal',
    },
    prepare({title, extracto, disciplina, destacada, media}) {
      const prefix = destacada ? '★ ' : ''
      const subtitleParts = [disciplina, extracto].filter(Boolean)

      return {
        title: `${prefix}${title}`,
        subtitle:
          subtitleParts.length > 0
            ? subtitleParts.join(' · ')
            : 'Sin extracto',
        media,
      }
    },
  },
})