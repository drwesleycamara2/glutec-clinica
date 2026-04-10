#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html as html_lib
import io
import json
import mimetypes
import os
import re
import subprocess
import sys
import zipfile
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Tuple

SOURCE_SYSTEM = "prontuario_verde"
PATIENT_SOURCE_TABLE = "exp_paciente"
APPOINTMENT_SOURCE_TABLE = "exp_agenda"
RECORD_SOURCE_TABLE = "exp_paciente_evolucao"
PRESCRIPTION_SOURCE_TABLE = "exp_paciente_prescricao"
CONTRACT_SOURCE_TABLE = "exp_contrato_termo"


@dataclass
class ImportStats:
    total_rows: int = 0
    processed_rows: int = 0
    inserted_rows: int = 0
    updated_rows: int = 0
    skipped_rows: int = 0
    error_rows: int = 0


class MysqlCli:
    def __init__(self, mysql_bin: str, host: str, port: int, user: str, database: str):
        self.base_cmd = [
            mysql_bin,
            "--default-character-set=utf8mb4",
            "-N",
            "-B",
            "-h",
            host,
            "-P",
            str(port),
            "-u",
            user,
            database,
            "-e",
        ]
        self._cols: Dict[str, List[str]] = {}

    def query(self, sql_text: str) -> List[List[str]]:
        result = subprocess.run([*self.base_cmd, sql_text], check=True, capture_output=True, text=True)
        lines = [line for line in result.stdout.splitlines() if line.strip()]
        return [line.split("\t") for line in lines]

    def scalar(self, sql_text: str) -> Optional[str]:
        rows = self.query(sql_text)
        return rows[0][0] if rows and rows[0] else None

    def execute(self, sql_text: str) -> None:
        subprocess.run([*self.base_cmd, sql_text], check=True, capture_output=True, text=True)

    def insert_id(self, sql_text: str) -> int:
        value = self.scalar(f"{sql_text}; SELECT LAST_INSERT_ID();")
        if value is None:
            raise RuntimeError("LAST_INSERT_ID indisponivel.")
        return int(value)

    def columns(self, table_name: str) -> List[str]:
        if table_name not in self._cols:
            self._cols[table_name] = [row[0] for row in self.query(f"SHOW COLUMNS FROM `{table_name}`")]
        return self._cols[table_name]


def sql_literal(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    escaped = str(value).replace("\\", "\\\\").replace("'", "''")
    return f"'{escaped}'"


def payload_for(mysql: MysqlCli, table_name: str, payload: Dict[str, object]) -> Dict[str, object]:
    cols = set(mysql.columns(table_name))
    return {key: value for key, value in payload.items() if key in cols}


def insert_sql(table_name: str, payload: Dict[str, object]) -> str:
    keys = ", ".join(f"`{key}`" for key in payload)
    values = ", ".join(sql_literal(value) for value in payload.values())
    return f"INSERT INTO `{table_name}` ({keys}) VALUES ({values})"


def clean_digits(value: Optional[str]) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def parse_date(value: Optional[str]) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw or raw in {"00/00/0000", "00/00/00"}:
        return None
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def parse_datetime(value: Optional[str]) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M.%S", "%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass
    return None


def normalize_text(value: Optional[str]) -> Optional[str]:
    raw = str(value or "").strip()
    return raw or None


def html_to_text(value: Optional[str]) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    raw = re.sub(r"<br\s*/?>", "\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"</p\s*>", "\n\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"</li\s*>", "\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"<li[^>]*>", "- ", raw, flags=re.IGNORECASE)
    raw = re.sub(r"<[^>]+>", "", raw)
    raw = html_lib.unescape(raw)
    raw = re.sub(r"\r\n?", "\n", raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    raw = re.sub(r"[ \t]+", " ", raw)
    return raw.strip() or None


def split_sections(text: Optional[str]) -> Dict[str, str]:
    plain = html_to_text(text)
    if not plain:
        return {}
    normalized = plain.replace("Moléstia", "Molestia").replace("Histórico", "Historico")
    normalized = normalized.replace("Exame Físico", "Exame Fisico").replace("Diagnósticos", "Diagnosticos")
    headings = [
        "Queixa Principal",
        "Molestia Atual",
        "Historico e Antecedentes",
        "Historico",
        "Exame Fisico",
        "Diagnosticos",
        "Diagnostico",
        "Condutas",
    ]
    pattern = re.compile(r"(?P<title>%s)\s*:\s*" % "|".join(re.escape(item) for item in headings))
    matches = list(pattern.finditer(normalized))
    if not matches:
        return {}
    sections: Dict[str, str] = {}
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(normalized)
        content = normalized[start:end].strip(" \n:-")
        if content:
            sections[match.group("title")] = content
    return sections


def read_csv_from_zip(zf: zipfile.ZipFile, entry_name: str) -> List[Dict[str, str]]:
    with zf.open(entry_name) as handle:
        text = io.TextIOWrapper(handle, encoding="iso-8859-1", newline="")
        reader = csv.DictReader(text, delimiter=";")
        return [dict(row) for row in reader]


def build_attachment_index(zf: zipfile.ZipFile) -> Dict[str, zipfile.ZipInfo]:
    index: Dict[str, zipfile.ZipInfo] = {}
    for info in zf.infolist():
        if info.is_dir():
            continue
        normalized = info.filename.replace("\\", "/").lstrip("./")
        index[normalized] = info
    return index


def iter_attachment_candidates(reference: str) -> Iterable[str]:
    ref = (reference or "").strip().replace("\\", "/")
    if not ref:
        return
    if ":" in ref:
        ref = ref.split(":", 1)[1]
    if ";" in ref:
        ref = ref.split(";", 1)[1]
    ref = ref.lstrip("/")
    if not ref:
        return
    yield ref
    if ref.startswith("8152/"):
        short_ref = ref[len("8152/") :]
        yield short_ref
        yield f"prontuarioverde-anexos/{short_ref}"
        yield f"prontuarioverde-documentos/{short_ref}"
    yield f"prontuarioverde-anexos/{ref}"
    yield f"prontuarioverde-documentos/{ref}"


def resolve_attachment(attachment_index: Dict[str, zipfile.ZipInfo], reference: str) -> Optional[zipfile.ZipInfo]:
    for candidate in iter_attachment_candidates(reference):
        info = attachment_index.get(candidate)
        if info:
            return info
    return None


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def build_relative_attachment_path(info: zipfile.ZipInfo, patient_source_id: str) -> str:
    normalized = info.filename.replace("\\", "/").lstrip("./")
    parts = [part for part in normalized.split("/") if part]
    if patient_source_id in parts:
        start = parts.index(patient_source_id)
        return "/".join(parts[start:])
    return f"{patient_source_id}/{os.path.basename(normalized)}"


def extract_attachment(
    zf: zipfile.ZipFile,
    info: zipfile.ZipInfo,
    extract_root: str,
    patient_source_id: str,
) -> Tuple[str, str, Optional[str], int]:
    relative_path = build_relative_attachment_path(info, patient_source_id)
    output_path = os.path.join(extract_root, *relative_path.split("/"))
    ensure_dir(os.path.dirname(output_path))
    if not os.path.exists(output_path):
        with zf.open(info) as src, open(output_path, "wb") as dst:
            dst.write(src.read())
    public_path = f"/imports/prontuario-verde/{relative_path}"
    mime_type, _ = mimetypes.guess_type(info.filename)
    return public_path, relative_path, mime_type, info.file_size


def register_job(mysql: MysqlCli, file_name: str, file_size: int, created_by: int) -> int:
    return mysql.insert_id(
        "INSERT INTO import_jobs (sourceSystem, fileName, fileSize, status, createdBy, startedAt) VALUES "
        f"({sql_literal(SOURCE_SYSTEM)}, {sql_literal(file_name)}, {file_size}, 'processing', {created_by}, NOW())"
    )


def finish_job(mysql: MysqlCli, job_id: int, stats: ImportStats, status: str, errors: List[str]) -> None:
    mysql.execute(
        "UPDATE import_jobs SET "
        f"status = {sql_literal(status)}, totalRows = {stats.total_rows}, processedRows = {stats.processed_rows}, "
        f"insertedRows = {stats.inserted_rows}, updatedRows = {stats.updated_rows}, skippedRows = {stats.skipped_rows}, "
        f"errorRows = {stats.error_rows}, errorDetails = {sql_literal(json.dumps(errors[:80], ensure_ascii=False)) if errors else 'NULL'}, "
        "completedAt = NOW() "
        f"WHERE id = {job_id}"
    )


def log_import(mysql: MysqlCli, table_name: str, source_id: Optional[str], new_id: Optional[int], action: str, notes: Optional[str] = None) -> None:
    mysql.execute(
        "INSERT INTO import_log (sourceSystem, tableName, sourceId, newId, action, notes) VALUES "
        f"({sql_literal(SOURCE_SYSTEM)}, {sql_literal(table_name)}, {sql_literal(source_id)}, {sql_literal(new_id)}, {sql_literal(action)}, {sql_literal(notes)})"
    )


def map_id(mysql: MysqlCli, source_table: str, source_id: Optional[str]) -> Optional[int]:
    if not source_id:
        return None
    mapped = mysql.scalar(
        "SELECT targetId FROM import_id_map "
        f"WHERE sourceSystem = {sql_literal(SOURCE_SYSTEM)} AND sourceTable = {sql_literal(source_table)} AND sourceId = {sql_literal(str(source_id))} "
        "LIMIT 1"
    )
    return int(mapped) if mapped else None


def save_map(mysql: MysqlCli, source_table: str, source_id: str, target_table: str, target_id: int) -> None:
    mysql.execute(
        "INSERT INTO import_id_map (sourceSystem, sourceTable, sourceId, targetTable, targetId) VALUES "
        f"({sql_literal(SOURCE_SYSTEM)}, {sql_literal(source_table)}, {sql_literal(source_id)}, {sql_literal(target_table)}, {target_id}) "
        "ON DUPLICATE KEY UPDATE "
        f"targetId = {target_id}, importedAt = NOW()"
    )


def find_existing_document(mysql: MysqlCli, file_key: str) -> Optional[int]:
    existing = mysql.scalar(
        "SELECT id FROM patient_documents "
        f"WHERE fileKey = {sql_literal(file_key)} LIMIT 1"
    )
    return int(existing) if existing else None


def find_existing_appointment(mysql: MysqlCli, patient_id: int, scheduled_at: str) -> Optional[int]:
    existing = mysql.scalar(
        "SELECT id FROM appointments "
        f"WHERE patientId = {patient_id} AND scheduledAt = {sql_literal(scheduled_at)} "
        "ORDER BY id ASC LIMIT 1"
    )
    return int(existing) if existing else None


def find_existing_record_same_day(mysql: MysqlCli, patient_id: int, date_value: str) -> Optional[int]:
    existing = mysql.scalar(
        "SELECT id FROM medical_records "
        f"WHERE patientId = {patient_id} AND date = {sql_literal(date_value)} "
        "ORDER BY id ASC LIMIT 1"
    )
    return int(existing) if existing else None


def find_existing_prescription_same_day(mysql: MysqlCli, patient_id: int, date_value: str, content: Optional[str]) -> Optional[int]:
    normalized_content = normalize_text(content)
    if normalized_content:
        existing = mysql.scalar(
            "SELECT id FROM prescriptions "
            f"WHERE patientId = {patient_id} AND date = {sql_literal(date_value)} AND content = {sql_literal(normalized_content)} "
            "ORDER BY id ASC LIMIT 1"
        )
        if existing:
            return int(existing)
    existing = mysql.scalar(
        "SELECT id FROM prescriptions "
        f"WHERE patientId = {patient_id} AND date = {sql_literal(date_value)} "
        "ORDER BY id ASC LIMIT 1"
    )
    return int(existing) if existing else None


def find_appointment_id_for_date(mysql: MysqlCli, patient_id: int, date_value: Optional[str]) -> Optional[int]:
    if not date_value:
        return None
    existing = mysql.scalar(
        "SELECT id FROM appointments "
        f"WHERE patientId = {patient_id} AND DATE(scheduledAt) = {sql_literal(date_value)} "
        "ORDER BY scheduledAt ASC, id ASC LIMIT 1"
    )
    return int(existing) if existing else None


def status_from_legacy(value: Optional[str]) -> str:
    mapping = {
        "agendado": "agendada",
        "confirmado": "confirmada",
        "confirmar": "agendada",
        "atendido": "concluida",
        "cancelado": "cancelada",
        "faltou": "falta",
    }
    return mapping.get(str(value or "").strip().lower(), "agendada")


def build_appointment_notes(row: Dict[str, str]) -> Optional[str]:
    notes: List[str] = []
    procedure = normalize_text(row.get("Procedimento"))
    observations = normalize_text(row.get("Observações"))
    professional = normalize_text(row.get("Profissional"))
    if procedure:
        notes.append(f"Procedimento/objetivo: {procedure}")
    if observations:
        notes.append(observations)
    if professional:
        notes.append(f"Profissional no legado: {professional}")
    return "\n".join(notes) if notes else None


def import_appointments(mysql: MysqlCli, rows: List[Dict[str, str]], doctor_id: int, created_by: int, stats: ImportStats) -> None:
    for index, row in enumerate(rows, start=1):
        source_id = f"{row.get('PAC_ID') or ''}:{index}"
        if map_id(mysql, APPOINTMENT_SOURCE_TABLE, source_id):
            stats.skipped_rows += 1
            continue

        patient_source_id = str(row.get("PAC_ID") or "").strip()
        patient_id = map_id(mysql, PATIENT_SOURCE_TABLE, patient_source_id)
        scheduled_at = parse_datetime(row.get("Data"))
        if not patient_id or not scheduled_at:
            stats.skipped_rows += 1
            continue

        existing_id = find_existing_appointment(mysql, patient_id, scheduled_at)
        if existing_id:
            mysql.execute(
                "UPDATE appointments SET "
                f"`notes` = CASE WHEN (`notes` IS NULL OR `notes` = '') THEN {sql_literal(build_appointment_notes(row))} ELSE `notes` END, "
                f"`type` = CASE WHEN (`type` IS NULL OR `type` = '') THEN {sql_literal(normalize_text(row.get('Tipo')) or normalize_text(row.get('Procedimento')) or 'consulta')} ELSE `type` END "
                f"WHERE id = {existing_id}"
            )
            save_map(mysql, APPOINTMENT_SOURCE_TABLE, source_id, "appointments", existing_id)
            log_import(mysql, APPOINTMENT_SOURCE_TABLE, source_id, existing_id, "updated", "Agenda relacionada a um agendamento ja existente.")
            stats.updated_rows += 1
            stats.processed_rows += 1
            continue

        duration = int(clean_digits(row.get("Duração")) or "30")
        payload = payload_for(
            mysql,
            "appointments",
            {
                "patientId": patient_id,
                "doctorId": doctor_id,
                "scheduledAt": scheduled_at,
                "duration": duration,
                "type": normalize_text(row.get("Tipo")) or normalize_text(row.get("Procedimento")) or "consulta",
                "status": status_from_legacy(row.get("Situação")),
                "notes": build_appointment_notes(row),
                "room": normalize_text(row.get("Consultório")),
                "sourceSystem": SOURCE_SYSTEM,
                "sourceId": source_id,
                "createdBy": created_by,
                "createdAt": scheduled_at,
            },
        )
        appointment_id = mysql.insert_id(insert_sql("appointments", payload))
        save_map(mysql, APPOINTMENT_SOURCE_TABLE, source_id, "appointments", appointment_id)
        log_import(mysql, APPOINTMENT_SOURCE_TABLE, source_id, appointment_id, "inserted", "Agendamento importado do Prontuario Verde.")
        stats.inserted_rows += 1
        stats.processed_rows += 1


def import_record_document(
    mysql: MysqlCli,
    attachments_zip: zipfile.ZipFile,
    attachment_index: Dict[str, zipfile.ZipInfo],
    extract_root: str,
    patient_id: int,
    patient_source_id: str,
    medical_record_id: Optional[int],
    source_table: str,
    source_id: str,
    reference: str,
    title: str,
    doc_type: str,
    created_at: Optional[str],
    stats: ImportStats,
) -> None:
    info = resolve_attachment(attachment_index, reference)
    if not info:
        return

    public_url, file_key, mime_type, file_size = extract_attachment(attachments_zip, info, extract_root, patient_source_id)
    existing_document_id = find_existing_document(mysql, file_key)
    if existing_document_id:
        save_map(mysql, f"{source_table}_document", source_id, "patient_documents", existing_document_id)
        return

    payload = payload_for(
        mysql,
        "patient_documents",
        {
            "patientId": patient_id,
            "medicalRecordId": medical_record_id,
            "type": doc_type,
            "name": title,
            "description": "Documento legado importado do Prontuario Verde.",
            "fileUrl": public_url,
            "fileKey": file_key,
            "fileSize": file_size,
            "mimeType": mime_type or "application/pdf",
            "sourceSystem": SOURCE_SYSTEM,
            "sourceId": source_id,
            "createdAt": created_at,
        },
    )
    document_id = mysql.insert_id(insert_sql("patient_documents", payload))
    save_map(mysql, f"{source_table}_document", source_id, "patient_documents", document_id)
    log_import(mysql, source_table, source_id, document_id, "inserted", title)
    stats.inserted_rows += 1


def import_medical_records(
    mysql: MysqlCli,
    rows: List[Dict[str, str]],
    attachments_zip: zipfile.ZipFile,
    attachment_index: Dict[str, zipfile.ZipInfo],
    extract_root: str,
    doctor_id: int,
    created_by: int,
    stats: ImportStats,
) -> None:
    for index, row in enumerate(rows, start=1):
        source_id = f"{row.get('PAC_ID') or ''}:{index}"
        if map_id(mysql, RECORD_SOURCE_TABLE, source_id):
            stats.skipped_rows += 1
            continue

        patient_source_id = str(row.get("PAC_ID") or "").strip()
        patient_id = map_id(mysql, PATIENT_SOURCE_TABLE, patient_source_id)
        date_value = parse_date(row.get("Data"))
        if not patient_id or not date_value:
            stats.skipped_rows += 1
            continue

        plain = html_to_text(row.get("Evolução HTML"))
        sections = split_sections(row.get("Evolução HTML"))
        anamnesis = "\n\n".join(
            part for part in [
                sections.get("Molestia Atual"),
                sections.get("Historico e Antecedentes"),
                sections.get("Historico"),
            ]
            if part
        ) or None
        existing_record_id = find_existing_record_same_day(mysql, patient_id, date_value)
        if existing_record_id:
            save_map(mysql, RECORD_SOURCE_TABLE, source_id, "medical_records", existing_record_id)
            log_import(mysql, RECORD_SOURCE_TABLE, source_id, existing_record_id, "skipped", "Atendimento legado ja associado ao prontuario atual.")
            stats.skipped_rows += 1
            stats.processed_rows += 1
            import_record_document(
                mysql,
                attachments_zip,
                attachment_index,
                extract_root,
                patient_id,
                patient_source_id,
                existing_record_id,
                RECORD_SOURCE_TABLE,
                source_id,
                row.get("DOCUMENTO") or "",
                f"Evolucao clinica de {date_value}",
                "evolucao_pdf",
                parse_datetime(row.get("Data Registro")) or f"{date_value} 00:00:00",
                stats,
            )
            continue

        payload = payload_for(
            mysql,
            "medical_records",
            {
                "patientId": patient_id,
                "doctorId": doctor_id,
                "appointmentId": find_appointment_id_for_date(mysql, patient_id, date_value),
                "date": date_value,
                "chiefComplaint": sections.get("Queixa Principal"),
                "anamnesis": anamnesis,
                "physicalExam": sections.get("Exame Fisico"),
                "diagnosis": sections.get("Diagnosticos") or sections.get("Diagnostico"),
                "plan": sections.get("Condutas"),
                "evolution": plain,
                "notes": normalize_text(row.get("Procedimentos")),
                "status": "finalizado",
                "sourceSystem": SOURCE_SYSTEM,
                "sourceId": source_id,
                "createdBy": created_by,
                "createdAt": parse_datetime(row.get("Data Registro")) or f"{date_value} 00:00:00",
            },
        )
        medical_record_id = mysql.insert_id(insert_sql("medical_records", payload))
        save_map(mysql, RECORD_SOURCE_TABLE, source_id, "medical_records", medical_record_id)
        log_import(mysql, RECORD_SOURCE_TABLE, source_id, medical_record_id, "inserted", "Evolucao clinica importada do Prontuario Verde.")
        stats.inserted_rows += 1
        stats.processed_rows += 1

        import_record_document(
            mysql,
            attachments_zip,
            attachment_index,
            extract_root,
            patient_id,
            patient_source_id,
            medical_record_id,
            RECORD_SOURCE_TABLE,
            source_id,
            row.get("DOCUMENTO") or "",
            f"Evolucao clinica de {date_value}",
            "evolucao_pdf",
            parse_datetime(row.get("Data Registro")) or f"{date_value} 00:00:00",
            stats,
        )


def import_prescriptions(
    mysql: MysqlCli,
    rows: List[Dict[str, str]],
    attachments_zip: zipfile.ZipFile,
    attachment_index: Dict[str, zipfile.ZipInfo],
    extract_root: str,
    doctor_id: int,
    stats: ImportStats,
) -> None:
    for index, row in enumerate(rows, start=1):
        source_id = f"{row.get('PAC_ID') or ''}:{index}"
        if map_id(mysql, PRESCRIPTION_SOURCE_TABLE, source_id):
            stats.skipped_rows += 1
            continue

        patient_source_id = str(row.get("PAC_ID") or "").strip()
        patient_id = map_id(mysql, PATIENT_SOURCE_TABLE, patient_source_id)
        date_value = parse_date(row.get("Data"))
        if not patient_id or not date_value:
            stats.skipped_rows += 1
            continue

        content = html_to_text(row.get("Prescrição"))
        existing_id = find_existing_prescription_same_day(mysql, patient_id, date_value, content)
        if existing_id:
            save_map(mysql, PRESCRIPTION_SOURCE_TABLE, source_id, "prescriptions", existing_id)
            log_import(mysql, PRESCRIPTION_SOURCE_TABLE, source_id, existing_id, "skipped", "Prescricao ja existente para o paciente.")
            stats.skipped_rows += 1
            stats.processed_rows += 1
        else:
            payload = payload_for(
                mysql,
                "prescriptions",
                {
                    "patientId": patient_id,
                    "doctorId": doctor_id,
                    "appointmentId": find_appointment_id_for_date(mysql, patient_id, date_value),
                    "medicalRecordId": find_existing_record_same_day(mysql, patient_id, date_value),
                    "date": date_value,
                    "content": content or normalize_text(row.get("Tipo")) or "Prescricao legada importada.",
                    "medications": content,
                    "status": "finalizado",
                    "sourceSystem": SOURCE_SYSTEM,
                    "sourceId": source_id,
                    "createdAt": parse_datetime(row.get("Data Registro")) or f"{date_value} 00:00:00",
                },
            )
            prescription_id = mysql.insert_id(insert_sql("prescriptions", payload))
            save_map(mysql, PRESCRIPTION_SOURCE_TABLE, source_id, "prescriptions", prescription_id)
            log_import(mysql, PRESCRIPTION_SOURCE_TABLE, source_id, prescription_id, "inserted", "Prescricao importada do Prontuario Verde.")
            stats.inserted_rows += 1
            stats.processed_rows += 1

        info = resolve_attachment(attachment_index, row.get("DOCUMENTO") or "")
        if not info:
            continue
        public_url, file_key, mime_type, file_size = extract_attachment(attachments_zip, info, extract_root, patient_source_id)
        existing_document_id = find_existing_document(mysql, file_key)
        if existing_document_id:
            save_map(mysql, f"{PRESCRIPTION_SOURCE_TABLE}_document", source_id, "patient_documents", existing_document_id)
            continue

        doc_type = "solicitacao_exames" if "exame" in str(row.get("Tipo") or "").lower() else "prescricao"
        payload = payload_for(
            mysql,
            "patient_documents",
            {
                "patientId": patient_id,
                "type": doc_type,
                "name": f"{row.get('Tipo') or 'Prescricao'} de {date_value}",
                "description": normalize_text(row.get("Tipo")) or "Documento de prescricao legado.",
                "fileUrl": public_url,
                "fileKey": file_key,
                "fileSize": file_size,
                "mimeType": mime_type or "application/pdf",
                "sourceSystem": SOURCE_SYSTEM,
                "sourceId": source_id,
                "createdAt": parse_datetime(row.get("Data Registro")) or f"{date_value} 00:00:00",
            },
        )
        document_id = mysql.insert_id(insert_sql("patient_documents", payload))
        save_map(mysql, f"{PRESCRIPTION_SOURCE_TABLE}_document", source_id, "patient_documents", document_id)
        log_import(mysql, PRESCRIPTION_SOURCE_TABLE, source_id, document_id, "inserted", "Documento de prescricao importado.")
        stats.inserted_rows += 1


def import_contracts(
    mysql: MysqlCli,
    rows: List[Dict[str, str]],
    attachments_zip: zipfile.ZipFile,
    attachment_index: Dict[str, zipfile.ZipInfo],
    extract_root: str,
    stats: ImportStats,
) -> None:
    for index, row in enumerate(rows, start=1):
        source_id = f"{row.get('PAC_ID') or ''}:{index}"
        if map_id(mysql, CONTRACT_SOURCE_TABLE, source_id):
            stats.skipped_rows += 1
            continue

        patient_source_id = str(row.get("PAC_ID") or "").strip()
        patient_id = map_id(mysql, PATIENT_SOURCE_TABLE, patient_source_id)
        if not patient_id:
            stats.skipped_rows += 1
            continue

        info = resolve_attachment(attachment_index, row.get("Documento") or "")
        if not info:
            stats.skipped_rows += 1
            log_import(mysql, CONTRACT_SOURCE_TABLE, source_id, None, "skipped", "Arquivo do contrato nao encontrado no ZIP de anexos.")
            continue

        public_url, file_key, mime_type, file_size = extract_attachment(attachments_zip, info, extract_root, patient_source_id)
        existing_document_id = find_existing_document(mysql, file_key)
        if existing_document_id:
            save_map(mysql, CONTRACT_SOURCE_TABLE, source_id, "patient_documents", existing_document_id)
            stats.skipped_rows += 1
            continue

        issued_at = parse_date(row.get("Emitido"))
        signed_at = parse_date(row.get("Assinado em"))
        description_parts = [
            f"Tipo: {row.get('Tipo')}" if normalize_text(row.get("Tipo")) else None,
            f"Assinado em: {signed_at}" if signed_at else None,
            f"Assinado por: {row.get('Assinado por')}" if normalize_text(row.get("Assinado por")) else None,
        ]
        payload = payload_for(
            mysql,
            "patient_documents",
            {
                "patientId": patient_id,
                "type": "termo",
                "name": f"{row.get('Tipo') or 'Contrato'} de {issued_at or signed_at or 'data nao informada'}",
                "description": "\n".join(part for part in description_parts if part) or "Contrato legado importado do Prontuario Verde.",
                "fileUrl": public_url,
                "fileKey": file_key,
                "fileSize": file_size,
                "mimeType": mime_type or "application/pdf",
                "sourceSystem": SOURCE_SYSTEM,
                "sourceId": source_id,
                "createdAt": f"{signed_at or issued_at or '2000-01-01'} 00:00:00",
            },
        )
        document_id = mysql.insert_id(insert_sql("patient_documents", payload))
        save_map(mysql, CONTRACT_SOURCE_TABLE, source_id, "patient_documents", document_id)
        log_import(mysql, CONTRACT_SOURCE_TABLE, source_id, document_id, "inserted", "Contrato/termo importado do Prontuario Verde.")
        stats.inserted_rows += 1
        stats.processed_rows += 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Importa historico clinico legado do Prontuario Verde.")
    parser.add_argument("--data-zip", required=True)
    parser.add_argument("--attachments-zip", required=True)
    parser.add_argument("--extract-dir", default=os.path.join("public", "imports", "prontuario-verde"))
    parser.add_argument("--mysql-bin", default="mysql")
    parser.add_argument("--db-host", default="127.0.0.1")
    parser.add_argument("--db-port", type=int, default=3306)
    parser.add_argument("--db-user", default="root")
    parser.add_argument("--db-name", default="glutec")
    parser.add_argument("--doctor-id", type=int, default=1)
    parser.add_argument("--created-by", type=int, default=1)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    mysql = MysqlCli(args.mysql_bin, args.db_host, args.db_port, args.db_user, args.db_name)
    stats = ImportStats()
    errors: List[str] = []

    data_size = os.path.getsize(args.data_zip)
    attachments_size = os.path.getsize(args.attachments_zip)
    job_id = register_job(
        mysql,
        file_name=f"{os.path.basename(args.data_zip)} + historico clinico",
        file_size=data_size + attachments_size,
        created_by=args.created_by,
    )

    try:
        with zipfile.ZipFile(args.data_zip) as data_zip, zipfile.ZipFile(args.attachments_zip) as attachments_zip:
            appointments = read_csv_from_zip(data_zip, "exp_agenda_8152_20260312-010952.csv")
            records = read_csv_from_zip(data_zip, "exp_paciente_evolucao_8152_20260312-010951.csv")
            prescriptions = read_csv_from_zip(data_zip, "exp_paciente_prescricao_8152_20260312-010951.csv")
            contracts = read_csv_from_zip(data_zip, "exp_contrato_termo_8152_20260312-010953.csv")
            attachment_index = build_attachment_index(attachments_zip)

            stats.total_rows = len(appointments) + len(records) + len(prescriptions) + len(contracts)
            import_appointments(mysql, appointments, args.doctor_id, args.created_by, stats)
            import_medical_records(mysql, records, attachments_zip, attachment_index, args.extract_dir, args.doctor_id, args.created_by, stats)
            import_prescriptions(mysql, prescriptions, attachments_zip, attachment_index, args.extract_dir, args.doctor_id, stats)
            import_contracts(mysql, contracts, attachments_zip, attachment_index, args.extract_dir, stats)

        finish_job(mysql, job_id, stats, "partial" if errors else "completed", errors)
        print(json.dumps({"status": "ok", "jobId": job_id, "stats": stats.__dict__, "errors": errors[:20]}, ensure_ascii=False))
        return 0
    except Exception as exc:
        errors.append(str(exc))
        stats.error_rows += 1
        finish_job(mysql, job_id, stats, "failed", errors)
        raise


if __name__ == "__main__":
    sys.exit(main())
