# Integração D4Sign com Python

Este projeto fornece um cliente Python simples e eficiente para interagir com a API REST da D4Sign, permitindo automatizar o processo de assinatura eletrônica de documentos.

## Estrutura do Projeto

- `d4sign_client.py`: O módulo principal que contém a classe `D4SignClient`.
- `.env`: Arquivo para armazenamento seguro das credenciais (`tokenAPI` e `cryptKey`).
- `test_connection.py`: Script para validar a conexão e listar os cofres (safes) disponíveis.

## Requisitos

- Python 3.x
- Biblioteca `requests`
- Biblioteca `python-dotenv`

Instale as dependências com:
```bash
pip install requests python-dotenv
```

## Como Usar

### 1. Configuração

As credenciais já foram configuradas no arquivo `.env`. Certifique-se de não compartilhar este arquivo ou enviá-lo para repositórios públicos no GitHub.

### 2. Exemplo de Código

```python
from d4sign_client import D4SignClient

client = D4SignClient()

# 1. Listar os cofres (safes) para obter o uuid_safe
safes = client.list_safes()
uuid_safe = safes[0]['uuid_safe']

# 2. Fazer upload de um documento
# upload = client.upload_document(uuid_safe, "caminho/do/seu/documento.pdf")
# uuid_document = upload['uuid_document']

# 3. Adicionar signatários
# signers = [
#     {"email": "exemplo@email.com", "act": "1", "foreign": "0", "certificadoicp": "0", "assinatura_presencial": "0"}
# ]
# client.register_signers(uuid_document, signers)

# 4. Enviar para assinatura
# client.send_to_signers(uuid_document, message="Por favor, assine o documento.")
```

## Segurança

Este projeto utiliza variáveis de ambiente para proteger suas chaves de API. Nunca cole suas chaves diretamente no código-fonte.
