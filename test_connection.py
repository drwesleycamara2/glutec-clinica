from d4sign_client import D4SignClient
import json

def test_api_connection():
    print("Iniciando teste de conexão com a API D4Sign...")
    try:
        client = D4SignClient()
        
        # O endpoint /safes é um dos mais simples para testar a autenticação
        print("Solicitando lista de cofres (safes)...")
        safes = client.list_safes()
        
        print("\nResposta da API:")
        print(json.dumps(safes, indent=4))
        
        if isinstance(safes, list):
            print("\nConexão estabelecida com sucesso! Você tem acesso à conta.")
        elif isinstance(safes, dict) and safes.get("message"):
            print(f"\nA API retornou uma mensagem: {safes['message']}")
        else:
            print("\nResposta inesperada da API. Verifique suas credenciais.")
            
    except Exception as e:
        print(f"\nOcorreu um erro durante o teste: {e}")

if __name__ == "__main__":
    test_api_connection()
