import {createClient} from "@sanity/client"
import {NextResponse} from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type FekmDisciplineKey = "kickboxing" | "muay_thai"
type FekmGender = "masculino" | "femenino" | "mixto"
type FekmAgeGroup = "senior" | "veterano" | "junior" | "juvenil" | "cadete" | "infantil" | "escolar" | "otro"
type WeightBoundary = "hasta" | "mas_de" | "exacto"

type SourceCategory = {
  label?: string
  discipline?: FekmDisciplineKey | string
  gender?: FekmGender | string
  ageGroup?: FekmAgeGroup | string
  modality?: string
  eventCode?: string
  weightLabel?: string
  limitKg?: number
}

type RequestBody = {category?: SourceCategory; categories?: SourceCategory[]}
type ReferenceDoc = {_id: string; nombre?: string; slug?: {current?: string}}
type CategoryDoc = ReferenceDoc & {
  limitePeso?: number
  unidad?: "kg" | "lb"
  tipoLimite?: WeightBoundary
  modalidad?: string
  grupoEdad?: FekmAgeGroup
  sexo?: FekmGender
  disciplina?: {_ref?: string} | null
}

type NormalizedCategory = {
  sourceLabel: string
  disciplineKey: FekmDisciplineKey
  disciplineLabel: "Kickboxing" | "Muay Thai"
  gender: FekmGender
  ageGroup: FekmAgeGroup
  modality: string
  boundary: WeightBoundary
  limitKg: number
  canonicalName: string
  canonicalSlug: string
  confidence: "alta" | "media"
}

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || "production"
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2025-03-01"
const client = createClient({projectId: projectId || "", dataset, apiVersion, useCdn: false, perspective: "raw"})
const CORS_HEADERS = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Cache-Control":"no-store"}
function withCors<T>(response: NextResponse<T>): NextResponse<T> {for (const [key,value] of Object.entries(CORS_HEADERS)) response.headers.set(key,value); return response}
function text(value: unknown): string {return typeof value === "string" ? value.trim() : ""}
function stripDiacritics(value: string): string {return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")}
function normalize(value: string): string {return stripDiacritics(value).toLowerCase().replace(/[–—−]/g,"-").replace(/[^a-z0-9+.,-]+/g," ").replace(/\s+/g," ").trim()}
function slugify(value: string): string {return stripDiacritics(value).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,96)}
function baseId(value: string): string {return value.replace(/^drafts\./, "")}
function normalizeDiscipline(value: string): FekmDisciplineKey | null {const n=normalize(value); if(n.includes("muay")||n.includes("thai")) return "muay_thai"; if(n.includes("kick")||n==="kb") return "kickboxing"; return null}
function normalizeGender(value: string): FekmGender {const n=normalize(value); if(/\b(fem|female|women|woman|mujer|femenin)/.test(n)) return "femenino"; if(/\b(masc|male|men|man|hombre|masculin)/.test(n)) return "masculino"; return "mixto"}
function normalizeAgeGroup(value: string): FekmAgeGroup {const n=normalize(value); if(n.includes("veteran")) return "veterano"; if(n.includes("senior")) return "senior"; if(n.includes("junior")) return "junior"; if(n.includes("juvenil")) return "juvenil"; if(n.includes("cadete")) return "cadete"; if(n.includes("infantil")) return "infantil"; if(n.includes("escolar")) return "escolar"; return "otro"}
function normalizeModality(value: string): string {const n=normalize(value); if(n.includes("k-1l")||n.includes("k1 light")||n.includes("k-1 light")) return "K-1 Light"; if(n.includes("kick light")||/\bkl\b/.test(n)) return "Kick Light"; if(n.includes("light contact")||/\blc\b/.test(n)) return "Light Contact"; if(n.includes("point fighting")||/\bpf\b/.test(n)) return "Point Fighting"; if(n.includes("creative forms")||/\bcf\b/.test(n)) return "Creative Forms"; if(n.includes("muay")) return "Muay Thai"; return text(value) || "General"}
function parseWeight(input: SourceCategory): {limitKg:number; boundary:WeightBoundary; confidence:"alta"|"media"}|null {
  if(typeof input.limitKg === "number" && Number.isFinite(input.limitKg)) {
    const raw=normalize(text(input.weightLabel)||text(input.label));
    return {limitKg:input.limitKg,boundary:raw.includes("+")||raw.includes("mas de")?"mas_de":"hasta",confidence:"alta"}
  }
  const raw=normalize([text(input.weightLabel),text(input.label)].filter(Boolean).join(" "));
  const plus=raw.match(/(?:^|\s)\+(\d{2,3}(?:[.,]\d+)?)\s*(?:kg)?/);
  if(plus) return {limitKg:Number(plus[1].replace(",",".")),boundary:"mas_de",confidence:"alta"};
  const minus=raw.match(/(?:^|\s)-(\d{2,3}(?:[.,]\d+)?)\s*(?:kg)?/);
  if(minus) return {limitKg:Number(minus[1].replace(",",".")),boundary:"hasta",confidence:"alta"};
  const explicit=raw.match(/(?:hasta|menos de|under|<)\s*(\d{2,3}(?:[.,]\d+)?)\s*(?:kg)?/);
  if(explicit) return {limitKg:Number(explicit[1].replace(",",".")),boundary:"hasta",confidence:"alta"};
  const over=raw.match(/(?:mas de|over|>)\s*(\d{2,3}(?:[.,]\d+)?)\s*(?:kg)?/);
  if(over) return {limitKg:Number(over[1].replace(",",".")),boundary:"mas_de",confidence:"alta"};
  const bare=raw.match(/(?:^|\s)(\d{2,3}(?:[.,]\d+)?)\s*(?:kg)(?:\s|$)/);
  if(bare) return {limitKg:Number(bare[1].replace(",",".")),boundary:"exacto",confidence:"media"};
  return null
}
function formatKg(value:number):string{return Number.isInteger(value)?String(value):String(value).replace(".",",")}
function boundaryLabel(boundary:WeightBoundary):string{return boundary==="mas_de"?"Más de":boundary==="exacto"?"Peso":"Hasta"}
function buildCanonicalCategory(input:SourceCategory):NormalizedCategory|null {
  const sourceLabel=text(input.label)||[text(input.modality),text(input.ageGroup),text(input.gender),text(input.weightLabel)].filter(Boolean).join(" · ")
  const disciplineKey=normalizeDiscipline(text(input.discipline)); const parsed=parseWeight(input); if(!sourceLabel||!disciplineKey||!parsed) return null
  if(parsed.limitKg<20||parsed.limitKg>200) return null
  const gender=normalizeGender(text(input.gender)||sourceLabel); const ageGroup=normalizeAgeGroup(text(input.ageGroup)||sourceLabel)
  const modality=normalizeModality(text(input.modality)||text(input.eventCode)||sourceLabel)
  const disciplineLabel=disciplineKey==="muay_thai"?"Muay Thai":"Kickboxing"
  const canonicalName=`${modality} · ${ageGroup} · ${gender} · ${boundaryLabel(parsed.boundary)} ${formatKg(parsed.limitKg)} kg`
  return {sourceLabel,disciplineKey,disciplineLabel,gender,ageGroup,modality,boundary:parsed.boundary,limitKg:parsed.limitKg,canonicalName,canonicalSlug:slugify(`${canonicalName}-${disciplineLabel}`),confidence:parsed.confidence}
}
function findDiscipline(category:NormalizedCategory,docs:ReferenceDoc[]):ReferenceDoc|null {const aliases=category.disciplineKey==="muay_thai"?["muay thai","muaythai"]:["kickboxing","kick boxing","kick-boxing"]; return docs.find(doc=>aliases.includes(normalize(text(doc.nombre))))||null}
function categoryIdentity(category:NormalizedCategory,disciplineId:string):string{return [baseId(disciplineId),normalize(category.modality),category.ageGroup,category.gender,category.boundary,category.limitKg.toFixed(3)].join("::")}
function docIdentity(doc:CategoryDoc):string{return [baseId(text(doc.disciplina?._ref)),normalize(text(doc.modalidad)||text(doc.nombre)),doc.grupoEdad||"otro",doc.sexo||"mixto",doc.tipoLimite||(/mas de|\+/.test(normalize(text(doc.nombre)))?"mas_de":"hasta"),(doc.limitePeso??0).toFixed(3)].join("::")}
function findExistingCategory(category:NormalizedCategory,discipline:ReferenceDoc,categories:CategoryDoc[]):CategoryDoc|null {const identity=categoryIdentity(category,discipline._id); const targetName=normalize(category.canonicalName); return categories.find(doc=>docIdentity(doc)===identity||normalize(text(doc.nombre))===targetName)||null}
export async function OPTIONS():Promise<NextResponse>{return withCors(new NextResponse(null,{status:204}))}
export async function POST(request:Request):Promise<NextResponse>{try{let body:RequestBody; try{body=await request.json() as RequestBody}catch{return withCors(NextResponse.json({ok:false,error:"El body no es un JSON válido."},{status:400}))}
const inputs=[...(body.category?[body.category]:[]),...(Array.isArray(body.categories)?body.categories:[])]; if(!inputs.length)return withCors(NextResponse.json({ok:false,error:"No se recibieron categorías FEKM."},{status:400}))
const [disciplines,existingCategories]=await Promise.all([client.fetch<ReferenceDoc[]>(`*[_type == "disciplina"]{_id,nombre,slug}`,{}, {perspective:"raw"}),client.fetch<CategoryDoc[]>(`*[_type == "categoriaPeso"]{_id,nombre,slug,limitePeso,unidad,tipoLimite,modalidad,grupoEdad,sexo,disciplina}`,{}, {perspective:"raw"})])
const seen=new Set<string>(); const items=inputs.map(input=>{const normalizedCategory=buildCanonicalCategory(input); if(!normalizedCategory)return {source:input,normalized:null,discipline:null,existingCategory:null,readyToCreate:false,blockingReasons:["categoria_o_disciplina_no_normalizable"]}; const discipline=findDiscipline(normalizedCategory,disciplines); const key=discipline?categoryIdentity(normalizedCategory,discipline._id):""; const duplicateInRequest=Boolean(key&&seen.has(key)); if(key)seen.add(key); const existingCategory=discipline?findExistingCategory(normalizedCategory,discipline,existingCategories):null; const blockingReasons:string[]=[]; if(!discipline)blockingReasons.push("disciplina_no_resuelta_en_sanity"); if(duplicateInRequest)blockingReasons.push("duplicada_en_la_peticion"); return {source:input,normalized:normalizedCategory,discipline,existingCategory,readyToCreate:Boolean(discipline&&!existingCategory&&!duplicateInRequest),blockingReasons}})
return withCors(NextResponse.json({ok:true,source:"fekm",summary:{received:inputs.length,normalized:items.filter(i=>i.normalized).length,existing:items.filter(i=>i.existingCategory).length,readyToCreate:items.filter(i=>i.readyToCreate).length,blocked:items.filter(i=>i.blockingReasons.length>0).length},items}))}catch(error){console.error("Error resolviendo categorías FEKM:",error); return withCors(NextResponse.json({ok:false,error:error instanceof Error?error.message:"Error desconocido resolviendo categorías FEKM."},{status:500}))}}
