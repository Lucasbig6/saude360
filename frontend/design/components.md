# Saude360 — Component Guidelines

## 0. Contexto de Projeto

O Projeto é o principal contexto de trabalho do Saude360.

Análises, gráficos e painéis pertencem a um Projeto.

### Hierarquia

```text
Projeto
│
├── Fontes de dados
│
├── Análises
│   └── Gráficos
│
└── Painéis
    └── Widgets
    
---

## 1. Page Header

Usado no topo das páginas internas.

### Estrutura

- título
- descrição opcional
- ações principais
- ações secundárias

### Regras

- Não utilizar títulos gigantes.
- Não colocar todas as ações como botões primários.
- A ação principal deve ser visualmente dominante.
- Descrição deve ser curta.
- Evitar elementos decorativos.

### Exemplo

```text
Indicadores
Acompanhe os principais indicadores de saúde.

[Exportar] [Adicionar indicador]