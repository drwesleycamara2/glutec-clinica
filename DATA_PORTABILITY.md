# Portabilidade de Dados

## O que o sistema gera

O Glutec agora consegue gerar um pacote seguro de portabilidade no formato `.glutec-export`.

Esse arquivo:

- contem a base completa do banco de dados;
- pode incluir anexos, imagens, videos e uploads protegidos;
- eh comprimido com `gzip`;
- eh criptografado com `AES-256-GCM`;
- usa derivacao de chave com `scrypt`;
- so fica disponivel para download por tempo limitado;
- exige autenticacao administrativa para ser gerado.

## Como exportar

No sistema:

1. Acesse `Relatorios > Portabilidade de dados`.
2. Informe sua senha atual.
3. Se o 2FA estiver ativo, informe o codigo do autenticador.
4. Defina uma senha exclusiva para o pacote exportado.
5. Escolha se deseja incluir os arquivos protegidos.
6. Gere e baixe o pacote.

## Boas praticas

- Nunca reutilize a senha de login como senha do pacote.
- Guarde o arquivo e a senha em locais separados.
- Mantenha o arquivo em armazenamento criptografado.
- Compartilhe o pacote apenas com a equipe responsavel pela migracao.

## Estrutura logica do pacote

O arquivo exportado contem um manifesto JSON com:

- metadados da exportacao;
- parametros de criptografia;
- estatisticas da exportacao;
- `ciphertext` com o conteudo protegido.

Depois de descriptografado, o payload contem:

- `database`: tabelas e registros exportados;
- `files`: arquivos protegidos e seus metadados;
- `stats`: contagens gerais.

## Observacao importante

O sistema atual entrega a exportacao segura. A importacao automatica em outro sistema depende do formato que o novo sistema aceitar.
Por isso, na futura migracao, o desenvolvedor do sistema de destino podera:

- ler o manifesto;
- derivar a chave com `scrypt`;
- descriptografar com `AES-256-GCM`;
- descompactar o payload `gzip`;
- mapear `database` e `files` para o schema do sistema novo.
