# GemDesk CZK

AI aplikace pro:
- evidenci drahých kamenů
- retail / wholesale pricing
- profit kalkulace
- AI cenový komentář
- AI foto screening

## Deploy na Netlify

1. Import repository do Netlify
2. Build command: nechat prázdné
3. Publish directory: `.`
4. Environment variables:

OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

## AI backend

Používá Netlify Functions:

`/.netlify/functions/openai`

## Bezpečnost

OpenAI API key není uložen ve frontendu.
