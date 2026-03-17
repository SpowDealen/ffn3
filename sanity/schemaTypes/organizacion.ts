import {defineField, defineType} from 'sanity'

export const organizacionType = defineType({
  name: 'organizacion',
  title: 'Organizaciones',
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
      name: 'logo',
      title: 'Logo',
      type: 'image',
      options: {
        hotspot: true,
      },
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'banner',
      title: 'Banner',
      type: 'image',
      options: {
        hotspot: true,
      },
      description:
        'Imagen horizontal opcional para dar presencia visual a la ficha pública de la organización.',
    }),
    defineField({
      name: 'descripcionCorta',
      title: 'Descripción corta',
      type: 'string',
      description:
        'Resumen breve para tarjetas, listados y bloques destacados.',
      validation: Rule => Rule.required().min(20).max(180),
    }),
    defineField({
      name: 'descripcion',
      title: 'Descripción',
      type: 'text',
      rows: 6,
      description:
        'Texto editorial principal sobre la organización: qué es, su relevancia y su contexto.',
      validation: Rule => Rule.required().min(60).max(1600),
    }),
    defineField({
      name: 'paisOrigen',
      title: 'País de origen',
      type: 'string',
      description: 'Ejemplo: Estados Unidos, Singapur, Japón.',
      validation: Rule => Rule.required().min(2).max(80),
    }),
    defineField({
      name: 'sede',
      title: 'Sede',
      type: 'string',
      description: 'Ciudad o ubicación principal de la organización.',
      validation: Rule => Rule.max(120),
    }),
    defineField({
      name: 'anioFundacion',
      title: 'Año de fundación',
      type: 'number',
      description: 'Ejemplo: 1993',
      validation: Rule =>
        Rule.integer().min(1900).max(new Date().getFullYear()),
    }),
    defineField({
      name: 'identidad',
      title: 'Identidad / estilo editorial',
      type: 'text',
      rows: 4,
      description:
        'Qué diferencia a esta organización: tono, propuesta, estilo competitivo, perfil de eventos, etc.',
      validation: Rule => Rule.min(20).max(800),
    }),
    defineField({
      name: 'datosCuriosos',
      title: 'Datos curiosos',
      type: 'array',
      description:
        'Puntos breves con detalles interesantes o diferenciales de la organización.',
      of: [
        defineField({
          name: 'item',
          title: 'Dato curioso',
          type: 'string',
          validation: Rule => Rule.required().min(4).max(220),
        }),
      ],
      validation: Rule => Rule.max(8).unique(),
    }),
    defineField({
      name: 'disciplinas',
      title: 'Disciplinas',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{type: 'disciplina'}],
        },
      ],
      description:
        'Disciplinas principales en las que opera la organización.',
      validation: Rule => Rule.required().min(1).unique(),
    }),
    defineField({
      name: 'sitioWeb',
      title: 'Sitio web',
      type: 'url',
      description: 'Web oficial de la organización.',
    }),
    defineField({
      name: 'activa',
      title: 'Activa',
      type: 'boolean',
      initialValue: true,
      validation: Rule => Rule.required(),
    }),
  ],
  preview: {
    select: {
      title: 'nombre',
      slug: 'slug.current',
      media: 'logo',
      activa: 'activa',
      paisOrigen: 'paisOrigen',
      descripcionCorta: 'descripcionCorta',
    },
    prepare({title, slug, media, activa, paisOrigen, descripcionCorta}) {
      const estado = activa ? 'Activa' : 'Inactiva'
      const origen = paisOrigen ? ` · ${paisOrigen}` : ''
      const resumen = descripcionCorta ? ` · ${descripcionCorta}` : ''

      return {
        title,
        subtitle: `${slug || 'sin-slug'} · ${estado}${origen}${resumen}`,
        media,
      }
    },
  },
})