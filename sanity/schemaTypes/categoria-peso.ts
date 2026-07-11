import {defineField, defineType} from 'sanity'

export const categoriaPesoType = defineType({
  name: 'categoriaPeso',
  title: 'Categorías de peso',
  type: 'document',
  fields: [
    defineField({name:'nombre',title:'Nombre',type:'string',validation:Rule=>Rule.required().min(2).max(160)}),
    defineField({name:'slug',title:'Slug',type:'slug',options:{source:'nombre',maxLength:96},validation:Rule=>Rule.required()}),
    defineField({name:'disciplina',title:'Disciplina',type:'reference',to:[{type:'disciplina'}],validation:Rule=>Rule.required()}),
    defineField({name:'modalidad',title:'Modalidad',type:'string',description:'Ejemplo: Kick Light, Point Fighting, Light Contact o K-1 Light.'}),
    defineField({name:'grupoEdad',title:'Grupo de edad',type:'string',options:{list:[{title:'Sénior',value:'senior'},{title:'Veterano',value:'veterano'},{title:'Júnior',value:'junior'},{title:'Juvenil',value:'juvenil'},{title:'Cadete',value:'cadete'},{title:'Infantil',value:'infantil'},{title:'Escolar',value:'escolar'},{title:'Otro',value:'otro'}]}}),
    defineField({name:'sexo',title:'Sexo',type:'string',options:{list:[{title:'Masculino',value:'masculino'},{title:'Femenino',value:'femenino'},{title:'Mixto',value:'mixto'}]}}),
    defineField({name:'tipoLimite',title:'Tipo de límite',type:'string',initialValue:'hasta',options:{list:[{title:'Hasta',value:'hasta'},{title:'Más de',value:'mas_de'},{title:'Peso exacto',value:'exacto'}],layout:'radio'},validation:Rule=>Rule.required()}),
    defineField({name:'limitePeso',title:'Límite de peso',type:'number',description:'Valor numérico del límite.',validation:Rule=>Rule.required().positive()}),
    defineField({name:'unidad',title:'Unidad',type:'string',initialValue:'kg',options:{list:[{title:'Libras (lb)',value:'lb'},{title:'Kilogramos (kg)',value:'kg'}],layout:'radio'},validation:Rule=>Rule.required()}),
    defineField({name:'descripcion',title:'Descripción',type:'text',rows:4,description:'Resumen editorial breve de la categoría de peso.',validation:Rule=>Rule.min(10).max(500)}),
  ],
  preview:{select:{title:'nombre',subtitle:'disciplina.nombre',limitePeso:'limitePeso',unidad:'unidad',tipoLimite:'tipoLimite',modalidad:'modalidad'},prepare({title,subtitle,limitePeso,unidad,tipoLimite,modalidad}){const operador=tipoLimite==='mas_de'?'>':tipoLimite==='hasta'?'≤':'=';const peso=limitePeso&&unidad?` · ${operador}${limitePeso}${unidad}`:'';return{title,subtitle:`${subtitle||'Sin disciplina'}${modalidad?` · ${modalidad}`:''}${peso}`}}},
})
