import {disciplinaType} from './disciplina'
import {organizacionType} from './organizacion'
import {categoriaPesoType} from './categoria-peso'
import {luchadorType} from './luchador'
import {eventoType} from './evento'
import {combateType} from './combate'
import {noticiaType} from './noticia'

export const schema = {
  types: [
    disciplinaType,
    organizacionType,
    categoriaPesoType,
    luchadorType,
    eventoType,
    combateType,
    noticiaType,
  ],
}