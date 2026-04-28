#!/usr/bin/env python3
"""
Importa pacientes e anexos de mídia do Prontuário Verde para o Glutec.

Fluxo desta primeira etapa:
1. Lê o ZIP de dados e importa/relaciona pacientes.
2. Lê o ZIP de anexos, extrai imagens para uma pasta pública do projeto.
3. Vincula fotos/imagens em `patient_photos`.
4. Registra rastreabilidade em `import_jobs`, `import_id_map` e `import_log`.

Regra de precedência preparada para o futuro:
- Dados do Prontuário Verde preenchem registros novos e lacunas.
- Campos já preenchidos não são sobrescritos aqui.
- A futura importação do OneDoctor poderá prevalecer sem perder o histórico legado.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import mimetypes
import os
import posixpath
import subprocess
import sys
import zipfile
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Tuple

SOURCE_SYSTEM = "prontuario_verde"
PATIENT_SOURCE_TABLE = "exp_paciente"
PHOTO_SOURCE_TABLE = "exp_paciente_anexo"


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

    def query(self, sql_text: str) -> List[List[str]]:
        result = subprocess.run(
            [*self.base_cmd, sql_text],
            check=True,
            capture_output=True,
            text=True,
        )
        lines = [line for line in result.stdout.splitlines() if line.strip()]
        return [line.split("\t") for line in lines]

    def scalar(self, sql_text: str) -> Optional[str]:
        rows = self.query(sql_text)
        if not rows or not rows[0]:
            return None
        return rows[0][0]

    def execute(self, sql_text: str) -> None:
        subprocess.run([*self.base_cmd, sql_text], check=True, capture_output=True, text=True)

    def insert_and_get_id(self, sql_text: str) -> int:
        value = self.scalar(f"{sql_text}; SELECT LAST_INSERT_ID();")
        if value is None:
            raise RuntimeError("Não foi possível obter LAST_INSERT_ID().")
        return int(value)


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


def clean_cpf(value: Optional[str]) -> Optional[str]:
    digits = clean_digits(value)
    return digits if len(digits) in {11, 14} else None


def clean_phone(value: Optional[str]) -> Optional[str]:
    digits = clean_digits(value)
    return digits or None


def clean_zip_code(value: Optional[str]) -> Optional[str]:
    digits = clean_digits(value)
    return digits[:8] if digits else None


def normalize_name(value: Optional[str]) -> str:
    return " ".join(str(value or "").strip().upper().split())


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

    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M.%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            pass
    return None


def first_non_empty(*values: Optional[str]) -> Optional[str]:
    for value in values:
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def patient_gender(value: Optional[str]) -> str:
    mapping = {"F": "feminino", "M": "masculino"}
    return mapping.get(str(value or "").strip().upper(), "nao_informado")


def read_csv_from_zip(zf: zipfile.ZipFile, entry_name: str) -> List[Dict[str, str]]:
    entry = zf.getinfo(entry_name)
    with zf.open(entry) as handle:
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
        yield ref[len("8152/"):]
    yield f"prontuarioverde-anexos/{ref}"
    if ref.startswith("8152/"):
        yield f"prontuarioverde-anexos/{ref[len('8152/'):]}"


def resolve_attachment(
    attachment_index: Dict[str, zipfile.ZipInfo], reference: str
) -> Optional[zipfile.ZipInfo]:
    for candidate in iter_attachment_candidates(reference):
        info = attachment_index.get(candidate)
        if info:
            return info
    return None


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def extract_attachment(
    zf: zipfile.ZipFile,
    info: zipfile.ZipInfo,
    extract_root: str,
    patient_source_id: str,
) -> Tuple[str, str]:
    filename = os.path.basename(info.filename.replace("\\", "/"))
    relative_path = posixpath.join(patient_source_id, filename)
    output_path = os.path.join(extract_root, *relative_path.split("/"))
    ensure_dir(os.path.dirname(output_path))
    if not os.path.exists(output_path):
        with zf.open(info) as src, open(output_path, "wb") as dst:
            dst.write(src.read())
    public_path = f"/imports/prontuario-verde/{relative_path}"
    return public_path, relative_path


def register_import_job(mysql: MysqlCli, file_name: str, file_size: int, created_by: int) -> int:
    return mysql.insert_and_get_id(
        "INSERT INTO import_jobs "
        "(sourceSystem, fileName, fileSize, status, createdBy, startedAt) VALUES "
        f"({sql_literal(SOURCE_SYSTEM)}, {sql_literal(file_name)}, {file_size}, 'processing', {created_by}, NOW())"
    )


def finish_import_job(mysql: MysqlCli, job_id: int, stats: ImportStats, status: str, errors: List[str]) -> None:
    mysql.execute(
        "UPDATE import_jobs SET "
        f"status = {sql_literal(status)}, "
        f"totalRows = {stats.total_rows}, "
        f"processedRows = {stats.processed_rows}, "
        f"insertedRows = {stats.inserted_rows}, "
        f"updatedRows = {stats.updated_rows}, "
        f"skippedRows = {stats.skipped_rows}, "
        f"errorRows = {stats.error_rows}, "
        f"errorDetails = {sql_literal(json.dumps(errors[:50], ensure_ascii=False)) if errors else 'NULL'}, "
        "completedAt = NOW() "
        f"WHERE id = {job_id}"
    )


def log_import(
    mysql: MysqlCli,
    source_table: str,
    source_id: Optional[str],
    new_id: Optional[int],
    action: str,
    notes: Optional[str] = None,
) -> None:
    mysql.execute(
        "INSERT INTO import_log (sourceSystem, tableName, sourceId, newId, action, notes) VALUES "
        f"({sql_literal(SOURCE_SYSTEM)}, {sql_literal(source_table)}, {sql_literal(source_id)}, "
        f"{sql_literal(new_id)}, {sql_literal(action)}, {sql_literal(notes)})"
    )


def upsert_import_map(
    mysql: MysqlCli,
    source_table: str,
    source_id: str,
    target_table: str,
    target_id: int,
) -> None:
    mysql.execute(
        "INSERT INTO import_id_map (sourceSystem, sourceTable, sourceId, targetTable, targetId) VALUES "
        f"({sql_literal(SOURCE_SYSTEM)}, {sql_literal(source_table)}, {sql_literal(source_id)}, "
        f"{sql_literal(target_table)}, {target_id}) "
        "ON DUPLICATE KEY UPDATE "
        f"targetId = {target_id}, importedAt = NOW()"
    )


def find_patient(mysql: MysqlCli, source_id: str, cpf: Optional[str], full_name: str, birth_date: Optional[str]) -> Optional[Tuple[int, Optional[str]]]:
    mapped_id = mysql.scalar(
        "SELECT targetId FROM import_id_map "
        f"WHERE sourceSystem = {sql_literal(SOURCE_SYSTEM)} "
        f"AND sourceTable = {sql_literal(PATIENT_SOURCE_TABLE)} "
        f"AND sourceId = {sql_literal(source_id)} LIMIT 1"
    )
    if mapped_id:
        source_system = mysql.scalar(f"SELECT sourceSystem FROM patients WHERE id = {mapped_id} LIMIT 1")
        return int(mapped_id), source_system

    direct_id = mysql.query(
        "SELECT id, sourceSystem FROM patients "
        f"WHERE sourceSystem = {sql_literal(SOURCE_SYSTEM)} AND sourceId = {sql_literal(source_id)} "
        "LIMIT 1"
    )
    if direct_id:
        return int(direct_id[0][0]), direct_id[0][1] if len(direct_id[0]) > 1 else None

    if cpf:
        cpf_match = mysql.query(
            "SELECT id, sourceSystem FROM patients "
            f"WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), '/', '') = {sql_literal(cpf)} "
            "LIMIT 1"
        )
        if cpf_match:
            return int(cpf_match[0][0]), cpf_match[0][1] if len(cpf_match[0]) > 1 else None

    if full_name and birth_date:
        name_match = mysql.query(
            "SELECT id, sourceSystem FROM patients "
            f"WHERE UPPER(TRIM(fullName)) = {sql_literal(full_name)} "
            f"AND birthDate = {sql_literal(birth_date)} LIMIT 1"
        )
        if name_match:
            return int(name_match[0][0]), name_match[0][1] if len(name_match[0]) > 1 else None

    return None


def compose_patient_observations(row: Dict[str, str]) -> Optional[str]:
    notes: List[str] = []
    if row.get("Observações"):
        notes.append(f"Observações do legado: {row['Observações'].strip()}")
    if row.get("Origem do paciente"):
        notes.append(f"Origem do paciente (Prontuário Verde): {row['Origem do paciente'].strip()}")
    if row.get("Profissão"):
        notes.append(f"Profissão informada no legado: {row['Profissão'].strip()}")
    if row.get("Nome Responsável"):
        notes.append(f"Responsável no legado: {row['Nome Responsável'].strip()}")
    return "\n".join(notes) if notes else None


def build_address_json(row: Dict[str, str]) -> Optional[str]:
    payload = {
        "street": row.get("Logradouro") or None,
        "number": row.get("Número Logradouro") or None,
        "complement": row.get("Complemento Logradouro") or None,
        "neighborhood": row.get("Bairro") or None,
        "city": row.get("Cidade") or None,
        "state": row.get("UF") or None,
        "zip": clean_zip_code(row.get("CEP")),
    }
    if not any(payload.values()):
        return None
    return json.dumps(payload, ensure_ascii=False)


def looks_like_city_id(value: Optional[str]) -> bool:
    return bool(re.fullmatch(r"\d{2,}", str(value or "").strip()))


def existing_address_needs_update(existing_address: Optional[str], existing_city: Optional[str], incoming_address: Optional[str]) -> bool:
    if not incoming_address:
        return False
    if not existing_address or str(existing_address).strip() in {"", "{}"}:
        return True
    if looks_like_city_id(existing_city):
        return True
    try:
        parsed = json.loads(str(existing_address))
        if isinstance(parsed, dict):
            city = parsed.get("city")
            street = parsed.get("street")
            return not street or not city or looks_like_city_id(city)
    except Exception:
        return False
    return False


def insert_patient(mysql: MysqlCli, row: Dict[str, str], created_by: int) -> int:
    birth_date = parse_date(row.get("Nascimento"))
    phone = clean_phone(first_non_empty(row.get("Telefone1"), row.get("Telefone2"), row.get("Telefone3")))
    phone2 = clean_phone(first_non_empty(row.get("Telefone2"), row.get("Telefone3")))
    observations = compose_patient_observations(row)

    return mysql.insert_and_get_id(
        "INSERT INTO patients "
        "(fullName, cpf, rg, birthDate, gender, phone, phone2, email, address, observations, "
        "sourceSystem, sourceId, active, createdBy, createdAt, updatedAt) VALUES ("
        f"{sql_literal(row.get('Nome'))}, "
        f"{sql_literal(clean_cpf(row.get('CPF')))}, "
        f"{sql_literal(row.get('RG') or None)}, "
        f"{sql_literal(birth_date)}, "
        f"{sql_literal(patient_gender(row.get('Sexo')))}, "
        f"{sql_literal(phone)}, "
        f"{sql_literal(phone2)}, "
        f"{sql_literal(row.get('E-mail') or None)}, "
        f"{sql_literal(build_address_json(row))}, "
        f"{sql_literal(observations)}, "
        f"{sql_literal(SOURCE_SYSTEM)}, "
        f"{sql_literal(row.get('PAC_ID'))}, "
        f"1, {created_by}, NOW(), NOW())"
    )


def update_patient_if_needed(mysql: MysqlCli, patient_id: int, row: Dict[str, str]) -> None:
    birth_date = parse_date(row.get("Nascimento"))
    phone = clean_phone(first_non_empty(row.get("Telefone1"), row.get("Telefone2"), row.get("Telefone3")))
    phone2 = clean_phone(first_non_empty(row.get("Telefone2"), row.get("Telefone3")))
    address_json = build_address_json(row)
    observations = compose_patient_observations(row)
    current_rows = mysql.query(f"SELECT address, city FROM patients WHERE id = {patient_id} LIMIT 1")
    current_address = current_rows[0][0] if current_rows and len(current_rows[0]) > 0 else None
    current_city = current_rows[0][1] if current_rows and len(current_rows[0]) > 1 else None
    should_update_address = existing_address_needs_update(current_address, current_city, address_json)

    mysql.execute(
        "UPDATE patients SET "
        f"cpf = CASE WHEN (cpf IS NULL OR cpf = '') THEN {sql_literal(clean_cpf(row.get('CPF')))} ELSE cpf END, "
        f"rg = CASE WHEN (rg IS NULL OR rg = '') THEN {sql_literal(row.get('RG') or None)} ELSE rg END, "
        f"birthDate = COALESCE(birthDate, {sql_literal(birth_date)}), "
        f"gender = CASE WHEN (gender IS NULL OR gender = '' OR gender = 'nao_informado') THEN {sql_literal(patient_gender(row.get('Sexo')))} ELSE gender END, "
        f"phone = CASE WHEN (phone IS NULL OR phone = '') THEN {sql_literal(phone)} ELSE phone END, "
        f"phone2 = CASE WHEN (phone2 IS NULL OR phone2 = '') THEN {sql_literal(phone2)} ELSE phone2 END, "
        f"email = CASE WHEN (email IS NULL OR email = '') THEN {sql_literal(row.get('E-mail') or None)} ELSE email END, "
        f"address = CASE WHEN (address IS NULL OR address = '' OR {1 if should_update_address else 0} = 1) THEN {sql_literal(address_json)} ELSE address END, "
        f"observations = CASE WHEN (observations IS NULL OR observations = '') THEN {sql_literal(observations)} ELSE observations END, "
        f"sourceSystem = CASE WHEN (sourceSystem IS NULL OR sourceSystem = '') THEN {sql_literal(SOURCE_SYSTEM)} ELSE sourceSystem END, "
        f"sourceId = CASE WHEN (sourceId IS NULL OR sourceId = '') THEN {sql_literal(row.get('PAC_ID'))} ELSE sourceId END "
        f"WHERE id = {patient_id}"
    )


def upsert_patient(mysql: MysqlCli, row: Dict[str, str], created_by: int) -> Tuple[int, str]:
    patient_source_id = str(row.get("PAC_ID") or "").strip()
    full_name = normalize_name(row.get("Nome"))
    if not patient_source_id or not full_name:
        raise ValueError("Paciente sem PAC_ID ou Nome.")

    matched = find_patient(
        mysql=mysql,
        source_id=patient_source_id,
        cpf=clean_cpf(row.get("CPF")),
        full_name=full_name,
        birth_date=parse_date(row.get("Nascimento")),
    )

    if matched:
        patient_id, _existing_source = matched
        update_patient_if_needed(mysql, patient_id, row)
        upsert_import_map(mysql, PATIENT_SOURCE_TABLE, patient_source_id, "patients", patient_id)
        log_import(mysql, PATIENT_SOURCE_TABLE, patient_source_id, patient_id, "updated", "Paciente relacionado ao cadastro atual.")
        return patient_id, "updated"

    patient_id = insert_patient(mysql, row, created_by)
    upsert_import_map(mysql, PATIENT_SOURCE_TABLE, patient_source_id, "patients", patient_id)
    log_import(mysql, PATIENT_SOURCE_TABLE, patient_source_id, patient_id, "inserted", "Paciente criado a partir do Prontuário Verde.")
    return patient_id, "inserted"


def find_existing_photo(mysql: MysqlCli, photo_key: str) -> Optional[int]:
    existing = mysql.scalar(
        "SELECT id FROM patient_photos "
        f"WHERE photoKey = {sql_literal(photo_key)} LIMIT 1"
    )
    return int(existing) if existing else None


def insert_photo(
    mysql: MysqlCli,
    patient_id: int,
    photo_url: str,
    photo_key: str,
    mime_type: Optional[str],
    category: str,
    description: str,
    uploaded_by: int,
    taken_at: Optional[str],
) -> int:
    thumbnail = photo_url if mime_type and mime_type.startswith("image/") else None
    return mysql.insert_and_get_id(
        "INSERT INTO patient_photos "
        "(patientId, category, description, photoUrl, photoKey, thumbnailUrl, takenAt, uploadedBy, createdAt) VALUES ("
        f"{patient_id}, "
        f"{sql_literal(category)}, "
        f"{sql_literal(description)}, "
        f"{sql_literal(photo_url)}, "
        f"{sql_literal(photo_key)}, "
        f"{sql_literal(thumbnail)}, "
        f"{sql_literal(taken_at)}, "
        f"{uploaded_by}, NOW())"
    )


def import_photo_reference(
    mysql: MysqlCli,
    attachments_zip: zipfile.ZipFile,
    attachment_index: Dict[str, zipfile.ZipInfo],
    extract_root: str,
    patient_id: int,
    patient_source_id: str,
    reference: str,
    source_table: str,
    source_row_id: str,
    description: str,
    uploaded_by: int,
    taken_at: Optional[str],
    category: str,
) -> str:
    info = resolve_attachment(attachment_index, reference)
    if not info:
        log_import(mysql, source_table, source_row_id, patient_id, "error", f"Arquivo não encontrado no ZIP: {reference}")
        return "error"

    photo_url, photo_key = extract_attachment(attachments_zip, info, extract_root, patient_source_id)
    mime_type, _ = mimetypes.guess_type(info.filename)
    existing_photo_id = find_existing_photo(mysql, photo_key)
    if existing_photo_id:
        upsert_import_map(mysql, source_table, source_row_id, "patient_photos", existing_photo_id)
        log_import(mysql, source_table, source_row_id, existing_photo_id, "skipped", "Mídia já importada anteriormente.")
        return "skipped"

    photo_id = insert_photo(
        mysql=mysql,
        patient_id=patient_id,
        photo_url=photo_url,
        photo_key=photo_key,
        mime_type=mime_type,
        category=category,
        description=description,
        uploaded_by=uploaded_by,
        taken_at=taken_at,
    )
    upsert_import_map(mysql, source_table, source_row_id, "patient_photos", photo_id)
    log_import(mysql, source_table, source_row_id, photo_id, "inserted", description)
    return "inserted"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Importa pacientes e anexos do Prontuário Verde.")
    parser.add_argument("--data-zip", required=True, help="Caminho do ZIP com CSVs exportados do Prontuário Verde.")
    parser.add_argument("--attachments-zip", required=True, help="Caminho do ZIP com anexos/imagens.")
    parser.add_argument(
        "--extract-dir",
        default=os.path.join("public", "imports", "prontuario-verde"),
        help="Pasta local onde as imagens serão extraídas.",
    )
    parser.add_argument("--mysql-bin", default="mysql", help="Binário do cliente mysql.")
    parser.add_argument("--db-host", default="127.0.0.1", help="Host do MySQL.")
    parser.add_argument("--db-port", type=int, default=3306, help="Porta do MySQL.")
    parser.add_argument("--db-user", default="root", help="Usuário do MySQL.")
    parser.add_argument("--db-name", default="glutec", help="Nome do banco.")
    parser.add_argument("--created-by", type=int, default=1, help="userId usado para criar pacientes.")
    parser.add_argument("--uploaded-by", type=int, default=1, help="userId usado para registrar uploads.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    mysql = MysqlCli(args.mysql_bin, args.db_host, args.db_port, args.db_user, args.db_name)
    errors: List[str] = []
    stats = ImportStats()

    data_size = os.path.getsize(args.data_zip)
    attachments_size = os.path.getsize(args.attachments_zip)
    job_id = register_import_job(
        mysql,
        file_name=f"{os.path.basename(args.data_zip)} + {os.path.basename(args.attachments_zip)}",
        file_size=data_size + attachments_size,
        created_by=args.created_by,
    )

    try:
        with zipfile.ZipFile(args.data_zip) as data_zip, zipfile.ZipFile(args.attachments_zip) as attachments_zip:
            patient_rows = read_csv_from_zip(data_zip, "exp_paciente_8152_20260312-010951.csv")
            attachment_rows = read_csv_from_zip(data_zip, "exp_paciente_anexo_8152_20260312-010952.csv")
            attachment_index = build_attachment_index(attachments_zip)

            stats.total_rows = len(patient_rows) + len(attachment_rows)
            patient_id_by_source: Dict[str, int] = {}

            for row in patient_rows:
                stats.processed_rows += 1
                try:
                    patient_id, action = upsert_patient(mysql, row, args.created_by)
                    patient_source_id = str(row.get("PAC_ID") or "").strip()
                    patient_id_by_source[patient_source_id] = patient_id
                    if action == "inserted":
                        stats.inserted_rows += 1
                    else:
                        stats.updated_rows += 1

                    legacy_photo = row.get("Foto")
                    if legacy_photo:
                        photo_action = import_photo_reference(
                            mysql=mysql,
                            attachments_zip=attachments_zip,
                            attachment_index=attachment_index,
                            extract_root=args.extract_dir,
                            patient_id=patient_id,
                            patient_source_id=patient_source_id,
                            reference=legacy_photo,
                            source_table=PATIENT_SOURCE_TABLE,
                            source_row_id=f"{patient_source_id}:foto_principal",
                            description="Foto legada importada do Prontuário Verde.",
                            uploaded_by=args.uploaded_by,
                            taken_at=None,
                            category="documento",
                        )
                        if photo_action == "inserted":
                            stats.inserted_rows += 1
                        elif photo_action == "skipped":
                            stats.skipped_rows += 1
                        else:
                            stats.error_rows += 1
                except Exception as exc:  # noqa: BLE001
                    stats.error_rows += 1
                    message = f"Paciente {row.get('PAC_ID')}: {exc}"
                    errors.append(message)
                    log_import(mysql, PATIENT_SOURCE_TABLE, row.get("PAC_ID"), None, "error", message)

            for index, row in enumerate(attachment_rows, start=1):
                stats.processed_rows += 1
                patient_source_id = str(row.get("PAC_ID") or "").strip()
                patient_id = patient_id_by_source.get(patient_source_id)
                if not patient_id:
                    stats.skipped_rows += 1
                    log_import(mysql, PHOTO_SOURCE_TABLE, f"{patient_source_id}:{index}", None, "skipped", "Paciente não encontrado para o anexo.")
                    continue

                try:
                    reference = row.get("Documento") or ""
                    attachment_type = (row.get("Tipo") or "").strip().upper()
                    category = "evolucao" if attachment_type == "FOTOGRAFIA" else "documento"
                    action = import_photo_reference(
                        mysql=mysql,
                        attachments_zip=attachments_zip,
                        attachment_index=attachment_index,
                        extract_root=args.extract_dir,
                        patient_id=patient_id,
                        patient_source_id=patient_source_id,
                        reference=reference,
                        source_table=PHOTO_SOURCE_TABLE,
                        source_row_id=f"{patient_source_id}:{index}",
                        description=f"Anexo legado ({attachment_type or 'SEM TIPO'}) importado do Prontuário Verde.",
                        uploaded_by=args.uploaded_by,
                        taken_at=parse_date(row.get("Data")),
                        category=category,
                    )
                    if action == "inserted":
                        stats.inserted_rows += 1
                    elif action == "skipped":
                        stats.skipped_rows += 1
                    else:
                        stats.error_rows += 1
                except Exception as exc:  # noqa: BLE001
                    stats.error_rows += 1
                    message = f"Anexo {patient_source_id}:{index}: {exc}"
                    errors.append(message)
                    log_import(mysql, PHOTO_SOURCE_TABLE, f"{patient_source_id}:{index}", patient_id, "error", message)

        finish_import_job(
            mysql,
            job_id=job_id,
            stats=stats,
            status="partial" if errors else "completed",
            errors=errors,
        )
    except Exception as exc:  # noqa: BLE001
        errors.append(str(exc))
        finish_import_job(mysql, job_id=job_id, stats=stats, status="failed", errors=errors)
        raise

    print("Importação concluída.")
    print(json.dumps({
        "totalRows": stats.total_rows,
        "processedRows": stats.processed_rows,
        "insertedRows": stats.inserted_rows,
        "updatedRows": stats.updated_rows,
        "skippedRows": stats.skipped_rows,
        "errorRows": stats.error_rows,
        "jobId": job_id,
        "errorsPreview": errors[:10],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
