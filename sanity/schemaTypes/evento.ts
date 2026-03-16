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
    }),
    defineField({
      name: 'pais',
      title: 'País',
      type: 'string',
    }),
    defineField({
      name: 'recinto',
      title: 'Recinto',
      type: 'string',
    }),
    defineField({
      name: 'cartelPrincipal',
      title: 'Cartel principal',
      type: 'string',
      description: 'Ejemplo: Topuria vs Holloway',
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
    }),
  ],
  preview: {
    select: {
      title: 'nombre',
      subtitle: 'cartelPrincipal',
      media: 'imagen',
    },
  },
})