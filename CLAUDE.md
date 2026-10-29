# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral do projeto

Extensão para o Chrome que manipula o localStorage, com o objetivo de substituir ferramentas de terceiros com possíveis vulnerabilidades.

## Especificações

- Salvar, ler e remover itens do localStorage
- Botão para limpar todo o localStorage (com confirmação)
- Importar JSON e colocar todos os dados no localStorage
- Botão para copiar todos os dados do localStorage (formato JSON)

## Stack e ferramentas

HTML, CSS e JavaScript puros (Chrome Extension Manifest V3). Sem build, sem dependências, sem bibliotecas externas.

## Comandos

- Carregar a extensão: `chrome://extensions` → ativar "Modo do desenvolvedor" → "Carregar sem compactação" → selecionar esta pasta
- Recarregar após mudanças: botão de recarregar no card da extensão em `chrome://extensions`
- Checar sintaxe do JS: `node --check popup.js`

Não há testes automatizados nem lint.

## Arquitetura

- `manifest.json`: permissões `activeTab` e `scripting`, e nada além disso. Sem `host_permissions` e sem content scripts fixos; a extensão só acessa a aba quando o usuário clica no ícone.
- `popup.html` / `popup.css` / `popup.js`: toda a interface e a lógica ficam no popup.
- O popup não acessa o localStorage da página diretamente. Ele injeta funções com `chrome.scripting.executeScript` (`runInPage` em `popup.js`). As funções `page*` rodam dentro da aba, então precisam ser autocontidas (não podem usar variáveis ou funções de fora do próprio corpo) e devolvem `{ error }` em vez de lançar exceção.
- A injeção usa o mundo `ISOLATED` (o padrão), para que scripts da página não consigam interceptar as chamadas ao `Storage`.
- Copiar acontece no popup (`navigator.clipboard`). A importação é feita colando o JSON na caixa de texto, sem seletor de arquivo.
- Formato do JSON: objeto plano `{ "chave": "valor" }`. Na importação, valores que não são string passam por `JSON.stringify`.

## Convenções

- Segurança é o objetivo do projeto: nada de `innerHTML` com dados da página (use `textContent`/`value`), nada de código remoto e nenhuma permissão nova sem necessidade.
- Interface e mensagens em português.
