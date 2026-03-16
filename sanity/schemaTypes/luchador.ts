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
      name: 'apodo',
      title: 'Apodo',
      type: 'string',
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
    }),
    defineField({
      name: 'categoriaPeso',
      title: 'Categoría de peso',
      type: 'string',
    }),
    defineField({
      name: 'record',
      title: 'Récord',
      type: 'string',
      description: 'Ejemplo: 25-3-0',
    }),
    defineField({
      name: 'activo',
      title: 'Activo',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'descripcion',
      title: 'Descripción',
      type: 'text',
      rows: 5,
    }),
  ],
  preview: {
    select: {
      title: 'nombre',
      subtitle: 'apodo',
      media: 'imagen',
    },
  },
})