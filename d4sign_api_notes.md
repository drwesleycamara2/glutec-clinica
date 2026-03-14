# D4Sign API Reference Notes

## Base URL
- Produção: https://secure.d4sign.com.br/api/v1

## Auth
- Parâmetros: ?tokenAPI={token}&cryptKey={crypt_key}
- Headers: Accept: application/json, Content-Type: application/json

## Fluxo
1. Upload do documento
2. Cadastrar webhook (opcional)
3. Cadastrar signatários
4. Enviar para assinatura
5. Embed (opcional)

## Credenciais do Wésley (Produção)
- tokenAPI: live_7d0a13cc11af0765b3100c9bdca360c862b57ae63bf9f5836d41cb67394dd790
- cryptKey: live_crypt_hShAdQ3il2jfdGWF7U1wybozsqGGouPC

## Limite
- 10 requisições por hora (padrão)
