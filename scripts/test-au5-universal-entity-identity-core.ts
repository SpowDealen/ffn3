import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  EntityIdentityStrategyRegistry,
  UNIVERSAL_ENTITY_TYPES,
  buildEntityIdentity,
  classifyEntityDuplicate,
  compareEntityIdentity,
  createDefaultEntityIdentityStrategyRegistry,
  createEntityCandidate,
  entityIdentitySecurity,
  normalizeCanonicalUrl,
  normalizeIdentityText,
  resolveEntityIdentity,
  resolveIdentityCapability,
  universalEntityIdentityCompatibility,
  type EntityAlias,
  type EntityCandidate,
  type IdentityProvenance,
  type UniversalEntityIdentity,
  type UniversalEntityIdentityInput,
} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity";
import {
  ENTITY_IDENTITY_DEV_SCENARIOS,
  buildEntityIdentityDevFixtureResult,
  entityIdentityDevFixtureSecurity,
} from "../_laboratorio/laboratorio-ia/src/review/entityIdentity/devFixture";

const completed: string[] = [];
function check(name: string, assertion: () => void): void {
  assertion();
  completed.push(name);
}

const provenance = (field = "primaryLabel", verified = true): IdentityProvenance => ({
  producer: "au5-test",
  source: "synthetic",
  field,
  extractionMethod: "fixture",
  confidence: verified ? .99 : .7,
  verified,
});

const alias = (value: string, aliasType: EntityAlias["aliasType"] = "official", verified = true) => ({
  value,
  aliasType,
  source: "synthetic",
  confidence: verified ? .98 : .65,
  verified,
  provenance: provenance("alias", verified),
});

function identity<T extends UniversalEntityIdentityInput>(input: T): Extract<UniversalEntityIdentity, {entityType: T["entityType"]}> {
  return buildEntityIdentity(input) as Extract<UniversalEntityIdentity, {entityType: T["entityType"]}>;
}

function candidate(id: string, value: UniversalEntityIdentity): EntityCandidate {
  return createEntityCandidate({candidateId: id, entityType: value.entityType, identity: value, safeSummary: `Candidato ${id}`, source: "synthetic"});
}

const fighter = (label: string, extra: Partial<Extract<UniversalEntityIdentityInput, {entityType: "fighter"}>> = {}) => identity({
  entityType: "fighter", source: "synthetic", primaryLabel: label, provenance: [provenance()], ...extra,
});
const event = (label: string, extra: Partial<Extract<UniversalEntityIdentityInput, {entityType: "event"}>> = {}) => identity({
  entityType: "event", source: "synthetic", primaryLabel: label, organization: "UFC", edition: 308, date: "2024-10-26", provenance: [provenance()], ...extra,
});
const organization = (label: string, extra: Partial<Extract<UniversalEntityIdentityInput, {entityType: "organization"}>> = {}) => identity({
  entityType: "organization", source: "synthetic", primaryLabel: label, provenance: [provenance()], ...extra,
});
const discipline = (label: string, extra: Partial<Extract<UniversalEntityIdentityInput, {entityType: "discipline"}>> = {}) => identity({
  entityType: "discipline", source: "synthetic", primaryLabel: label, provenance: [provenance()], ...extra,
});
const weight = (label: string, extra: Partial<Extract<UniversalEntityIdentityInput, {entityType: "weight_category"}>> = {}) => identity({
  entityType: "weight_category", source: "synthetic", primaryLabel: label, discipline: "MMA", organization: "fixture-org", ruleset: "unified", provenance: [provenance()], ...extra,
});
const fight = (label: string, extra: Partial<Extract<UniversalEntityIdentityInput, {entityType: "fight"}>> = {}) => identity({
  entityType: "fight", source: "synthetic", primaryLabel: label, eventKey: "event:308", participants: ["Ilia Topuria", "Max Holloway"], provenance: [provenance()], ...extra,
});
const news = (label: string, extra: Partial<Extract<UniversalEntityIdentityInput, {entityType: "news"}>> = {}) => identity({
  entityType: "news", source: "synthetic", primaryLabel: label, publisher: "Fixture News", publishedDate: "2026-01-10", provenance: [provenance()], ...extra,
});
const result = (label: string, extra: Partial<Extract<UniversalEntityIdentityInput, {entityType: "result"}>> = {}) => identity({
  entityType: "result", source: "synthetic", primaryLabel: label, resultScope: "fight", fightKey: "fight:308:main", participants: ["Ilia Topuria", "Max Holloway"], provenance: [provenance()], ...extra,
});

function main(): void {
  const registry = createDefaultEntityIdentityStrategyRegistry();
  check("01 registry de estrategias", () => assert.equal(registry.list().length, 8));
  check("02 tipos soportados", () => assert.deepEqual(registry.list().map(({entityType}) => entityType), [...UNIVERSAL_ENTITY_TYPES].sort()));
  check("03 tipo no soportado", () => {
    const empty = new EntityIdentityStrategyRegistry();
    assert.throws(() => buildEntityIdentity({entityType: "fighter", source: "x", primaryLabel: "A B", provenance: [provenance()]} as never, empty), /strategy_missing/);
  });
  check("04 tipos incompatibles no se comparan", () => assert.equal(compareEntityIdentity(fighter("A B"), event("A B")).decision, "unsupported_entity_type"));

  const aliasOrderA = fighter("José Aldo", {aliases: [alias("Junior", "nickname"), alias("Jose Aldo", "transliteration")]});
  const aliasOrderB = fighter(" Jose\u0301   Aldo ", {aliases: [alias("Jose Aldo", "transliteration"), alias("Junior", "nickname")]});
  check("05 fingerprints deterministas", () => assert.equal(aliasOrderA.fingerprint, aliasOrderB.fingerprint));
  check("06 orden de aliases irrelevante", () => assert.equal(aliasOrderA.aliases.map(({fingerprint}) => fingerprint).join(), aliasOrderB.aliases.map(({fingerprint}) => fingerprint).join()));
  const idsA = fighter("Jose Aldo", {externalIdentifiers: [
    {source: "authority", namespace: "athlete", value: "1", confidence: 1, verified: true},
    {source: "sanity", namespace: "document", value: "doc-1", confidence: 1, verified: true},
  ]});
  const idsB = fighter("Jose Aldo", {externalIdentifiers: [
    {source: "sanity", namespace: "document", value: "doc-1", confidence: 1, verified: true},
    {source: "authority", namespace: "athlete", value: "1", confidence: 1, verified: true},
  ]});
  check("07 orden de IDs irrelevante", () => assert.equal(idsA.fingerprint, idsB.fingerprint));
  check("08 provenance conservada", () => assert.equal(idsA.provenance[0].producer, "au5-test"));
  check("09 resultados serializables", () => assert.doesNotThrow(() => JSON.stringify(resolveEntityIdentity(idsA, [], {searchCompleted: true}))));
  const sensitive = fighter("Token=private Ilia Topuria", {aliases: [alias("password=hunter2", "source_specific", false)]});
  check("10 ausencia de datos sensibles", () => {
    const serialized = JSON.stringify(sensitive);
    assert.equal(serialized.includes("private"), false);
    assert.equal(serialized.includes("hunter2"), false);
    assert.equal(serialized.includes("[redacted]"), true);
  });

  const ilia = fighter("Ilia Topuria", {givenName: "Ilia", familyName: "Topuria", birthDate: "1997-01-21", nationality: "España"});
  check("11 luchador nombre exacto", () => assert.equal(compareEntityIdentity(ilia, fighter("Ilia Topuria", {givenName: "Ilia", familyName: "Topuria"})).decision, "strong_match"));
  check("12 luchador nombre normalizado", () => assert.equal(compareEntityIdentity(ilia, fighter(" ÍLIA   TOPURIA ")).decision, "strong_match"));
  check("13 luchador nombre con apodo", () => assert.equal(compareEntityIdentity(fighter("Ilia “El Matador” Topuria", {givenName: "Ilia", familyName: "Topuria", nickname: "El Matador"}), ilia).decision, "strong_match"));
  check("14 apodo como alias", () => assert.equal(compareEntityIdentity(fighter("El Matador", {aliases: [alias("Ilia Topuria", "official")]}), ilia).decision, "strong_match"));
  check("15 inicial y apellido", () => assert.equal(compareEntityIdentity(fighter("I. Topuria", {givenName: undefined}), ilia).decision, "probable_match"));
  check("16 apellido solo insuficiente", () => assert.equal(compareEntityIdentity(fighter("Topuria", {givenName: undefined}), ilia).decision, "insufficient_evidence"));
  check("17 transliteración", () => assert.equal(compareEntityIdentity(fighter("Хабиб Нурмагомедов", {transliterations: ["Khabib Nurmagomedov"]}), fighter("Khabib Nurmagomedov")).decision, "strong_match"));
  const officialOne = fighter("Ilia Topuria", {externalIdentifiers: [{source: "authority", namespace: "athlete", value: "1", confidence: 1, verified: true}]});
  check("18 external ID exacto", () => assert.equal(compareEntityIdentity(officialOne, officialOne).decision, "exact_match"));
  check("19 external ID conflictivo", () => assert.equal(compareEntityIdentity(officialOne, fighter("Ilia Topuria", {externalIdentifiers: [{source: "authority", namespace: "athlete", value: "2", confidence: 1, verified: true}]})).decision, "conflicting_identity"));
  check("20 fecha nacimiento conflictiva", () => assert.equal(compareEntityIdentity(ilia, fighter("Ilia Topuria", {birthDate: "1990-01-21"})).decision, "conflicting_identity"));
  const twoStrong = [candidate("fighter-a", fighter("Ilia Topuria")), candidate("fighter-b", fighter("Ilia Topuria", {nickname: "El Matador"}))];
  check("21 dos candidatos fuertes ambiguos", () => assert.equal(resolveEntityIdentity(ilia, twoStrong, {searchCompleted: true}).status, "ambiguous"));
  check("22 nombre igual contexto incompatible", () => assert.equal(compareEntityIdentity(officialOne, fighter("Ilia Topuria", {externalIdentifiers: [{source: "authority", namespace: "athlete", value: "other", confidence: 1, verified: true}]})).conflictCodes.includes("verified_external_id_conflict"), true));
  check("23 reutilización segura", () => assert.equal(resolveEntityIdentity(officialOne, [candidate("fighter-1", officialOne)], {searchCompleted: true}).status, "reuse"));
  check("24 creación segura", () => assert.equal(resolveEntityIdentity(fighter("Nuevo Luchador", {givenName: "Nuevo", familyName: "Luchador"}), [], {searchCompleted: true}).status, "create_new"));
  check("25 no crear evidencia insuficiente", () => assert.equal(resolveEntityIdentity(fighter("Topuria", {givenName: undefined}), [], {searchCompleted: true}).status, "insufficient_evidence"));

  check("26 evento mismo número organización", () => assert.equal(compareEntityIdentity(event("UFC 308"), event("UFC 308 Abu Dhabi")).decision, "exact_match"));
  check("27 título editorial enriquecido", () => assert.equal(compareEntityIdentity(event("UFC 308: Topuria vs Holloway"), event("UFC 308")).decision, "exact_match"));
  check("28 vs v versus", () => {
    const values = ["UFC 308: Topuria vs Holloway", "UFC 308 – Topuria v. Holloway", "UFC 308 Topuria versus Holloway"];
    assert.equal(new Set(values.map((value) => event(value).attributes.baseName)).size, 1);
  });
  check("29 organización y fecha", () => assert.equal(compareEntityIdentity(event("Fight Night", {edition: undefined}), event("Fight Night", {edition: undefined})).decision, "strong_match"));
  check("30 edición distinta", () => assert.equal(compareEntityIdentity(event("UFC 308"), event("UFC 309", {edition: 309})).decision, "conflicting_identity"));
  check("31 organización distinta", () => assert.equal(compareEntityIdentity(event("UFC 308"), event("UFC 308", {organization: "Fixture Championship"})).decision, "conflicting_identity"));
  const externalEvent = event("UFC 308", {externalIdentifiers: [{source: "authority", namespace: "event", value: "308", confidence: 1, verified: true}]});
  check("32 evento external ID exacto", () => assert.equal(compareEntityIdentity(externalEvent, externalEvent).decision, "exact_match"));
  check("33 evento external ID conflictivo", () => assert.equal(compareEntityIdentity(externalEvent, event("UFC 308", {externalIdentifiers: [{source: "authority", namespace: "event", value: "309", confidence: 1, verified: true}]})).decision, "conflicting_identity"));
  check("34 cambio parcial ubicación", () => assert.equal(compareEntityIdentity(event("UFC 308", {venue: "Old Arena"}), event("UFC 308", {venue: "New Arena"})).decision, "exact_match"));
  check("35 main event refuerzo", () => assert.equal(compareEntityIdentity(event("Fight Night", {edition: undefined, mainEvent: ["A", "B"]}), event("Fight Night", {edition: undefined, mainEvent: ["A", "B"]})).supportingEvidence.some(({code}) => code === "main_event_match"), true));
  check("36 reprogramación representable", () => assert.equal(event("UFC 308", {rescheduledFrom: "2024-09-01"}).attributes.rescheduledFrom, "2024-09-01"));
  check("37 título parecido sin contexto", () => assert.equal(compareEntityIdentity(event("Combat Night", {organization: undefined, edition: undefined, date: undefined}), event("Combat Night", {organization: undefined, edition: undefined, date: undefined})).decision, "insufficient_evidence"));

  check("38 organización nombre y sigla", () => assert.equal(compareEntityIdentity(organization("UFC", {abbreviation: "UFC"}), organization("Ultimate Fighting Championship", {abbreviation: "UFC"})).decision, "strong_match"));
  check("39 puntuación sigla", () => assert.equal(compareEntityIdentity(organization("U.F.C.", {abbreviation: "U.F.C."}), organization("UFC", {abbreviation: "UFC"})).decision, "strong_match"));
  check("40 sigla ambigua", () => {
    const abbreviation = organization("ABC", {abbreviation: "ABC"});
    const candidates = [
      candidate("abc-one", organization("Another Boxing Club", {abbreviation: "ABC"})),
      candidate("abc-two", organization("Alliance Boxing Council", {abbreviation: "ABC"})),
    ];
    assert.equal(resolveEntityIdentity(abbreviation, candidates, {searchCompleted: true}).status, "ambiguous");
  });
  check("41 dominio oficial", () => assert.equal(compareEntityIdentity(organization("Org A", {officialDomain: "https://www.example.test"}), organization("Different Name", {officialDomain: "example.test"})).decision, "exact_match"));
  check("42 nombre histórico", () => assert.equal(compareEntityIdentity(organization("Historic FC"), organization("Current FC", {historicalNames: ["Historic FC"]})).decision, "strong_match"));

  check("43 MMA y artes marciales mixtas", () => assert.equal(compareEntityIdentity(discipline("MMA", {catalogId: "mma", catalogAliases: ["Mixed Martial Arts", "Artes marciales mixtas"]}), discipline("Artes marciales mixtas", {catalogId: "mma", catalogAliases: ["MMA"]})).decision, "exact_match"));
  check("44 organización no es disciplina", () => assert.equal(compareEntityIdentity(discipline("ONE Championship"), discipline("MMA", {catalogId: "mma"})).decision, "no_match"));
  check("45 alias catálogo", () => assert.equal(compareEntityIdentity(discipline("Mixed Martial Arts", {catalogAliases: ["MMA"]}), discipline("MMA", {catalogAliases: ["Mixed Martial Arts"]})).decision, "strong_match"));
  check("46 fuzzy disciplina bloqueado", () => assert.equal(compareEntityIdentity(discipline("Mixed Martial Art"), discipline("Mixed Martial Arts")).decision, "no_match"));

  check("47 170 lb y peso wélter", () => assert.equal(compareEntityIdentity(weight("170 lb", {limit: 170, unit: "lb"}), weight("Peso wélter", {limit: 77.11, unit: "kg"})).decision, "strong_match"));
  check("48 libras kilogramos", () => assert.equal(weight("170 lb", {limit: 170, unit: "lb"}).attributes.limitKg, 77.11));
  check("49 categoría disciplina incompatible", () => assert.equal(compareEntityIdentity(weight("Welterweight", {limit: 170, unit: "lb"}), weight("Welterweight", {limit: 170, unit: "lb", discipline: "Boxeo"})).decision, "conflicting_identity"));
  check("50 contexto normativo", () => assert.equal(weight("Welterweight", {limit: 170, unit: "lb"}).identityKeys.some(({keyType}) => keyType === "weight-limit-plus-regulatory-context"), true));
  check("51 límite incompatible", () => assert.equal(compareEntityIdentity(weight("Welterweight", {limit: 170, unit: "lb"}), weight("Welterweight", {limit: 185, unit: "lb"})).decision, "conflicting_identity"));

  check("52 orden participantes irrelevante", () => assert.equal(compareEntityIdentity(fight("Topuria vs Holloway"), fight("Holloway vs Topuria", {participants: ["Max Holloway", "Ilia Topuria"]})).decision, "strong_match"));
  check("53 mismo par eventos distintos", () => assert.equal(compareEntityIdentity(fight("A vs B"), fight("A vs B", {eventKey: "event:309"})).decision, "conflicting_identity"));
  check("54 revancha", () => assert.equal(compareEntityIdentity(fight("A vs B", {eventKey: undefined}), fight("A vs B", {eventKey: undefined})).decision, "insufficient_evidence"));
  const externalFight = fight("A vs B", {externalIdentifiers: [{source: "authority", namespace: "fight", value: "f-1", confidence: 1, verified: true}]});
  check("55 external fight ID", () => assert.equal(compareEntityIdentity(externalFight, externalFight).decision, "exact_match"));
  check("56 categoría refuerzo", () => assert.equal(compareEntityIdentity(fight("A vs B", {category: "Featherweight"}), fight("B vs A", {participants: ["Max Holloway", "Ilia Topuria"], category: "Featherweight"})).supportingEvidence.some(({code}) => code === "fight_category_match"), true));

  check("57 URL canónica", () => assert.equal(compareEntityIdentity(news("Title A", {canonicalUrl: "https://example.test/article"}), news("Title B", {canonicalUrl: "https://www.example.test/article"})).decision, "exact_match"));
  check("58 tracking parameters", () => assert.equal(normalizeCanonicalUrl("https://example.test/a?utm_source=x&gclid=y"), "https://example.test/a"));
  check("59 AMP móvil", () => assert.equal(normalizeCanonicalUrl("https://m.example.test/article/amp"), "https://example.test/article"));
  check("60 titulares similares artículos distintos", () => assert.equal(compareEntityIdentity(news("Topuria gana el campeonato"), news("Topuria gana el campeonato mundial")).decision, "probable_match"));
  check("61 fingerprint contenido", () => assert.equal(compareEntityIdentity(news("A", {contentFingerprint: "sha256-v1:content"}), news("B", {contentFingerprint: "sha256-v1:content"})).decision, "strong_match"));

  check("62 resultado mismo combate", () => assert.equal(compareEntityIdentity(result("Topuria def. Holloway", {method: "KO"}), result("Topuria vence a Holloway", {method: "KO"})).decision, "strong_match"));
  check("63 método diferente conflictivo", () => assert.equal(compareEntityIdentity(result("Result", {method: "KO"}), result("Result", {method: "Decision"})).decision, "conflicting_identity"));
  check("64 ronda tiempo", () => {
    const compared = compareEntityIdentity(result("Result", {method: "KO", round: 3, time: "1:34"}), result("Result", {method: "KO", round: 3, time: "1:34"}));
    assert.deepEqual(compared.supportingEvidence.map(({code}) => code).sort(), ["result_participants_match", "result_round_match", "result_time_match"]);
  });
  check("65 resultado evento no combate", () => assert.equal(compareEntityIdentity(result("Event result", {resultScope: "event", fightKey: undefined, eventKey: "event:308"}), result("Fight result")).decision, "conflicting_identity"));

  const exactCandidate = candidate("exact", officialOne);
  const probableCandidate = candidate("probable", fighter("I. Topuria", {givenName: undefined}));
  check("66 exact match gana", () => assert.equal(resolveEntityIdentity(officialOne, [probableCandidate, exactCandidate], {searchCompleted: true}).candidateId, "exact"));
  check("67 strong único", () => assert.equal(resolveEntityIdentity(ilia, [candidate("strong", fighter("Ilia Topuria"))], {searchCompleted: true}).status, "reuse"));
  check("68 dos strong ambiguos", () => assert.equal(resolveEntityIdentity(ilia, twoStrong, {searchCompleted: true}).status, "ambiguous"));
  check("69 probable no crea", () => assert.equal(resolveEntityIdentity(ilia, [candidate("initial", fighter("I. Topuria", {givenName: undefined}))], {searchCompleted: true}).status, "probable_match"));
  check("70 conflicto no crea", () => assert.equal(resolveEntityIdentity(officialOne, [candidate("conflict", fighter("Ilia Topuria", {externalIdentifiers: [{source: "authority", namespace: "athlete", value: "2", confidence: 1, verified: true}]}))], {searchCompleted: true}).status, "conflicting_identity"));
  check("71 sin candidatos crea con suficiente", () => assert.equal(resolveEntityIdentity(ilia, [], {searchCompleted: true}).status, "create_new"));
  check("72 candidatos otro tipo ignorados", () => assert.equal(resolveEntityIdentity(ilia, [candidate("event", event("UFC 308"))], {searchCompleted: true}).status, "create_new"));
  check("73 clasificación duplicados", () => assert.equal(classifyEntityDuplicate(officialOne, exactCandidate).classification, "duplicate"));
  check("74 comparison fingerprint estable", () => assert.equal(compareEntityIdentity(ilia, fighter("Ilia Topuria")).comparisonFingerprint, compareEntityIdentity(ilia, fighter("Ilia Topuria")).comparisonFingerprint));
  check("75 resolution fingerprint estable", () => assert.equal(resolveEntityIdentity(ilia, [candidate("one", fighter("Ilia Topuria"))], {searchCompleted: true}).resolutionFingerprint, resolveEntityIdentity(ilia, [candidate("one", fighter("Ilia Topuria"))], {searchCompleted: true}).resolutionFingerprint));

  check("76 búsqueda incompleta no crea", () => assert.equal(resolveEntityIdentity(ilia, []).status, "insufficient_evidence"));
  check("77 namespace externo aislado", () => assert.equal(compareEntityIdentity(fighter("X Y", {externalIdentifiers: [{source: "a", namespace: "athlete", value: "1", confidence: 1, verified: true}]}), fighter("Different Person", {externalIdentifiers: [{source: "b", namespace: "athlete", value: "1", confidence: 1, verified: true}]})).decision, "no_match"));
  check("78 normalización Unicode", () => assert.equal(normalizeIdentityText(" José\u0301  “Junior” ").normalizedValue, "jose junior"));
  check("79 URLs no guardan tracking", () => assert.equal(news("A", {canonicalUrl: "https://example.test/a?utm_campaign=secret"}).attributes.canonicalUrl, "https://example.test/a"));
  check("80 capability conceptual", () => assert.equal(resolveIdentityCapability("fighter"), "resolve_identity:fighter"));
  check("81 integración no disruptiva", () => assert.equal(universalEntityIdentityCompatibility.modifiesExecutors, false));
  check("82 seguridad core", () => assert.deepEqual(entityIdentitySecurity, {pure: true, deterministic: true, network: false, io: false, sanity: false, writes: false, localStorage: false, secrets: false, fullDocuments: false, fullPayloads: false}));
  check("83 fixture DEV", () => assert.equal(ENTITY_IDENTITY_DEV_SCENARIOS.length, 10));
  check("84 fixture seguro", () => assert.equal(Object.values(entityIdentityDevFixtureSecurity).every((value) => value === true || value === false), true));
  check("85 fixture luchador apodo", () => assert.equal(buildEntityIdentityDevFixtureResult("fighter_nickname").resolution.status, "reuse"));
  check("86 fixture evento editorial", () => assert.equal(buildEntityIdentityDevFixtureResult("event_editorial_title").resolution.status, "reuse"));
  check("87 fixture conflicto", () => assert.equal(buildEntityIdentityDevFixtureResult("fighter_external_conflict").resolution.status, "conflicting_identity"));
  check("88 fixture no persiste", () => assert.equal(entityIdentityDevFixtureSecurity.persistence, false));
  check("89 estrategia duplicada bloqueada", () => assert.throws(() => registry.register({...registry.get("fighter")!}), /duplicate/));
  check("90 candidato seguro", () => assert.equal(createEntityCandidate({candidateId: "safe", entityType: "fighter", identity: ilia, safeSummary: "token=private https://secret.test", source: "x"}).safeSummary.includes("private"), false));
  check("91 normalización conserva transformaciones", () => assert.equal(normalizeIdentityText("  José  ").transformations.length > 0, true));
  check("92 identity keys jerárquicas", () => assert.equal(officialOne.identityKeys.some(({strength}) => strength === "definitive"), true));
  check("93 alias versionado", () => assert.equal(aliasOrderA.aliases[0].aliasVersion, "1.0.0"));
  check("94 ID versionado y tipado", () => assert.equal(officialOne.externalIdentifiers[0].entityType, "fighter"));
  check("95 raw input seguro limitado", () => assert.equal(ilia.rawInput.every(({value}) => value.length <= 240), true));

  const coreSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/entityIdentity/core.ts"), "utf8");
  const fixtureSource = readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/entityIdentity/devFixture.ts"), "utf8");
  check("96 core sin IO", () => {
    assert.equal(coreSource.includes("fetch("), false);
    assert.equal(coreSource.includes("localStorage"), false);
    assert.equal(coreSource.includes("saveDraft"), false);
  });
  check("97 fixture no exportado en índice productivo", () => assert.equal(readFileSync(resolve("_laboratorio/laboratorio-ia/src/review/entityIdentity/index.ts"), "utf8").includes("devFixture"), false));
  check("98 fixture sin clientes externos", () => {
    assert.equal(fixtureSource.includes("fetch("), false);
    assert.equal(fixtureSource.includes("SanityClient"), false);
  });
  check("99 todos los fixtures serializables", () => ENTITY_IDENTITY_DEV_SCENARIOS.forEach((scenario) => assert.doesNotThrow(() => JSON.stringify(buildEntityIdentityDevFixtureResult(scenario)))));
  check("100 suite mínima", () => assert.equal(completed.length >= 75, true));
  console.log(`AU5 universal entity identity core tests: OK (${completed.length} cases)`);
}

main();
