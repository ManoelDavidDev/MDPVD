# MDPDV — Ponto de Venda e Gestão Comercial

<div align="center">

![Java](https://img.shields.io/badge/Java-21%20LTS-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)
![JavaFX](https://img.shields.io/badge/JavaFX-21-2E6B8D?style=for-the-badge&logo=java&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Manoel%20David-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/manoeldaviddev/)
![License](https://img.shields.io/badge/Licen%C3%A7a-Apache%202.0-blue?style=for-the-badge)

<p align="center">
  <strong>Sistema comercial desktop ágil, seguro e autossuficiente para pequenos e médios empreendimentos comerciais.</strong>
  <br />
  Projetado segundo os princípios de <em>Clean Architecture</em>, <em>SOLID</em>, persistência local atômica em <em>SQLite</em> e interface inspirada em tons desérticos.
</p>

</div>

---

## 📌 Sumário

1. [Sobre o Projeto](#-sobre-o-projeto)
2. [O Diferencial: Engenharia de Software na Era da IA](#-o-diferencial-engenharia-de-software-na-era-da-ia)
3. [Identidade Visual Deserto](#-identidade-visual-deserto)
4. [Arquitetura de Software](#-arquitetura-de-software)
5. [Módulos e Requisitos Funcionais](#-módulos-e-requisitos-funcionais)
6. [Motor de Precificação e Promoções (RF03)](#-motor-de-precificação-e-promoções-rf03)
7. [Emissão Fiscal NFC-e (RF08)](#-emissão-fiscal-nfc-e-rf08)
8. [Modelagem do Banco de Dados](#-modelagem-do-banco-de-dados)
9. [Como Executar o Projeto](#-como-executar-o-projeto)
10. [Testes Automatizados](#-testes-automatizados)
11. [Distribuição Nativa para Windows](#-distribuição-nativa-para-windows)
12. [Perfis de Acesso (Demonstração)](#-perfis-de-acesso-demonstração)
13. [Autor e Licença](#-autor-e-licença)

---

## 📖 Sobre o Projeto

O **MDPDV** é uma solução completa de frente de caixa (PDV) e retaguarda operacional, criada para atender com excelência supermercados, empórios, distribuidoras de bebidas, padarias e comércios em geral.

* **Operação Offline-First:** O sistema funciona de forma local, sem dependência mandatória de internet para registro de vendas, abertura/fechamento de caixa, movimentações financeiras e controle de estoque.
* **Segurança e Auditoria:** Todas as operações críticas (cancelamentos, descontos excedentes, sangrias e estornos) possuem trilha permanente de auditoria (*AuditLog*) e controle de acesso granular (*RBAC*).
* **Integridade Transacional:** O banco SQLite opera em modo **WAL (Write-Ahead Logging)** com chaves estrangeiras ativas, eliminando contenções de leitura/escrita e garantindo atomicidade total nas vendas.

---

## 💡 O Diferencial: Engenharia de Software na Era da IA

> *"Desenvolver software com IA não é delegar o pensamento, mas sim assumir o papel de Arquiteto, especificando com rigor técnico, validando critérios de negócio e orquestrando as ferramentas certas."*

Este projeto nasceu como resposta ao **Desafio 01 da Imersão Engenharia de Software: Dev na Era da IA (Alura)**, tendo como foco explorar o potencial do ecossistema do **Google AI Studio** na construção de um sistema de software corporativo completo.

### 🧠 A Jornada de Engenharia e Co-criação com IA

1. **Pesquisa de Mercado e Dores Reais de Negócio:**  
   Em vez de solicitar código genérico, o desenvolvimento começou com uma imersão nas regras operacionais reais de pequenos e médios estabelecimentos comerciais. Foram identificados gargalos vitais como: a necessidade de conciliação física estrita de gaveta (separando dinheiro em espécie de meios eletrônicos), regras de promoções comerciais por atacado (como o clássico *Pack de 12 latas por R$ 42,00* sem descontos duplicados) e contingência fiscal offline.

2. **Engenharia de Prompt & Arquitetura Orientada a Objetos:**  
   A estruturação do projeto seguiu rigorosamente os pilares de **Engenharia de Prompt**, estabelecendo papéis (*System Persona* como Engenheiro Sênior e Arquiteto de Sistemas), restrições inegociáveis, separação de responsabilidades em 4 camadas (*Clean Architecture*), princípios **SOLID** e padrões de código limpo (*Clean Code*).

3. **Iteração Colaborativa Multi-LLM (ChatGPT + Google AI Studio Build):**  
   Para garantir que nenhuma regra de negócio comercial ou fiscal fosse negligenciada, utilizei o **ChatGPT** na etapa inicial como revisor e crítico de especificações, refinando os critérios de aceitação e lapidando o *Prompt Master*. Em seguida, utilizei o ambiente avançado do **Google AI Studio** como motor de engenharia para gerar a arquitetura completa, implementar a persistência ACID em SQLite, estruturar as rotinas fiscais e produzir as interfaces desktop.

4. **Transformação de Paradigma:**  
   A imersão da Alura proporcionou uma mudança fundamental de método: a transição de um desenvolvedor executor para um **Engenheiro de Software protagonista**, capaz de guiar a IA através de contexto técnico profundo, decisões arquiteturais justificadas e testes automatizados.

---

## 🏜️ Identidade Visual Deserto

A interface do **MDPDV** foi inspirada na sobriedade de elementos naturais como areia, terra, barro e argila. O objetivo é proporcionar aos operadores um ambiente visual descansado, profissional e livre de poluição visual.

| Cor | Hexadecimal | Papel no Sistema |
| :--- | :--- | :--- |
| **Creme** | `#F5F0E6` | Fundo principal da aplicação e telas de trabalho |
| **Areia** | `#E8DCC8` | Superfícies estruturais, cabeçalhos de tabelas e divisores |
| **Terracota** | `#C87952` | Destaques de ação, tabs ativas e bordas de foco |
| **Barro** | `#A65F3F` | Botões primários (`Finalizar Venda`, `Abrir Caixa`, `Salvar`) |
| **Marrom** | `#80664C` | Bordas secundárias, rótulos e elementos gráficos de apoio |
| **Grafite** | `#39332D` | Tipografia de alto contraste para máxima legibilidade |

> **Filosofia da Tela Inicial:** Quando não há turno de caixa em andamento, a interface apresenta uma área de trabalho limpa com o estado **"CAIXA LIVRE"** e o botão principal **"ABRIR CAIXA"**, eliminando distrações e otimizando o fluxo de atendimento.

---

## 🏛️ Arquitetura de Software

O sistema adota o padrão em **4 camadas concêntricas (Clean Architecture)**:

```
┌─────────────────────────────────────────────────────────┐
│              1. Presentation (Apresentação)             │
│   • Telas JavaFX (FXML + CSS Deserto)                   │
│   • Orquestração visual sem regras de negócio embutidas │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│              2. Application (Aplicação)                 │
│   • Casos de uso transacionais (Venda, Caixa, Estoque)  │
│   • Controle RBAC e verificação de Supervisor inline    │
│   • Gravação automática de eventos de Auditoria         │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│                 3. Domain (Domínio Puro)                │
│   • Entidades e regras comerciais nucleares             │
│   • PricingEngine com cálculo de promoções e combos     │
│   • Totalmente desacoplado de frameworks e banco        │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│            4. Infrastructure (Infraestrutura)           │
│   • SQLite com WAL Mode e pool single-writer (HikariCP) │
│   • Versionamento via migrações (Flyway)                │
│   • Segurança BCrypt e Emissor Fiscal XML NFC-e         │
│   • Rotinas de Backup atômico online (VACUUM INTO)      │
└─────────────────────────────────────────────────────────┘
```

### Por que JDBC Puro + Flyway em vez de Hibernate no SQLite?
* **Boot Instantâneo:** Inicialização em menos de 1 segundo mesmo em computadores modestos de ponto de venda.
* **Prevenção de `SQLITE_BUSY`:** Controle cirúrgico da transação única de escrita, mantendo a consistência ACID sem conflitos de concorrência.
* **Versionamento Previsível:** O Flyway garante que qualquer atualização do banco seja executada de forma rastreável e idêntica em qualquer máquina.

---

## 🚀 Módulos e Requisitos Funcionais

| Módulo | RF | Descrição e Regras de Negócio |
| :--- | :--- | :--- |
| **Usuários & RBAC** | `RF01` | Autenticação com senha hash **BCrypt**, bloqueio automático após 5 tentativas inválidas, alteração de senha e controle por operação. |
| **Produtos & Preços** | `RF02` | Busca instantânea por Nome, SKU ou código de barras EAN-13, controle de preços de custo/venda, margem comercial e estoque mínimo. |
| **Precificação** | `RF03` | Motor comercial com preço unitário promocional, percentual, descontos por quantidade (packs), Leve X Pague Y e combos. |
| **Vendas (PDV)** | `RF04` | Leitura por código de barras, carrinho dinâmico, descontos autorizados, formas de pagamento divididas (Dinheiro, PIX, Débito, Crédito, Vale) e troco em dinheiro. |
| **Caixa** | `RF05` | Abertura com fundo de troco, conferência física na gaveta, apuração de diferenças (sobra/falta) e separação estrita de dinheiro físico e eletrônico. |
| **Sangria & Suprimento** | `RF06` | Movimentações financeiras imutáveis (nunca deletadas), histórico permanente e estorno auditado por supervisor. |
| **Estoque (Kardex)** | `RF07` | Baixa automática pós-venda, entradas de compra, ajustes autorizados, perdas/avarias e alertas de reposição para itens no estoque mínimo. |
| **Emissão Fiscal** | `RF08` | Emissão de NFC-e Modelo 65 (SEFAZ), XML 4.00, geração de Chave de Acesso de 44 dígitos com Módulo 11, contingência offline (`tpEmis=9`) e comprovante comercial. |
| **Relatórios** | `RF09` | Faturamento líquido, CMV, lucro bruto, margem percentual real, ticket médio, gráficos periódicos e exportação de dados em CSV. |
| **Auditoria & Backup** | `RF10` | Registro detalhado de logins, alterações de preços, vendas, fechamentos e backups atômicos consistentes do arquivo `.sqlite`. |

---

## 🏷️ Motor de Precificação e Promoções (RF03)

O motor de cálculo (`PricingEngine`) resolve o dilema de cálculo comercial em tempo real: **encontrar a melhor condição para o consumidor sem jamais acumular descontos duplicados sobre o mesmo item.**

### Regra do Pack de Cervejas (Exemplo Prático)
* Preço Avulso: **R$ 5,00** por lata (350ml).
* Condição do Pack: **12 latas por R$ 42,00** (R$ 3,50 por unidade).
* Se o cliente levar **14 unidades**:
  $$\text{Total} = (1 \times \text{R\$} 42,00) + (2 \times \text{R\$} 5,00) = \text{R\$} 52,00$$
  *(Economia de R$ 18,00 aplicada instantaneamente no cupom)*.

---

## 🧾 Emissão Fiscal NFC-e (RF08)

O sistema constrói documentos fiscais eletrônicos em conformidade com o manual da **SEFAZ (Versão 4.00)**:

* **Chave de Acesso:** Composta por 44 caracteres numéricos (cUF + AAMM + CNPJ + mod + serie + nNF + tpEmis + cNF + cDV), com cálculo automatizado do **dígito verificador via Módulo 11**.
* **Contingência Offline (`tpEmis=9`):** Permite a emissão do cupom ao cliente mesmo na ausência momentânea de conexão com a SEFAZ, com fila de retransmissão posterior.
* **Diferenciação Estrita:** Distinção explícita entre **Documento Fiscal Autorizado**, **Contingência**, **Documento Rejeitado** e **Comprovante Comercial Não Fiscal**.

---

## 🗄️ Modelagem do Banco de Dados

O banco local SQLite conta com 14 tabelas relacionais com integridade referencial ativa (`PRAGMA foreign_keys = ON`):

```
roles ───< role_permissions >─── permissions
  │
users ───< cash_registers ───< cash_movements
  │               │
  │               └───< sales ───< sale_items >─── products >─── categories
  │                       │            │             │
  │                       │            │             └───< stock_movements
  │                       │            └───< promotions
  │                       ├───< payments
  │                       └───< fiscal_documents
  │
  └───< audit_logs
```

---

## 💻 Como Executar o Projeto

### Pré-requisitos
* **Node.js** (v18 ou superior) ou **Bun**
* Navegador moderno (Chrome, Edge ou Firefox)

### Passo a Passo

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/ManoelDavidDev/MDPVD.git
   cd MDPVD
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Inicie o servidor local do MDPDV:**
   ```bash
   npm run dev
   ```

4. **Acesse no seu navegador:**
   Abra `http://localhost:3000` para operar o sistema. O banco SQLite `data/mdpdv.sqlite` será inicializado e populado automaticamente na primeira execução.

---

## 🧪 Testes Automatizados

O projeto conta com testes unitários focados nas regras nucleares de precificação e validações fiscais:

```bash
# Executar a suíte de testes de domínio
npx tsx --test server/domain/pricingEngine.test.ts
```

Resultados cobertos:
* ✅ Cálculo exato do Pack de 12 Cervejas por R$ 42,00 com itens avulsos excedentes.
* ✅ Garantia anti-duplicação de promoções vigentes sobre o mesmo produto.
* ✅ Geração de Chave de Acesso NFC-e de 44 dígitos com dígito verificador Mod11.

---

## 📦 Distribuição Nativa para Windows

Para gerar o executável ou instalador `.msi` independente (sem exigir que o cliente final tenha Java, Maven ou IDE instalados), o projeto utiliza a ferramenta nativa **`jpackage`** com JRE embutido:

```bat
REM Gerar pacote instalador Windows
call mvn clean package -DskipTests

jpackage ^
  --type msi ^
  --name "MDPDV" ^
  --app-version "1.0.0" ^
  --vendor "MDPDV Sistemas Comerciais" ^
  --input target/dist ^
  --main-jar mdpdv-desktop-1.0.0.jar ^
  --main-class br.com.mdpdv.Launcher ^
  --win-dir-chooser ^
  --win-menu ^
  --win-shortcut ^
  --dest target/installer
```

*(O blueprint Java 21 correspondente, o `pom.xml` e os arquivos `.fxml` estão disponíveis na aba **Configurações > Engenharia** dentro da aplicação).*

---

## 🔑 Perfis de Acesso (Demonstração)

O banco de dados já vem provisionado com 4 operadores pré-configurados:

| Perfil | Usuário | Senha | Permissões Principais |
| :--- | :--- | :--- | :--- |
| **Administrador** | `admin` | `admin123` | Acesso irrestrito, gestão de usuários, fiscal e backups SQLite. |
| **Gerente** | `gerente` | `gerente123` | Estoque, precificação, promoções, relatórios e cancelamentos. |
| **Supervisor** | `supervisor` | `super123` | Autorização de descontos altos, estornos de sangria e cancelamentos. |
| **Operador de Caixa** | `operador` | `caixa123` | Frente de caixa ágil, registro de vendas e abertura/fechamento. |

---

## 👤 Autor e Licença

Desenvolvido por **Manoel David**  
* 🚀 Estudante de Engenharia de Software | Desenvolvedor de Software
* 💼 **LinkedIn:** [linkedin.com/in/manoeldaviddev](https://www.linkedin.com/in/manoeldaviddev/)
* 🐙 **GitHub:** [@ManoelDavidDev](https://github.com/ManoelDavidDev)

Distribuído sob a licença **Apache 2.0**. Consulte o arquivo de licença para mais detalhes.
