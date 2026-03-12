import csv
import os
import subprocess
from datetime import datetime

def run_mysql(query, args=None):
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
    
    subprocess.run(cmd, check=True)

def link_docs():
    # Primeiro, vamos adicionar uma coluna temporária para o ID do Prontuário Verde
    try:
        run_mysql("ALTER TABLE patients ADD COLUMN verde_id int;")
    except: pass

    # Re-importar pacientes com o ID do Prontuário Verde para facilitar o vínculo
    csv_path = '/home/ubuntu/import/dados/exp_paciente_8152_20260312-010951.csv'
    with open(csv_path, mode='r', encoding='latin-1') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            pac_id = row.get('PAC_ID')
            cpf = ''.join(filter(str.isdigit, str(row.get('CPF', ''))))
            if cpf:
                run_mysql(f"UPDATE patients SET verde_id = {pac_id} WHERE cpf = '{cpf}'")
            else:
                name = row.get('Nome').replace("'", "''")
                run_mysql(f"UPDATE patients SET verde_id = {pac_id} WHERE fullName = '{name}'")

    # Agora percorrer as pastas de anexos
    base_path = "/home/ubuntu/import/anexos/prontuarioverde-documentos"
    count = 0
    if os.path.exists(base_path):
        for pac_folder in os.listdir(base_path):
            if not pac_folder.isdigit(): continue
            verde_id = pac_folder
            # Buscar nosso patientId
            res = subprocess.run(['sudo', 'mysql', '-u', 'root', 'glutec', '-N', '-s', '-e', f"SELECT id FROM patients WHERE verde_id = {verde_id}"], capture_output=True, text=True)
            patient_id = res.stdout.strip()
            if not patient_id: continue

            # Percorrer subpastas: evolucao, documentos, receituario
            pac_path = os.path.join(base_path, pac_folder)
            for sub in ['evolucao', 'documentos', 'receituario']:
                sub_path = os.path.join(pac_path, sub)
                if os.path.exists(sub_path):
                    for filename in os.listdir(sub_path):
                        file_full_path = os.path.join(sub_path, filename)
                        # Colunas corretas: patientId, type, title, fileUrl, fileKey, uploadedBy
                        sql = "INSERT INTO patient_documents (patientId, type, title, fileUrl, fileKey, uploadedBy, createdAt) VALUES (%s, %s, %s, %s, %s, %s, %s)"
                        values = (patient_id, 'outro', f"{sub.capitalize()}: {filename}", file_full_path, f"migrated/{verde_id}/{filename}", 1, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
                        try:
                            run_mysql(sql, values)
                            count += 1
                        except: pass

    print(f"Vínculo de documentos concluído: {count} documentos vinculados.")

if __name__ == "__main__":
    link_docs()
