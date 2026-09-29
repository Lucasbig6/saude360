# MoniSUS

> Plataforma de inteligência, exploração e análise de dados para a gestão do SUS.

O **MoniSUS** é uma plataforma de Analytics voltada para transformar dados de saúde em informações exploráveis, visualizações e análises úteis para gestores, analistas e equipes técnicas.

A proposta é oferecer uma experiência própria de análise de dados, inspirada em ferramentas de BI como Power BI e Metabase, mas construída especificamente para o contexto de dados públicos e institucionais do SUS.

O projeto utiliza o **Apache Superset como motor de Analytics e Business Intelligence**, enquanto o MoniSUS fornece a camada de aplicação, experiência do usuário, API e futuras capacidades de inteligência artificial.

---

## 🎯 Objetivo

O MoniSUS busca reduzir a distância entre:

```text
Dados → Tratamento → Consulta → Análise → Visualização → Decisão
```

A plataforma deverá permitir que diferentes perfis trabalhem com os dados de acordo com suas necessidades.

### Analistas

* Preparar e organizar datasets;
* Explorar dados;
* Criar consultas;
* Criar métricas e dimensões;
* Construir gráficos;
* Criar dashboards;
* Aplicar filtros;
* Validar análises;
* Disponibilizar informações para outros usuários.

### Gestores e usuários finais

* Consultar dashboards;
* Aplicar filtros;
* Explorar indicadores;
* Cruzar informações;
* Visualizar gráficos e mapas;
* Consultar dados de forma mais simples;
* Utilizar análises preparadas pelos analistas.

### Futuramente, IA

A plataforma poderá permitir interação em linguagem natural com os dados:

```text
"Quais municípios apresentaram maior aumento
de internações nos últimos seis meses?"
```

A IA poderá interpretar a solicitação, construir uma consulta, executar a análise e apresentar os resultados de forma compreensível.

---

# 🧠 Conceito

O MoniSUS **não pretende ser apenas uma interface diferente do Superset**.

O Superset será utilizado como uma infraestrutura especializada em Analytics, enquanto o MoniSUS será responsável pela experiência e pelas regras da plataforma.

```text
                    MONISUS
┌─────────────────────────────────────────────┐
│                                             │
│                  Frontend                   │
│                                             │
│ Dashboards │ Explorar │ Dados │ IA │ Admin  │
│                                             │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
                MoniSUS API
                    FastAPI
                       │
                       ▼
                  Superset
              Analytics Engine
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
         Consultas           Visualizações
             │                   │
             └─────────┬─────────┘
                       ▼
                  Banco de Dados
```

Essa separação permite que o MoniSUS evolua sem depender diretamente da interface web do Superset.

---

# 🏗️ Arquitetura

A arquitetura inicial será baseada em três camadas principais:

### 1. MoniSUS Frontend

Interface utilizada pelos usuários.

Responsabilidades:

* Navegação;
* Dashboards;
* Exploração de dados;
* Filtros;
* Visualizações;
* Administração;
* Futuras interfaces de IA.

Tecnologia planejada:

* Next.js
* React
* TypeScript

---

### 2. MoniSUS Backend

API principal da aplicação.

Responsabilidades:

* Autenticação;
* Autorização;
* Regras de negócio;
* API pública do MoniSUS;
* Comunicação com o Superset;
* Abstração da API do Superset;
* Integração futura com IA;
* Auditoria e controle de acesso.

Tecnologia:

* Python
* FastAPI

A aplicação não deverá depender diretamente da API do Superset no frontend.

```text
Frontend
   │
   ▼
MoniSUS API
   │
   ▼
Superset API
```

O backend funcionará como uma camada de integração entre a aplicação e o motor de Analytics.

---

### 3. Apache Superset

O Superset será utilizado como **Analytics Engine**.

Entre suas responsabilidades estão:

* Consultas analíticas;
* Datasets;
* Charts;
* Dashboards;
* SQL;
* Filtros;
* Exploração;
* Metadados;
* Execução de consultas;
* Cache;
* Exportação;
* Controle de objetos analíticos.

O Superset possui uma API REST extensa, com endpoints para dashboards, charts, datasets, databases, SQL Lab, consultas, autenticação, segurança e outros recursos.

O MoniSUS utilizará somente o subconjunto necessário dessa API.

---

# 📊 Principais módulos

A estrutura funcional planejada é:

```text
MoniSUS
│
├── Dashboard
│
├── Explorar Dados
│
├── Datasets
│
├── Consultas
│
├── Indicadores
│
├── Análises
│
├── IA
│
├── Alertas
│
├── Administração
│
└── Catálogo de Dados
```

---

## 📊 Dashboards

Área destinada à visualização dos painéis analíticos.

Funcionalidades planejadas:

* Listagem de dashboards;
* Visualização;
* Filtros;
* Abas;
* Gráficos;
* Favoritos;
* Compartilhamento;
* Exportação;
* Versionamento.

O Superset possui endpoints específicos para gerenciamento de dashboards, charts associados, datasets, filtros, favoritos, screenshots, exportação e versionamento.

---

## 🔎 Explorar Dados

O módulo de exploração será uma das principais funcionalidades do MoniSUS.

A ideia é permitir que o usuário construa análises sem necessariamente escrever SQL.

Exemplo:

```text
Dataset
   ↓
Dimensão
   ↓
Métrica
   ↓
Filtros
   ↓
Agrupamento
   ↓
Visualização
```

Exemplo:

```text
Dataset: Internações

Dimensão:
Município

Métrica:
Quantidade de internações

Período:
Janeiro → Agosto

Visualização:
Gráfico de barras
```

O resultado será produzido pelo motor analítico do Superset.

---

# 🗃️ Dados e Datasets

O MoniSUS deverá possuir uma visão própria para gerenciamento e exploração dos datasets.

O módulo poderá apresentar:

* Datasets disponíveis;
* Colunas;
* Tipos de dados;
* Métricas;
* Dimensões;
* Valores distintos;
* Relacionamentos;
* Origem dos dados;
* Atualização;
* Descrição;
* Metadados.

O Superset disponibiliza APIs para criação, consulta, atualização, duplicação, atualização de colunas e gerenciamento de datasets.

---

# 🧮 Consultas

O sistema deverá permitir execução de consultas analíticas.

A integração inicial poderá utilizar recursos do SQL Lab e das APIs de consulta do Superset.

Principais operações:

```text
Executar consulta
      ↓
Obter resultado
      ↓
Processar resposta
      ↓
Exibir tabela/gráfico
```

Entre os recursos disponíveis na API estão execução de SQL, obtenção de resultados, estimativa de consulta e formatação de SQL.

---

# 🤖 Inteligência Artificial

A IA será integrada posteriormente ao núcleo analítico.

O objetivo não é simplesmente adicionar um chatbot, mas criar uma interface capaz de trabalhar sobre os dados disponíveis na plataforma.

Exemplo:

```text
Usuário
   │
   │ "Compare os gastos hospitalares
   │  entre os municípios."
   ▼
   IA
   │
   ├── identifica dataset
   ├── identifica métricas
   ├── identifica dimensões
   ├── constrói consulta
   │
   ▼
Superset
   │
   ▼
Resultado
   │
   ▼
IA
   │
   ├── interpreta
   ├── explica
   └── apresenta
   ▼
Usuário
```

A IA deverá trabalhar sobre as capacidades analíticas existentes, evitando criar um segundo motor de consulta paralelo.

---

# 🔐 Segurança

A autenticação e autorização serão responsabilidade da camada MoniSUS.

O Superset possui recursos próprios de:

* Usuários;
* Roles;
* Grupos;
* Permissões;
* Recursos;
* Row Level Security;
* Tokens;
* Sessões.

Esses recursos poderão ser utilizados internamente quando necessário, mas o objetivo é evitar que a lógica de segurança da aplicação fique espalhada pelo frontend.

A API do Superset disponibiliza endpoints para autenticação, usuários, roles, grupos, permissões e Row Level Security.

---

# 🔌 Integração com Superset

O MoniSUS não deverá expor toda a API do Superset diretamente.

Será criada uma camada de integração:

```text
backend/
└── superset/
    ├── client.py
    ├── auth.py
    ├── dashboards.py
    ├── charts.py
    ├── datasets.py
    └── queries.py
```

O `SupersetClient` será responsável pela comunicação com o Superset.

Exemplo conceitual:

```python
class SupersetClient:

    async def login(self):
        ...

    async def list_dashboards(self):
        ...

    async def get_dashboard(self, dashboard_id):
        ...

    async def list_charts(self):
        ...

    async def execute_query(self, query):
        ...
```

O frontend deverá consumir a API do MoniSUS:

```text
GET    /api/analyses                 # domínio Saude360 (PostgreSQL próprio)
GET    /api/dashboards               # domínio Saude360 (PostgreSQL próprio)
POST   /api/dashboards
GET    /api/dashboards/by-slug/{slug}   # público (link compartilhado)
GET    /api/superset/dashboards      # proxy do Superset (padrão /api/v1/dashboard/)
GET    /api/datasets
GET    /api/charts
POST   /api/queries
```

e não diretamente:

```text
GET /api/v1/dashboard/
GET /api/v1/dataset/
GET /api/v1/chart/
```

Isso cria uma camada de abstração entre o produto e o Superset.

---

# 🧩 API Headless

A API Headless do MoniSUS será construída progressivamente.

O objetivo inicial não é reproduzir todos os endpoints do Superset, mas selecionar os recursos necessários para a experiência da plataforma.

### Primeira camada

```text
Authentication
├── Login
└── Refresh

Dashboards
├── List
├── Get
├── Create
├── Update
└── Charts

Charts
├── List
├── Get
├── Create
├── Update
└── Data

Datasets
├── List
├── Get
├── Columns
└── Distinct values

Queries
└── Execute

SQL
├── Execute
└── Results
```

Essa camada poderá crescer conforme as necessidades reais do produto.

---

# 🚀 MVP

O primeiro objetivo do projeto será provar o fluxo completo:

```text
Usuário
   ↓
MoniSUS Frontend
   ↓
MoniSUS API
   ↓
Superset
   ↓
Banco de dados
   ↓
Resultado
   ↓
MoniSUS
```

### Etapa 1 — Infraestrutura

* [ ] Subir Superset;
* [ ] Configurar banco;
* [ ] Validar acesso à API;
* [ ] Configurar autenticação;
* [ ] Criar ambiente de desenvolvimento.

### Etapa 2 — Backend

* [ ] Criar FastAPI;
* [ ] Criar `SupersetClient`;
* [ ] Implementar autenticação;
* [ ] Implementar dashboards;
* [ ] Implementar charts;
* [ ] Implementar datasets;
* [ ] Implementar consultas.

### Etapa 3 — Frontend

* [ ] Criar shell do MoniSUS;
* [ ] Dashboard;
* [ ] Explorar dados;
* [ ] Dataset explorer;
* [ ] Visualizações;
* [ ] Filtros.

### Etapa 4 — Integração

* [ ] Dashboard real;
* [ ] Chart real;
* [ ] Consulta real;
* [ ] Filtros;
* [ ] Exportação.

### Etapa 5 — Inteligência

* [ ] Camada de IA;
* [ ] Linguagem natural → consulta;
* [ ] Análise automática;
* [ ] Explicação de resultados;
* [ ] Geração de visualizações.

---

# 🛠️ Stack

## Backend

* Python
* FastAPI
* Pydantic
* SQLAlchemy
* PostgreSQL

## Frontend

* Next.js
* React
* TypeScript

## Analytics

* Apache Superset

## Infraestrutura

* Docker
* Docker Compose
* PostgreSQL
* Redis

## Futuro

* LLM / IA
* Sistema de alertas
* Agentes analíticos
* Integrações institucionais

---

# 🐳 Ambiente de desenvolvimento (Docker)

Comandos principais:

```text
make dev       # sobe a stack completa (db + superset + backend + frontend)
make stop      # para os containers (mantém volumes)
make logs      # tail dos logs de todos os containers
make down      # para e remove os containers (mantém volumes)
```

### Observações importantes

* **`superset_init` é um job one-shot**: roda as migrations e a configuração do Superset e termina com `Exited (0)`. Isso é **esperado** — ele não deve ficar rodando. O `superset_app` só sobe depois que ele completa com sucesso.
* **Volume de `node_modules` do frontend**: o container monta o volume `saude360_frontend_node_modules` sobre `/app/node_modules`, que é preenchido uma única vez a partir do image. Sempre que o `package-lock.json` mudar, esse volume fica desatualizado (faltam binários como `@next/swc-linux-x64-gnu`) e o `next dev` quebra. Nesse caso, remova o volume para que ele seja repovoado pelo image:

  ```bash
  docker compose rm -sf frontend
  docker volume rm saude360_frontend_node_modules saude360_frontend_next
  docker compose up --build frontend
  ```

* ⚠️ **Não use `docker compose down -v`** para isso: o `-v` apaga também os volumes de dados do Postgres (`saude360_saude360_pgdata`) e do Superset (`saude360_db_home`).
* **Scripts `.sh` sempre com LF**: o repositório usa `.gitattributes` (`*.sh text eol=lf`) porque um `docker-entrypoint.sh` com CRLF falha no Linux com `exec: no such file or directory`. O `backend/Dockerfile` também remove `\r` no build como defesa.

---

# 📁 Estrutura inicial

```text
monisus/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── auth/
│   │   ├── superset/
│   │   └── main.py
│   │
│   ├── tests/
│   └── pyproject.toml
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
│
├── infrastructure/
│   └── docker/
│
├── docs/
│
└── README.md
```

---

# 🔭 Visão de longo prazo

O MoniSUS pretende evoluir de uma plataforma de dashboards para uma **camada de inteligência sobre os dados do SUS**.

A evolução esperada é:

```text
                 MONISUS
                    │
        ┌───────────┼───────────┐
        │           │           │
    Dashboards   Exploração     IA
        │           │           │
        └───────────┼───────────┘
                    │
              Analytics Engine
                    │
                 Superset
                    │
                 Dados SUS
```

O princípio central do projeto é:

> **O Superset fornece o motor analítico. O MoniSUS transforma esse motor em um produto de análise de dados orientado ao SUS.**

---

# 📚 Referências

* Apache Superset — API REST
* Superset OpenAPI
* PostgreSQL
* FastAPI
* Next.js

A instalação local do Superset disponibiliza a especificação OpenAPI em:

```text
http://localhost:8088/api/v1/_openapi
```

e a interface Swagger em:

```text
http://localhost:8088/swagger/v1
```

A documentação levantada do projeto contém a referência dos endpoints de autenticação, dashboards, charts, datasets, databases, SQL Lab, queries, segurança, RLS, reports, temas e demais recursos disponíveis na API.

---

## Status

🚧 **Em desenvolvimento**

O projeto encontra-se na fase de definição da arquitetura e implementação da primeira integração **MoniSUS API → Apache Superset**.
