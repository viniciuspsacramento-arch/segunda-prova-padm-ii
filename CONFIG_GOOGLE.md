# Google OAuth — prova online

## O que o agente **nao** pode fazer por voce

Login no [Google Cloud Console](https://console.cloud.google.com) e cliques em **Usuarios de teste** exigem **sua** conta Google. Nao ha como o Cursor fazer isso remotamente sem `gcloud` ja autenticado na sua maquina.

## O que voce pode rodar em 2 minutos (APIs automaticas)

No PowerShell, na pasta `prova-final-ADM`:

```powershell
gcloud auth login
.\scripts\configurar-google-prova.ps1 -ProjectId SEU_PROJECT_ID -ProfessorEmail seu@gmail.com -EmailsFile .\scripts\lista_emails_exemplo.txt
```

Isso **ativa** Sheets, Drive e Picker. Gera `scripts/usuarios_teste_oauth.txt` para **colar** em Usuarios de teste (um passo manual no console).

**Upload do computador** exige **Google Drive API** (nao basta Sheets). **Nova planilha** so precisa de Sheets.

## Tela "Google nao verificou este app" sem "Avancado"

O Google mudou a interface. Em app **Em teste**, costuma aparecer:

- **Continuar** (ou "Acessar") = prosseguir (use este)
- **Voltar a seguranca** = cancela

Se **so** existir "Voltar a seguranca", o e-mail logado **nao** esta em **Usuarios de teste** (mesmo projeto do Client ID) ou a conta e Workspace com bloqueio de apps de terceiros.

**Plano B (sem upload):** Nova planilha → no Google Sheets: Arquivo → Importar → Upload → escolher o .xlsx do PC.

## Passo manual obrigatorio (30 s)

1. Console → **APIs e servicos** → **Tela de consentimento OAuth**
2. Se status = **Teste**: **Usuarios de teste** → **ADD USERS** → cole todos os e-mails do arquivo gerado
3. **Credenciais** → Client ID **Web** → origem:
   `https://prova-final-adm-production.up.railway.app`

## Quantos alunos?

| Situacao | Caminho |
|----------|---------|
| **Ate ~100 e-mails** | OAuth em **Teste** + lista de usuarios de teste (mais rapido) |
| **Turma grande / lista impossivel** | Publicar app (**Producao**) — pode exigir verificacao Google |

## Teste

1. Aba anonima → URL da prova no Railway  
2. **Enviar planilha do computador (Google)** ou **Google Sheets — nova planilha**  
3. Login com e-mail que esta em Usuarios de teste  

Se funcionar so com o seu e-mail, falta adicionar o e-mail do aluno na lista de teste.

## Railway

- `GOOGLE_CLIENT_ID`
- `GOOGLE_API_KEY`
- `PROFESSOR_EMAIL` (alertas de compartilhamento)
