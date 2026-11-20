
const USER_ID = 5649653;
const USER_LOGIN = "polones";
const PER_PAGE = 20;

async function main() {
    const params = new URLSearchParams({
        user_id: String(USER_ID),
        order_by: "created_at",
        order: "desc",
        per_page: String(PER_PAGE),
        photos: "true",
    });

    const url = `https://api.inaturalist.org/v1/observations?${params}`;

    console.log("Consultando o iNaturalist...\n");

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Erro na API: HTTP ${response.status}`);
    }

    const data = await response.json();

    const observations = data.results.filter(
        (observation) => observation.user?.login === USER_LOGIN
    );

    console.log(`Observações encontradas: ${observations.length}\n`);

    for (const observation of observations) {
        console.log("----------------------------------------");
        console.log(`ID: ${observation.id}`);
        console.log(`Espécie: ${observation.taxon?.name ?? "Não identificada"}`);
        console.log(`Nome popular: ${observation.taxon?.preferred_common_name ?? "Não informado"}`);
        console.log(`Data da observação: ${observation.observed_on ?? "Não informada"}`);
        console.log(`Data do cadastro: ${observation.created_at}`);
        console.log(`Local: ${observation.place_guess ?? "Não informado"}`);
        console.log(`Fotos: ${observation.photos.length}`);
        console.log(`Qualidade: ${observation.quality_grade}`);
        console.log(`Link: ${observation.uri}`);

        for (const [index, photo] of observation.photos.entries()) {
            const originalUrl = photo.url.replace("/square.", "/original.");
            console.log(`  Foto ${index + 1}: ${originalUrl}`);
        }
    }

    console.log("\nConsulta concluída. Nenhum artigo foi criado.");
}

main().catch((error) => {
    console.error("\nFalha na consulta:", error.message);
    process.exitCode = 1;
});
