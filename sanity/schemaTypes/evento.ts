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
      name: 'horaLocal',
      title: 'Hora local',
      type: 'string',
      description: 'Ejemplo: 22:00 o 04:00 (hora peninsular española)',
      validation: Rule => Rule.max(60),
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
      name: 'dondeVer',
      title: 'Dónde ver',
      type: 'string',
      description: 'Ejemplo: ESPN+, DAZN, UFC Fight Pass, Eurosport, TV en abierto...',
      validation: Rule => Rule.max(180),
    }),
    defineField({
      name: 'descripcionCorta',
      title: 'Descripción corta',
      type: 'text',
      rows: 3,
      description: 'Resumen breve para tarjetas, listados y cabeceras.',
      validation: Rule => Rule.max(280),
    }),
    defineField({
      name: 'descripcion',
      title: 'Descripción editorial',
      type: 'text',
      rows: 8,
      description:
        'Texto principal del evento: contexto, interés del show, protagonistas, cartelera y lectura editorial.',
      validation: Rule => Rule.min(20).max(3000),
    }),
    defineField({
      name: 'notas',
      title: 'Notas adicionales',
      type: 'text',
      rows: 4,
      description:
        'Campo opcional para detalles extra: cambios de última hora, contexto histórico, particularidades del evento, etc.',
      validation: Rule => Rule.max(1200),
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
  ],
  preview: {
    select: {
      title: 'nombre',
      cartelPrincipal: 'cartelPrincipal',
      organizacion: 'organizacion.nombre',
      estado: 'estado',
      fecha: 'fecha',
      ciudad: 'ciudad',
      pais: 'pais',
      media: 'imagen',
    },
    prepare({title, cartelPrincipal, organizacion, estado, fecha, ciudad, pais, media}) {
      const fechaFormateada = fecha
        ? new Date(fecha).toLocaleDateString('es-ES')
        : 'Sin fecha'

      const ubicacion = [ciudad, pais].filter(Boolean).join(', ')

      const subtitleParts = [
        organizacion,
        cartelPrincipal,
        ubicacion,
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