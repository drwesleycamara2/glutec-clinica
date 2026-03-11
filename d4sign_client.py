import os
import requests
from dotenv import load_dotenv

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

class D4SignClient:
    def __init__(self):
        self.token_api = os.getenv("D4SIGN_TOKEN_API")
        self.crypt_key = os.getenv("D4SIGN_CRYPT_KEY")
        self.base_url = os.getenv("D4SIGN_BASE_URL", "https://secure.d4sign.com.br/api/v1")
        
        if not self.token_api or not self.crypt_key:
            raise ValueError("As credenciais D4SIGN_TOKEN_API e D4SIGN_CRYPT_KEY devem estar no .env")

    def _get_auth_params(self):
        return {
            "tokenAPI": self.token_api,
            "cryptKey": self.crypt_key
        }

    def list_safes(self):
        """Lista os cofres (safes) disponíveis na conta."""
        url = f"{self.base_url}/safes"
        params = self._get_auth_params()
        response = requests.get(url, params=params)
        return response.json()

    def upload_document(self, safe_uuid, file_path):
        """Faz o upload de um documento para um cofre específico."""
        url = f"{self.base_url}/documents/{safe_uuid}/upload"
        params = self._get_auth_params()
        
        with open(file_path, 'rb') as f:
            files = {'file': f}
            response = requests.post(url, params=params, files=files)
        return response.json()

    def register_signers(self, document_uuid, signers):
        """
        Cadastra signatários em um documento.
        signers: lista de dicionários com chaves 'email', 'act', 'foreign', 'certificadoicp', 'assinatura_presencial'
        """
        url = f"{self.base_url}/documents/{document_uuid}/createlist"
        params = self._get_auth_params()
        data = {"signers": signers}
        response = requests.post(url, params=params, json=data)
        return response.json()

    def send_to_signers(self, document_uuid, message="", skip_email=False):
        """Envia o documento para os signatários cadastrados."""
        url = f"{self.base_url}/documents/{document_uuid}/sendtosigner"
        params = self._get_auth_params()
        data = {
            "message": message,
            "skip_email": "1" if skip_email else "0"
        }
        response = requests.post(url, params=params, data=data)
        return response.json()

    def get_document_status(self, document_uuid):
        """Consulta o status atual de um documento."""
        url = f"{self.base_url}/documents/{document_uuid}/status"
        params = self._get_auth_params()
        response = requests.get(url, params=params)
        return response.json()

if __name__ == "__main__":
    # Teste rápido de conexão
    try:
        client = D4SignClient()
        print("Cliente D4Sign inicializado com sucesso.")
        # print(client.list_safes()) # Descomente para testar a listagem de cofres
    except Exception as e:
        print(f"Erro ao inicializar cliente: {e}")
