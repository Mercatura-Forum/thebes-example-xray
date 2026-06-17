/**
 * xray-api.ts — typed reads/writes for the Lumen backend. Reads use flat `*View`
 * queries (the SDK decodes a vec<record> of scalars); single records come back as
 * 0-or-1-element vecs. Writes use the `*OrTrap` twins so a rejected guard surfaces
 * as a thrown reason the UI can show, never a silently-swallowed `#err`.
 */
import { query, update, encodeArg, encodeArgs, decodeVecRecord, decodeNat, decodeBool } from '@thebes/sdk'
import { XRAY_CID } from './config'

// ── Row types ──
export interface WorklistRow {
  studyId: bigint; patientId: bigint; patientName: string; mrn: string; modality: string
  bodyPart: string; status: string; reportStatus: string; imageCount: bigint; createdAt: bigint
}
export interface PatientRow {
  id: bigint; mrn: string; name: string; sex: string; birthYear: bigint; studyCount: bigint; createdAt: bigint
}
export interface PatientHeader {
  id: bigint; mrn: string; name: string; sex: string; birthYear: bigint; createdAt: bigint
}
export interface StudyRow {
  id: bigint; modality: string; bodyPart: string; description: string; status: string
  reportStatus: string; seriesCount: bigint; imageCount: bigint; createdAt: bigint
}
export interface StudyDetail {
  id: bigint; patientId: bigint; patientName: string; mrn: string; modality: string; bodyPart: string
  description: string; status: string; reportStatus: string; reportFindings: string; reportImpression: string; createdAt: bigint
}
export interface SeriesRow { id: bigint; description: string; imageCount: bigint; createdAt: bigint }
export interface ImageRow { id: bigint; seriesId: bigint; instanceNumber: bigint; imagePath: string; createdAt: bigint }
export interface StaffRow { who: string; role: string }
export interface AccessRow { id: bigint; at: bigint; who: string; studyId: bigint; action: string }

// ── Field shapes for decodeVecRecord ──
const t = (name: string) => ({ name, type: 'text' as const })
const n = (name: string) => ({ name, type: 'nat' as const })
const i = (name: string) => ({ name, type: 'int' as const })
const p = (name: string) => ({ name, type: 'principal' as const })

const WORKLIST_F = [n('studyId'), n('patientId'), t('patientName'), t('mrn'), t('modality'), t('bodyPart'), t('status'), t('reportStatus'), n('imageCount'), i('createdAt')]
const PATIENT_F = [n('id'), t('mrn'), t('name'), t('sex'), n('birthYear'), n('studyCount'), i('createdAt')]
const PATIENT_HEADER_F = [n('id'), t('mrn'), t('name'), t('sex'), n('birthYear'), i('createdAt')]
const STUDY_ROW_F = [n('id'), t('modality'), t('bodyPart'), t('description'), t('status'), t('reportStatus'), n('seriesCount'), n('imageCount'), i('createdAt')]
const STUDY_DETAIL_F = [n('id'), n('patientId'), t('patientName'), t('mrn'), t('modality'), t('bodyPart'), t('description'), t('status'), t('reportStatus'), t('reportFindings'), t('reportImpression'), i('createdAt')]
const SERIES_F = [n('id'), t('description'), n('imageCount'), i('createdAt')]
const IMAGE_F = [n('id'), n('seriesId'), n('instanceNumber'), t('imagePath'), i('createdAt')]
const STAFF_F = [p('who'), t('role')]
const ACCESS_F = [n('id'), i('at'), p('who'), n('studyId'), t('action')]
const ROLE_F = [t('role')]

// ── Decoders ──
export const decodeWorklist = (h: string) => decodeVecRecord(h, WORKLIST_F) as unknown as WorklistRow[]
export const decodePatients = (h: string) => decodeVecRecord(h, PATIENT_F) as unknown as PatientRow[]
export const decodePatientHeader = (h: string) => (decodeVecRecord(h, PATIENT_HEADER_F) as unknown as PatientHeader[])[0]
export const decodeStudyRows = (h: string) => decodeVecRecord(h, STUDY_ROW_F) as unknown as StudyRow[]
export const decodeStudyDetail = (h: string) => (decodeVecRecord(h, STUDY_DETAIL_F) as unknown as StudyDetail[])[0]
export const decodeSeries = (h: string) => decodeVecRecord(h, SERIES_F) as unknown as SeriesRow[]
export const decodeImages = (h: string) => decodeVecRecord(h, IMAGE_F) as unknown as ImageRow[]
export const decodeStaff = (h: string) => decodeVecRecord(h, STAFF_F) as unknown as StaffRow[]
export const decodeAccess = (h: string) => decodeVecRecord(h, ACCESS_F) as unknown as AccessRow[]
export const decodeRole = (h: string): string => (decodeVecRecord(h, ROLE_F) as unknown as { role: string }[])[0]?.role ?? 'none'
/** A bare Nat reply (count queries), tolerant of an empty/rejected reply. */
export const decodeNatReplySafe = (h: string): bigint => { try { return decodeNat(h) } catch { return 0n } }

// ── Query method names + arg builders ──
export const M = {
  worklist: 'worklistView', studyCount: 'studyCount',
  patients: 'patientsView', patientCount: 'patientCount', patient: 'patientView',
  studiesForPatient: 'studiesForPatientView', study: 'studyView',
  seriesForStudy: 'seriesForStudyView', studyImages: 'studyImagesView',
  staff: 'staffView', myRole: 'myRole',
  accessLog: 'accessLogView', accessLogCount: 'accessLogCount',
} as const

export const pageArgs = (offset: number, limit: number) =>
  encodeArgs([{ type: 'nat', value: BigInt(offset) }, { type: 'nat', value: BigInt(limit) }])
export const idArg = (id: bigint) => encodeArg({ type: 'nat', value: id })

// ── Writes (all OrTrap — throw the guard reason) ──
export async function claimOwner() { await update(XRAY_CID, 'claimOwner') }

export async function addPatient(mrn: string, name: string, sex: string, birthYear: number): Promise<bigint> {
  const r = await update(XRAY_CID, 'addPatientOrTrap', encodeArgs([
    { type: 'text', value: mrn }, { type: 'text', value: name }, { type: 'text', value: sex }, { type: 'nat', value: BigInt(birthYear) },
  ]))
  return decodeNat(r.reply_hex ?? r.reply ?? '')
}
export async function addStudy(patientId: bigint, modality: string, bodyPart: string, description: string): Promise<bigint> {
  const r = await update(XRAY_CID, 'addStudyOrTrap', encodeArgs([
    { type: 'nat', value: patientId }, { type: 'text', value: modality }, { type: 'text', value: bodyPart }, { type: 'text', value: description },
  ]))
  return decodeNat(r.reply_hex ?? r.reply ?? '')
}
export async function addSeries(studyId: bigint, description: string): Promise<bigint> {
  const r = await update(XRAY_CID, 'addSeriesOrTrap', encodeArgs([{ type: 'nat', value: studyId }, { type: 'text', value: description }]))
  return decodeNat(r.reply_hex ?? r.reply ?? '')
}
export async function addImage(seriesId: bigint, imagePath: string, instanceNumber: number): Promise<bigint> {
  const r = await update(XRAY_CID, 'addImageOrTrap', encodeArgs([
    { type: 'nat', value: seriesId }, { type: 'text', value: imagePath }, { type: 'nat', value: BigInt(instanceNumber) },
  ]))
  return decodeNat(r.reply_hex ?? r.reply ?? '')
}
export async function saveReport(studyId: bigint, findings: string, impression: string) {
  await update(XRAY_CID, 'saveReportOrTrap', encodeArgs([{ type: 'nat', value: studyId }, { type: 'text', value: findings }, { type: 'text', value: impression }]))
}
export async function finalizeReport(studyId: bigint) {
  await update(XRAY_CID, 'finalizeReportOrTrap', idArg(studyId))
}
/** Log an audited access to a study (called when the viewer opens it). */
export async function openStudy(studyId: bigint) {
  await update(XRAY_CID, 'openStudyOrTrap', idArg(studyId))
}
export async function assignRole(who: string, role: string) {
  await update(XRAY_CID, 'assignRoleOrTrap', encodeArgs([{ type: 'principal', value: who }, { type: 'text', value: role }]))
}
export async function revokeRole(who: string) {
  await update(XRAY_CID, 'revokeRoleOrTrap', encodeArg({ type: 'principal', value: who }))
}
export async function seedDemo(): Promise<boolean> {
  const r = await update(XRAY_CID, 'seedDemo')
  // seedDemo returns Bool (false if a worklist already exists).
  try { return decodeBool(r.reply_hex ?? r.reply ?? '') } catch { return false }
}

export { query, XRAY_CID }
