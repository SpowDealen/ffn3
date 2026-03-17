import {defineField, defineType} from 'sanity'

export const categoriaPesoType = defineType({
  name: 'categoriaPeso',
  title: 'Categorías de peso',
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
      name: 'disciplina',
      title: 'Disciplina',
      type: 'reference',
      to: [{type: 'disciplina'}],
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'limitePeso',
      title: 'Límite de peso',
      type: 'number',
      description: 'Ejemplo: 145',
      validation: Rule => Rule.required().positive(),
    }),
    defineField({
      name: 'unidad',
      title: 'Unidad',
      type: 'string',
      initialValue: 'lb',
      options: {
        list: [
          {title: 'Libras (lb)', value: 'lb'},
          {title: 'Kilogramos (kg)', value: 'kg'},
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'descripcion',
      title: 'Descripción',
      type: 'text',
      rows: 4,
      description: 'Resumen editorial breve de la categoría de peso.',
      validation: Rule => Rule.min(10).max(500),
    }),
  ],
  preview: {
    select: {
      title: 'nombre',
      subtitle: 'disciplina.nombre',
      limitePeso: 'limitePeso',
      unidad: 'unidad',
    },
    prepare({title, subtitle, limitePeso, unidad}) {
      const peso =
        limitePeso && unidad ? ` · ${limitePeso}${unidad}` : ''

      return {
        title,
        subtitle: `${subtitle || 'Sin disciplina'}${peso}`,
      }
    },
  },
})