#!/usr/bin/env python3
"""
Script: sync_allergies.py
Descrição: Sincroniza alergias do Prontuário Verde para a tabela centralizada patient_allergies
"""

import subprocess
import re
from datetime import datetime

def run_mysql(query, args=None):
    """Executa uma query MySQL e retorna o resultado."""
    if args:
        formatted_query = query
        for arg in args:
            if arg is None:
                val = "NULL"
            elif isinstance(arg, str):
                escaped = arg.replace("'", "''")
                val = f"'{escaped}'"
            else:
                val = str(arg)
            formatted_query = formatted_query.replace("%s", val, 1)
        cmd = ['sudo', 'mysql', '-u', 'root', 'glutec', '-e', formatted_query]
    else:
        cmd = ['sudo', 'mysql', '-u', 'root', 'glutec', '-e', query]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout.strip()

def get_mysql_result(query, args=None):
    """Executa uma query e retorna o resultado como lista."""
    if args:
        formatted_query = query
        for arg in args:
            if arg is None:
                val = "NULL"
            elif isinstance(arg, str):
                escaped = arg.replace("'", "''")
                val = f"'{escaped}'"
            else:
                val = str(arg)
            formatted_query = formatted_query.replace("%s", val, 1)
        cmd = ['sudo', 'mysql', '-u', 'root', 'glutec', '-N', '-s', '-e', formatted_query]
    else:
        cmd = ['sudo', 'mysql', '-u', 'root', 'glutec', '-N', '-s', '-e', query]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    lines = result.stdout.strip().split('\n')
    return [line for line in lines if line]

def normalize_allergies(allergy_text):
    """Normaliza texto de alergias em uma lista de alergias individuais."""
    if not allergy_text or not allergy_text.strip():
        return []
    
    text = re.sub(r'^(alérgico\s+a|alergias?:?)\s+', '', allergy_text, flags=re.IGNORECASE)
    allergens = re.split(r'[,;]|\s+e\s+', text)
    
    cleaned = []
    for allergen in allergens:
        allergen = allergen.strip()
        allergen = re.sub(r'\s*\(.*?\)\s*', '', allergen)
        allergen = allergen.strip()
        
        if allergen and len(allergen) > 2:
            cleaned.append(allergen)
    
    return cleaned

def sync_allergies():
    """Sincroniza alergias do campo patients.allergies para patient_allergies."""
    
    print("Iniciando sincronização de alergias...")
    print("-" * 60)
    
    # Buscar ID do usuário admin
    admin_query = "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    admin_results = get_mysql_result(admin_query)
    
    if not admin_results:
        print("ERRO: Nenhum usuário admin encontrado. Criando usuário de teste...")
        run_mysql("INSERT INTO users (openId, name, email, role, active) VALUES ('sync-admin', 'Sync Admin', 'sync@admin.com', 'admin', 1)")
        admin_results = get_mysql_result(admin_query)
    
    admin_id = admin_results[0] if admin_results else 1
    
    # Buscar todos os pacientes com alergias
    query = "SELECT id, fullName, allergies FROM patients WHERE allergies IS NOT NULL AND allergies != ''"
    results = get_mysql_result(query)
    
    total_patients = len(results)
    print(f"Encontrados {total_patients} pacientes com alergias registradas")
    
    if total_patients == 0:
        print("Nenhuma alergia para sincronizar.")
        return
    
    synced_count = 0
    skipped_count = 0
    error_count = 0
    
    for result in results:
        parts = result.split('\t')
        if len(parts) < 3:
            continue
        
        patient_id = parts[0]
        patient_name = parts[1]
        allergies_text = parts[2]
        
        allergens = normalize_allergies(allergies_text)
        
        if not allergens:
            print(f"⊘ {patient_name}: Nenhuma alergia válida extraída")
            skipped_count += 1
            continue
        
        for allergen in allergens:
            try:
                check_query = "SELECT id FROM patient_allergies WHERE patientId = %s AND allergen = %s"
                existing = get_mysql_result(check_query, (patient_id, allergen))
                
                if existing:
                    print(f"  ✓ {allergen}: Já existe para {patient_name}")
                    continue
                
                insert_query = """
                    INSERT INTO patient_allergies 
                    (patientId, allergen, severity, source, active, recordedBy, recordedAt, createdAt)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """
                
                run_mysql(insert_query, (
                    patient_id,
                    allergen,
                    "desconhecida",
                    "cadastro_paciente",
                    1,
                    admin_id,
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                ))
                
                print(f"  ✓ {allergen}: Sincronizado para {patient_name}")
                synced_count += 1
                
            except Exception as e:
                print(f"  ✗ {allergen}: Erro ao sincronizar - {str(e)}")
                error_count += 1
    
    print("-" * 60)
    print(f"Sincronização concluída!")
    print(f"  Alergias sincronizadas: {synced_count}")
    print(f"  Alergias ignoradas: {skipped_count}")
    print(f"  Erros: {error_count}")
    
    total_query = "SELECT COUNT(*) FROM patient_allergies"
    total = get_mysql_result(total_query)[0]
    print(f"  Total de alergias na tabela: {total}")

if __name__ == "__main__":
    sync_allergies()
