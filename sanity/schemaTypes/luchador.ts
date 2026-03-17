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
      validation: Rule => Rule.max(80),
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
      validation: Rule => Rule.max(120),
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
      description: 'Categoría principal en la que compite el luchador.',
    }),
    defineField({
      name: 'record',
      title: 'Récord',
      type: 'string',
      description: 'Formato recomendado: 25-3-0',
      validation: Rule =>
        Rule.regex(/^\d{1,3}-\d{1,3}-\d{1,3}$/, {
          name: 'récord',
          invert: false,
        }).warning('Usa el formato 25-3-0'),
    }),
    defineField({
      name: 'activo',
      title: 'Activo',
      type: 'boolean',
      initialValue: true,
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'descripcion',
      title: 'Descripción',
      type: 'text',
      rows: 5,
      description: 'Resumen editorial del perfil del luchador.',
      validation: Rule => Rule.min(20).max(1200),
    }),
  ],
  preview: {
    select: {
      title: 'nombre',
      apodo: 'apodo',
      disciplina: 'disciplina.nombre',
      organizacion: 'organizacion.nombre',
      categoriaPeso: 'categoriaPeso.nombre',
      media: 'imagen',
    },
    prepare({title, apodo, disciplina, organizacion, categoriaPeso, media}) {
      const subtitleParts = [
        apodo ? `"${apodo}"` : null,
        disciplina,
        categoriaPeso,
        organizacion,
      ].filter(Boolean)

      return {
        title,
        subtitle: subtitleParts.length > 0 ? subtitleParts.join(' · ') : 'Sin datos extra',
        media,
      }
    },
  },
})