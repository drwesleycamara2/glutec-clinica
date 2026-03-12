import csv
import os
import subprocess
from datetime import datetime

def clean_cpf(cpf):
    if not cpf: return None
    clean = ''.join(filter(str.isdigit, str(cpf)))
    if len(clean) > 14: clean = clean[:14]
    return clean

def parse_date(date_str):
    if not date_str or date_str == '00/00/0000': return None
    try:
        return datetime.strptime(date_str, '%d/%m/%Y').strftime('%Y-%m-%d')
    except:
        try:
            return datetime.strptime(date_str, '%d/%m/%y').strftime('%Y-%m-%d')
        except:
            return None

def migrate():
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

    def get_existing(query, args):
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
        
        result = subprocess.run(['sudo', 'mysql', '-u', 'root', 'glutec', '-N', '-s', '-e', formatted_query], capture_output=True, text=True)
        return result.stdout.strip()
    
    csv_path = '/home/ubuntu/import/dados/exp_paciente_8152_20260312-010951.csv'
    
    if not os.path.exists(csv_path):
        print(f"Arquivo não encontrado: {csv_path}")
        return

    with open(csv_path, mode='r', encoding='latin-1') as f:
        reader = csv.DictReader(f, delimiter=';')
        count = 0
        for row in reader:
            full_name = row.get('Nome')
            if not full_name: continue
            
            cpf = clean_cpf(row.get('CPF'))
            birth_date = parse_date(row.get('Nascimento'))
            
            gender_map = {'F': 'feminino', 'M': 'masculino'}
            gender = gender_map.get(row.get('Sexo'), 'nao_informado')
            
            # Verificar se paciente já existe
            exists = False
            if cpf:
                if get_existing("SELECT id FROM patients WHERE cpf = %s", (cpf,)):
                    exists = True
            else:
                if get_existing("SELECT id FROM patients WHERE fullName = %s AND (birthDate = %s OR birthDate IS NULL)", (full_name, birth_date)):
                    exists = True
            
            if exists:
                continue
            
            # Removidas colunas: motherName, maritalStatus, neighborhood
            sql = "INSERT INTO patients (fullName, birthDate, gender, cpf, rg, phone, email, address, city, state, zipCode, referralSource, createdAt) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
            
            address = f"{row.get('Logradouro', '')}, {row.get('Número Logradouro', '')} {row.get('Complemento Logradouro', '')}".strip()
            
            values = (
                full_name,
                birth_date,
                gender,
                cpf,
                row.get('RG'),
                row.get('Telefone1') or row.get('Telefone2') or row.get('Telefone3') or '',
                row.get('E-mail') or '',
                address,
                row.get('Cidade') or '',
                row.get('UF') or '',
                row.get('CEP') or '',
                row.get('Origem do paciente') or '',
                datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            )
            
            try:
                run_mysql(sql, values)
                count += 1
                if count % 100 == 0:
                    print(f"{count} pacientes importados...")
            except Exception as e:
                # print(f"Erro ao inserir {full_name}: {e}")
                pass
            
    print(f"Migração concluída: {count} pacientes importados.")

if __name__ == "__main__":
    migrate()
