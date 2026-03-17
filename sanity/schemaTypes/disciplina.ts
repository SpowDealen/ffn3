import {defineField, defineType} from 'sanity'

export const disciplinaType = defineType({
  name: 'disciplina',
  title: 'Disciplinas',
  type: 'document',
  fields: [
    defineField({
      name: 'nombre',
      title: 'Nombre',
      type: 'string',
      validation: Rule => Rule.required().min(2).max(100),
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
      name: 'descripcion',
      title: 'Descripción',
      type: 'text',
      rows: 4,
      description: 'Resumen editorial breve de la disciplina.',
      validation: Rule => Rule.min(10).max(800),
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
      subtitle: 'slug.current',
      activa: 'activa',
    },
    prepare({title, subtitle, activa}) {
      return {
        title,
        subtitle: `${subtitle || 'sin-slug'} · ${activa ? 'Activa' : 'Inactiva'}`,
      }
    },
  },
})