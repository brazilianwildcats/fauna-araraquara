---
title: "BioPoster: Ferramenta para transformar dados do iNaturalist em relatórios visuais"
published: 2026-11-19T16:00:00-03:00
description: "Conheça o BioPoster, uma ferramenta gratuita em fase beta que organiza arquivos CSV exportados do iNaturalist em cartazes padronizados com gráficos de sazonalidade e atividade."
tags: ["BioPoster", "iNaturalist", "Ciência Cidadã", "Ferramentas", "Monitoramento"]
category: "Ferramentas"
draft: false
---

Desenvolvi uma ferramenta para transformar arquivos CSV exportados do iNaturalist em relatórios visuais sobre registros de fauna.

O projeto surgiu da necessidade de compreender melhor as observações que publico em meu próprio perfil, principalmente os registros obtidos por meio de câmeras de trilha. Com muitos dados acumulados ao longo dos anos, nem sempre é fácil perceber rapidamente em quais períodos determinada espécie foi registrada com maior frequência.

A ferramenta organiza essas informações em um cartaz padronizado, com gráficos e campos editáveis. A partir dos dados disponíveis no arquivo CSV, é possível visualizar informações como:

- Quantidade total de observações;
- Distribuição dos registros por ano;
- Distribuição dos registros por mês;
- Horários diurno ou noturno das observações;
- Período abrangido pelos dados;
- Informações básicas sobre a espécie;
- Fotografias escolhidas pelo próprio usuário do seu acervo.

## Relatórios por cidade

Uma das aplicações mais interessantes do projeto é a geração de relatórios por município.

No sistema de exportação do iNaturalist, o usuário pode definir a área e os filtros que deseja analisar. Dessa forma, é possível gerar um arquivo CSV contendo, por exemplo, todas as observações de uma determinada espécie registradas em uma cidade.

Depois de importar esse arquivo na ferramenta, os dados são apresentados de maneira visual e mais fácil de interpretar.

Esse tipo de relatório pode ajudar a demonstrar:

- Quais espécies já foram registradas no município;
- Em quais meses ocorreram mais observações;
- Como os registros se distribuem ao longo dos anos;
- Quais horários apresentam maior atividade registrada;
- Quais espécies possuem poucos registros e podem precisar de maior atenção ou monitoramento.

A ferramenta pode ser útil para observadores da natureza, projetos de ciência cidadã, grupos ambientais, pesquisadores, escolas, secretarias municipais, prefeituras e pessoas que trabalham com monitoramento de fauna.

É importante destacar que o relatório representa os dados presentes no arquivo exportado. Portanto, os resultados dependem dos filtros utilizados no iNaturalist e da quantidade de observações disponíveis. A ausência de registros não significa necessariamente que uma espécie não exista naquela região, mas apenas que ela pode ainda não ter sido observada ou publicada na plataforma.

## Diferentes possibilidades de uso

O relatório não precisa ser limitado a uma cidade. O arquivo CSV pode ser gerado com observações filtradas por:

- País;
- Estado;
- Município;
- Local ou área definida;
- Espécie;
- Projeto;
- Usuário do iNaturalist;
- Período específico.

Assim, a mesma ferramenta pode ser utilizada tanto para analisar os registros de um único observador quanto para criar uma visão geral das observações disponíveis em uma região.

Todos os principais campos do cartaz são editáveis, permitindo revisar os textos, complementar as informações e adaptar o relatório antes de gerar o PDF.

**O projeto ainda está em fase beta,** mas já está funcional. Ele continuará sendo testado e aperfeiçoado conforme forem identificadas novas necessidades.

## Acessar o projeto

**Programa para gerar os relatórios:**  
[https://bioposter.pages.dev/](https://bioposter.pages.dev/)

O objetivo é oferecer uma forma simples e acessível de transformar dados de ciência cidadã em informações visuais, facilitando a compreensão, a divulgação e a valorização dos registros de biodiversidade publicados no iNaturalist.

## Relatórios prontos em PDF

[Acessar pasta com exemplos de relatórios no Google Drive](https://drive.google.com/drive/folders/1WVLAq1nfFwnFBKK-uhoYfyjfIXUD9a3J?usp=sharing)