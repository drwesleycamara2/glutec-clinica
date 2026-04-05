#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html
import json
import mimetypes
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

SOURCE_SYSTEM = "ondoctor"


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

    def has(self, table_name: str, column_name: str) -> bool:
        return column_name in self.columns(table_name)


def sql_literal(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    escaped = str(value).replace("\\", "\\\\").replace("'", "''")
    return f"'{escaped}'"


def clean_digits(value: Optional[str]) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def clean_document(value: Optional[str]) -> Optional[str]:
    digits = clean_digits(value)
    return digits if len(digits) in {11, 14} else None


def clean_phone(value: Optional[str]) -> Optional[str]:
    digits = clean_digits(value)
    return digits or None


def clean_zip(value: Optional[str]) -> Optional[str]:
    digits = clean_digits(value)
    return digits[:8] if digits else None


def parse_bool(value: Optional[str]) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "sim", "yes"}


def parse_date(value: Optional[str]) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def parse_time(value: Optional[str]) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(raw, fmt).strftime("%H:%M:%S")
        except ValueError:
            pass
    return None


def dt(date_value: Optional[str], time_value: Optional[str]) -> Optional[str]:
    date_part = parse_date(date_value)
    time_part = parse_time(time_value) or "00:00:00"
    return f"{date_part} {time_part}" if date_part else None


def cents(value: Optional[str]) -> int:
    raw = str(value or "").strip()
    if not raw:
        return 0
    raw = raw.replace(".", "").replace(",", ".")
    try:
        return int(round(float(raw) * 100))
    except ValueError:
        return 0


def plain_text(value: Optional[str]) -> Optional[str]:
    raw = str(value or "").strip()
    if not raw:
        return None
    raw = re.sub(r"<br\s*/?>", "\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"</p\s*>", "\n\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"<[^>]+>", "", raw)
    raw = html.unescape(raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    return raw.strip() or None


def payload_for(mysql: MysqlCli, table_name: str, payload: Dict[str, object]) -> Dict[str, object]:
    cols = set(mysql.columns(table_name))
    return {key: value for key, value in payload.items() if key in cols}


def insert_sql(table_name: str, payload: Dict[str, object]) -> str:
    keys = ", ".join(f"`{key}`" for key in payload)
    values = ", ".join(sql_literal(value) for value in payload.values())
    return f"INSERT INTO `{table_name}` ({keys}) VALUES ({values})"


def update_sql(table_name: str, row_id: int, payload: Dict[str, object]) -> str:
    sets = ", ".join(f"`{key}` = {sql_literal(value)}" for key, value in payload.items())
    return f"UPDATE `{table_name}` SET {sets} WHERE id = {row_id}"


def register_job(mysql: MysqlCli, source_name: str, file_size: int, created_by: int) -> int:
    return mysql.insert_id(
        "INSERT INTO import_jobs (sourceSystem, fileName, fileSize, status, createdBy, startedAt) VALUES "
        f"({sql_literal(SOURCE_SYSTEM)}, {sql_literal(source_name)}, {file_size}, 'processing', {created_by}, NOW())"
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


def prepare_source(source: Path) -> Tuple[Path, Optional[Path]]:
    if source.is_dir():
        return source, None
    tmp = Path(tempfile.mkdtemp(prefix="glutec-ondoctor-"))
    subprocess.run(["tar", "-xf", str(source), "-C", str(tmp)], check=True)
    entries = [entry for entry in tmp.iterdir() if entry.exists()]
    if len(entries) == 1 and entries[0].is_dir():
        return entries[0], tmp
    return tmp, tmp


def find_file(root: Path, filename: str) -> Path:
    matches = list(root.rglob(filename))
    if not matches:
        raise FileNotFoundError(f"Arquivo nao encontrado: {filename}")
    return matches[0]


def read_csv_rows(path: Path) -> List[Dict[str, str]]:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "latin-1", "cp1252"):
        try:
            text = raw.decode(encoding)
            return [dict(row) for row in csv.DictReader(text.splitlines(), delimiter=";")]
        except UnicodeDecodeError:
            pass
    raise RuntimeError(f"Falha ao decodificar CSV: {path}")


def find_patient(mysql: MysqlCli, source_id: str, cpf: Optional[str], full_name: str, birth_date: Optional[str]) -> Optional[int]:
    mapped = map_id(mysql, "PESSOA", source_id)
    if mapped:
        return mapped
    if mysql.has("patients", "sourceSystem") and mysql.has("patients", "sourceId"):
        direct = mysql.scalar(
            "SELECT id FROM patients "
            f"WHERE sourceSystem = {sql_literal(SOURCE_SYSTEM)} AND sourceId = {sql_literal(source_id)} LIMIT 1"
        )
        if direct:
            return int(direct)
    if cpf:
        cpf_match = mysql.scalar(
            "SELECT id FROM patients "
            f"WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), '/', '') = {sql_literal(cpf)} LIMIT 1"
        )
        if cpf_match:
            return int(cpf_match)
    if full_name and birth_date:
        name_match = mysql.scalar(
            "SELECT id FROM patients "
            f"WHERE UPPER(TRIM(fullName)) = {sql_literal(full_name)} AND birthDate = {sql_literal(birth_date)} LIMIT 1"
        )
        if name_match:
            return int(name_match)
    return None


def upsert_patient(mysql: MysqlCli, row: Dict[str, str], created_by: int, stats: ImportStats) -> Optional[int]:
    source_id = str(row.get("id") or "").strip()
    full_name = " ".join(str(row.get("nome") or "").strip().upper().split())
    if not source_id or not full_name:
        stats.skipped_rows += 1
        return None

    cpf = clean_document(row.get("cnpj_cpf"))
    birth_date = parse_date(row.get("nascimento"))
    patient_id = find_patient(mysql, source_id, cpf, full_name, birth_date)
    address_json = {
        "street": row.get("endereco") or None,
        "number": row.get("numero") or None,
        "complement": row.get("complemento") or None,
        "neighborhood": row.get("bairro") or None,
        "city": row.get("id_cidade") or None,
        "state": None,
        "zip": clean_zip(row.get("CEP")),
    }
    notes = "\n".join(
        note
        for note in [
            f"Observacao OneDoctor: {row['observacao'].strip()}" if row.get("observacao") else None,
            f"Profissao: {row['profissao'].strip()}" if row.get("profissao") else None,
            f"Canal: {row['canal'].strip()}" if row.get("canal") else None,
        ]
        if note
    ) or None

    payload = payload_for(
        mysql,
        "patients",
        {
            "fullName": (row.get("nome") or "").strip(),
            "cpf": cpf,
            "rg": row.get("ie_rg") or None,
            "birthDate": birth_date,
            "gender": {"M": "masculino", "F": "feminino"}.get(str(row.get("sexo") or "").upper(), "nao_informado"),
            "phone": clean_phone(row.get("celular") or row.get("telefone")),
            "phone2": clean_phone(row.get("telefone")),
            "email": row.get("email") or None,
            "address": json.dumps(address_json, ensure_ascii=False) if any(address_json.values()) else None,
            "zipCode": clean_zip(row.get("CEP")),
            "city": row.get("id_cidade") or None,
            "healthInsurance": row.get("convenio_nome_empresa") or None,
            "healthInsuranceNumber": row.get("numero_contrato") or None,
            "insuranceName": row.get("convenio_nome_empresa") or None,
            "insuranceNumber": row.get("numero_contrato") or None,
            "bloodType": row.get("tipo_sanguineo") or None,
            "observations": notes,
            "referralSource": row.get("canal") or None,
            "sourceSystem": SOURCE_SYSTEM,
            "sourceId": source_id,
            "createdBy": created_by,
            "active": 0 if parse_bool(row.get("inativo")) else 1,
        },
    )

    if patient_id:
        update_payload = {key: value for key, value in payload.items() if value not in (None, "", [])}
        if update_payload:
            mysql.execute(update_sql("patients", patient_id, update_payload))
            stats.updated_rows += 1
            log_import(mysql, "PESSOA", source_id, patient_id, "updated", "OneDoctor prevaleceu no cadastro.")
        else:
            stats.skipped_rows += 1
        save_map(mysql, "PESSOA", source_id, "patients", patient_id)
        stats.processed_rows += 1
        return patient_id

    patient_id = mysql.insert_id(insert_sql("patients", payload))
    save_map(mysql, "PESSOA", source_id, "patients", patient_id)
    log_import(mysql, "PESSOA", source_id, patient_id, "inserted", "Paciente criado a partir do OneDoctor.")
    stats.inserted_rows += 1
    stats.processed_rows += 1
    return patient_id


def import_appointments(mysql: MysqlCli, rows: List[Dict[str, str]], doctor_id: int, created_by: int, stats: ImportStats) -> None:
    status_map = {
        "confirmado": "confirmada",
        "confirmar": "agendada",
        "agendado": "agendada",
        "cancelado": "cancelada",
        "faltou": "falta",
        "atendido": "concluida",
        "finalizado": "concluida",
    }
    for row in rows:
        source_id = str(row.get("id") or "").strip()
        if not source_id or map_id(mysql, "AGENDA", source_id):
            stats.skipped_rows += 1
            continue
        patient_id = map_id(mysql, "PESSOA", row.get("id_cliente"))
        scheduled_at = dt(row.get("data"), row.get("horario_ini"))
        if not patient_id or not scheduled_at:
            stats.skipped_rows += 1
            continue
        payload = payload_for(
            mysql,
            "appointments",
            {
                "patientId": patient_id,
                "doctorId": doctor_id,
                "scheduledAt": scheduled_at,
                "durationMinutes": 30,
                "duration": 30,
                "type": "consulta",
                "status": status_map.get(str(row.get("situacao") or "").strip().lower(), "agendada"),
                "notes": row.get("observacao") or None,
                "price": None if not row.get("valor") else cents(row.get("valor")) / 100,
                "sourceSystem": SOURCE_SYSTEM,
                "sourceId": source_id,
                "createdBy": created_by,
                "createdAt": scheduled_at,
            },
        )
        appointment_id = mysql.insert_id(insert_sql("appointments", payload))
        save_map(mysql, "AGENDA", source_id, "appointments", appointment_id)
        log_import(mysql, "AGENDA", source_id, appointment_id, "inserted", "Agenda importada.")
        stats.inserted_rows += 1
        stats.processed_rows += 1


def import_medical_records(mysql: MysqlCli, rows: List[Dict[str, str]], doctor_id: int, created_by: int, stats: ImportStats) -> None:
    for row in rows:
        source_id = str(row.get("id") or "").strip()
        if not source_id or map_id(mysql, "PRONTUARIO", source_id):
            stats.skipped_rows += 1
            continue
        patient_id = map_id(mysql, "PESSOA", row.get("id_cliente"))
        if not patient_id:
            stats.skipped_rows += 1
            continue
        text = plain_text(row.get("descricao"))
        payload = payload_for(
            mysql,
            "medical_records",
            {
                "patientId": patient_id,
                "doctorId": doctor_id,
                "appointmentId": map_id(mysql, "AGENDA", row.get("id_agenda")),
                "date": parse_date(row.get("data")),
                "chiefComplaint": text,
                "historyOfPresentIllness": text,
                "clinicalEvolution": text,
                "evolution": text,
                "notes": text,
                "recordType": "livre",
                "status": "finalizado" if parse_bool(row.get("finalizado")) else "rascunho",
                "sourceSystem": SOURCE_SYSTEM,
                "sourceId": source_id,
                "createdBy": created_by,
                "createdAt": dt(row.get("data"), row.get("horario_ini")),
            },
        )
        record_id = mysql.insert_id(insert_sql("medical_records", payload))
        save_map(mysql, "PRONTUARIO", source_id, "medical_records", record_id)
        log_import(mysql, "PRONTUARIO", source_id, record_id, "inserted", "Prontuario importado.")
        stats.inserted_rows += 1
        stats.processed_rows += 1


def import_prescriptions(
    mysql: MysqlCli,
    rows: List[Dict[str, str]],
    attachment_index: Dict[str, Path],
    public_root: Path,
    doctor_id: int,
    stats: ImportStats,
) -> None:
    for row in rows:
        source_id = str(row.get("id") or "").strip()
        if not source_id or map_id(mysql, "PRESCRICAO", source_id):
            stats.skipped_rows += 1
            continue
        patient_id = map_id(mysql, "PESSOA", row.get("id_cliente"))
        if not patient_id:
            stats.skipped_rows += 1
            continue

        public_url = None
        file_key = None
        file_name = str(row.get("arquivo") or "").strip()
        source_path = attachment_index.get(file_name)
        if source_path:
            public_url, file_key = copy_attachment(source_path, public_root, str(row.get("id_cliente") or patient_id))

        notes = row.get("historico") or row.get("modelo_nome") or "Prescricao importada do OneDoctor."
        payload = payload_for(
            mysql,
            "prescriptions",
            {
                "patientId": patient_id,
                "doctorId": doctor_id,
                "medicalRecordId": map_id(mysql, "PRONTUARIO", row.get("id_prontuario")),
                "type": "simples",
                "date": parse_date(row.get("data")),
                "items": json.dumps([{"description": notes}], ensure_ascii=False),
                "content": notes,
                "observations": notes,
                "pdfUrl": public_url,
                "pdfKey": file_key,
                "status": "finalizado" if parse_bool(row.get("finalizado")) else "rascunho",
                "sourceSystem": SOURCE_SYSTEM,
                "sourceId": source_id,
                "createdAt": dt(row.get("data"), row.get("hora")),
            },
        )
        prescription_id = mysql.insert_id(insert_sql("prescriptions", payload))
        save_map(mysql, "PRESCRICAO", source_id, "prescriptions", prescription_id)
        log_import(mysql, "PRESCRICAO", source_id, prescription_id, "inserted", "Prescricao importada.")
        stats.inserted_rows += 1
        stats.processed_rows += 1


def import_budgets(mysql: MysqlCli, rows: List[Dict[str, str]], created_by: int, doctor_id: int, stats: ImportStats) -> None:
    for row in rows:
        source_id = str(row.get("id") or "").strip()
        if not source_id or map_id(mysql, "ORCAMENTO", source_id):
            stats.skipped_rows += 1
            continue
        patient_id = map_id(mysql, "PESSOA", row.get("id_cliente"))
        if not patient_id:
            stats.skipped_rows += 1
            continue
        status = "emitido"
        if parse_bool(row.get("cancelado")):
            status = "cancelado"
        elif parse_bool(row.get("aprovado")):
            status = "aprovado"
        payload = payload_for(
            mysql,
            "budgets",
            {
                "patientId": patient_id,
                "doctorId": doctor_id,
                "status": status,
                "totalInCents": cents(row.get("valor_total") or row.get("valor")),
                "discountInCents": cents(row.get("valor_desconto")),
                "finalTotalInCents": cents(row.get("valor_total") or row.get("valor")),
                "paymentConditions": json.dumps(
                    {
                        "valorVista": row.get("valor_vista"),
                        "valorPrazo": row.get("valor_prazo"),
                        "parcelas": row.get("parcelas"),
                    },
                    ensure_ascii=False,
                ),
                "clinicalNotes": row.get("observacao") or None,
                "expiresAt": dt(row.get("validade"), row.get("hora")),
                "approvedAt": dt(row.get("data_aprovado"), row.get("hora")),
                "sourceSystem": SOURCE_SYSTEM,
                "sourceId": source_id,
                "createdBy": created_by,
                "createdAt": dt(row.get("data"), row.get("hora")),
            },
        )
        budget_id = mysql.insert_id(insert_sql("budgets", payload))
        save_map(mysql, "ORCAMENTO", source_id, "budgets", budget_id)
        log_import(mysql, "ORCAMENTO", source_id, budget_id, "inserted", "Orcamento importado.")
        stats.inserted_rows += 1
        stats.processed_rows += 1


def import_payments(mysql: MysqlCli, rows: List[Dict[str, str]], created_by: int, stats: ImportStats) -> None:
    for row in rows:
        source_id = str(row.get("id") or "").strip()
        if not source_id or map_id(mysql, "RECEBER", source_id):
            stats.skipped_rows += 1
            continue
        payload = payload_for(
            mysql,
            "financial_transactions",
            {
                "type": "receita",
                "category": "Atendimento",
                "description": row.get("descricao") or f"Recebimento #{source_id}",
                "amountInCents": cents(row.get("valor_pago") or row.get("valor")),
                "paymentMethod": "outro",
                "patientId": map_id(mysql, "PESSOA", row.get("id_cliente")),
                "budgetId": map_id(mysql, "ORCAMENTO", row.get("id_orcamento")),
                "dueDate": parse_date(row.get("vencimento")),
                "paidAt": dt(row.get("pagamento"), row.get("emissao_hora")),
                "status": "pago" if parse_bool(row.get("quitado")) or parse_date(row.get("pagamento")) else "pendente",
                "createdBy": created_by,
                "sourceSystem": SOURCE_SYSTEM,
                "sourceId": source_id,
                "createdAt": dt(row.get("emissao"), row.get("emissao_hora")),
            },
        )
        if not payload:
            stats.skipped_rows += 1
            continue
        payment_id = mysql.insert_id(insert_sql("financial_transactions", payload))
        save_map(mysql, "RECEBER", source_id, "financial_transactions", payment_id)
        log_import(mysql, "RECEBER", source_id, payment_id, "inserted", "Recebimento importado.")
        stats.inserted_rows += 1
        stats.processed_rows += 1


def copy_attachment(source_path: Path, public_root: Path, patient_key: str) -> Tuple[str, str]:
    safe_key = re.sub(r"[^0-9A-Za-z_-]+", "-", patient_key).strip("-") or "sem-paciente"
    target_dir = public_root / safe_key
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / source_path.name
    if not target_path.exists():
        shutil.copy2(source_path, target_path)
    relative = target_path.relative_to(public_root).as_posix()
    return f"/imports/onedoctor/{relative}", relative


def import_attachments(
    mysql: MysqlCli,
    rows: List[Dict[str, str]],
    folder_names: Dict[str, str],
    attachment_index: Dict[str, Path],
    public_root: Path,
    created_by: int,
    stats: ImportStats,
) -> None:
    for row in rows:
        source_id = str(row.get("id") or "").strip()
        if not source_id:
            continue
        patient_source = str(row.get("id_cliente") or row.get("id_origem") or "").strip()
        patient_id = map_id(mysql, "PESSOA", patient_source)
        file_name = str(row.get("nome") or "").strip()
        source_path = attachment_index.get(file_name)
        if not patient_id or not source_path:
            stats.skipped_rows += 1
            continue

        folder_name = folder_names.get(str(row.get("id_anexo_pasta") or "").strip())
        public_url, file_key = copy_attachment(source_path, public_root, patient_source or str(patient_id))
        mime_type = mimetypes.guess_type(source_path.name)[0] or "application/octet-stream"
        file_size = source_path.stat().st_size

        doc_payload = payload_for(
            mysql,
            "patient_documents",
            {
                "patientId": patient_id,
                "type": "exame_imagem" if mime_type.startswith("image/") and "exame" in str(folder_name or "").lower() else "outro",
                "title": row.get("descricao") or source_path.name,
                "name": row.get("descricao") or source_path.name,
                "description": folder_name or row.get("origem") or None,
                "fileUrl": public_url,
                "fileKey": file_key,
                "mimeType": mime_type,
                "fileSizeBytes": file_size,
                "fileSize": file_size,
                "uploadedBy": created_by,
                "createdBy": created_by,
                "sourceSystem": SOURCE_SYSTEM,
                "sourceId": source_id,
                "createdAt": row.get("data_hora_inclusao") or dt(row.get("data"), row.get("hora")),
            },
        )
        if doc_payload:
            document_id = mysql.insert_id(insert_sql("patient_documents", doc_payload))
            save_map(mysql, "ANEXO_DOCUMENT", source_id, "patient_documents", document_id)
            log_import(mysql, "ANEXO", source_id, document_id, "inserted", "Arquivo vinculado em patient_documents.")
            stats.inserted_rows += 1

        if mime_type.startswith("image/"):
            photo_payload = payload_for(
                mysql,
                "patient_photos",
                {
                    "patientId": patient_id,
                    "category": "exame" if "exame" in str(folder_name or "").lower() else "documento",
                    "description": row.get("descricao") or folder_name or None,
                    "photoUrl": public_url,
                    "photoKey": file_key,
                    "uploadedBy": created_by,
                    "sourceSystem": SOURCE_SYSTEM,
                    "sourceId": source_id,
                    "createdAt": row.get("data_hora_inclusao") or dt(row.get("data"), row.get("hora")),
                },
            )
            if photo_payload:
                photo_id = mysql.insert_id(insert_sql("patient_photos", photo_payload))
                save_map(mysql, "ANEXO", source_id, "patient_photos", photo_id)
                log_import(mysql, "ANEXO", source_id, photo_id, "inserted", "Imagem vinculada em patient_photos.")
                stats.inserted_rows += 1

        stats.processed_rows += 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa backup do OneDoctor para o Glutec.")
    parser.add_argument("--source", required=True, help="Pasta extraida ou arquivo compactado.")
    parser.add_argument("--mysql-bin", default="mysql")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--user", required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--created-by", type=int, required=True)
    parser.add_argument("--doctor-id", type=int, required=True)
    parser.add_argument("--public-root", default="public/imports/onedoctor")
    args = parser.parse_args()

    mysql = MysqlCli(args.mysql_bin, args.host, args.port, args.user, args.database)
    source_root, cleanup_root = prepare_source(Path(args.source))
    public_root = Path(args.public_root).resolve()
    public_root.mkdir(parents=True, exist_ok=True)
    stats = ImportStats()
    errors: List[str] = []
    job_id = register_job(
        mysql,
        Path(args.source).name,
        Path(args.source).stat().st_size if Path(args.source).exists() and Path(args.source).is_file() else 0,
        args.created_by,
    )

    try:
        pessoa = read_csv_rows(find_file(source_root, "PESSOA.csv"))
        agenda = read_csv_rows(find_file(source_root, "AGENDA.csv"))
        prontuario = read_csv_rows(find_file(source_root, "PRONTUARIO.csv"))
        prescricao = read_csv_rows(find_file(source_root, "PRESCRICAO.csv"))
        orcamento = read_csv_rows(find_file(source_root, "ORCAMENTO.csv"))
        receber = read_csv_rows(find_file(source_root, "RECEBER.csv"))
        anexo = read_csv_rows(find_file(source_root, "ANEXO.csv"))
        anexo_pasta = read_csv_rows(find_file(source_root, "ANEXO_PASTA.csv"))
        stats.total_rows = len(pessoa) + len(agenda) + len(prontuario) + len(prescricao) + len(orcamento) + len(receber) + len(anexo)

        for row in pessoa:
            try:
                upsert_patient(mysql, row, args.created_by, stats)
            except Exception as exc:
                stats.error_rows += 1
                errors.append(f"Paciente {row.get('id')}: {exc}")
                log_import(mysql, "PESSOA", row.get("id"), None, "error", str(exc))

        import_appointments(mysql, agenda, args.doctor_id, args.created_by, stats)
        import_medical_records(mysql, prontuario, args.doctor_id, args.created_by, stats)
        arquivos_dir = find_file(source_root, "ANEXO.csv").parent / "arquivos"
        attachment_index = {path.name: path for path in arquivos_dir.rglob("*") if path.is_file()} if arquivos_dir.exists() else {}
        import_prescriptions(mysql, prescricao, attachment_index, public_root, args.doctor_id, stats)
        import_budgets(mysql, orcamento, args.created_by, args.doctor_id, stats)
        import_payments(mysql, receber, args.created_by, stats)
        folder_names = {str(row.get("id") or "").strip(): row.get("nome") or "" for row in anexo_pasta}
        import_attachments(mysql, anexo, folder_names, attachment_index, public_root, args.created_by, stats)

        finish_job(mysql, job_id, stats, "partial" if errors else "completed", errors)
        print(json.dumps({"status": "ok", "jobId": job_id, "stats": stats.__dict__, "errors": errors[:20]}, ensure_ascii=False))
    except Exception as exc:
        errors.append(str(exc))
        stats.error_rows += 1
        finish_job(mysql, job_id, stats, "failed", errors)
        raise
    finally:
        if cleanup_root and cleanup_root.exists():
            shutil.rmtree(cleanup_root, ignore_errors=True)


if __name__ == "__main__":
    main()
