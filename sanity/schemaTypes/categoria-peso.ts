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
      validation: Rule => Rule.required(),
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
    }),
    defineField({
      name: 'unidad',
      title: 'Unidad',
      type: 'string',
      options: {
        list: [
          {title: 'lb', value: 'lb'},
          {title: 'kg', value: 'kg'},
        ],
        layout: 'radio',
      },
      initialValue: 'lb',
    }),
    defineField({
      name: 'descripcion',
      title: 'Descripción',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'activa',
      title: 'Activa',
      type: 'boolean',
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      title: 'nombre',
      disciplina: 'disciplina.nombre',
      limitePeso: 'limitePeso',
      unidad: 'unidad',
    },
    prepare({title, disciplina, limitePeso, unidad}) {
      return {
        title,
        subtitle: `${disciplina || 'Sin disciplina'}${limitePeso ? ` · ${limitePeso} ${unidad}` : ''}`,
      }
    },
  },
})