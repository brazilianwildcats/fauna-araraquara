
const USER_ID = 5649653;
const USER_LOGIN = "polones";
const PER_PAGE = 200;
const DELAY_MS = 1100;

const API_URL = "https://api.inaturalist.org/v1/observations";

const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

async function getPage(page) {
    const params = new URLSearchParams({
        user_id: String(USER_ID),
        order_by: "created_at",
        order: "desc",
        per_page: String(PER_PAGE),
        page: String(page),
        photos: "true",
    });

    const response = await fetch(`${API_URL}?${params}`);

    if (!response.ok) {
        throw new Error(`API retornou HTTP ${response.status} na página ${page}`);
    }

    return response.json();
}

async function main() {
    console.log("Consultando o histórico do iNaturalist...");
    console.log(`Conta esperada: ${USER_LOGIN}\n`);

    let page = 1;
    let totalObservations = 0;
    let totalPhotos = 0;
    let totalResults = null;
    const species = new Set();

    while (true) {
        console.log(`Consultando página ${page}...`);

        const data = await getPage(page);

        if (totalResults === null) {
            totalResults = data.total_results;

            console.log(`Total informado pela API: ${totalResults}`);

            if (totalResults > 10000) {
                console.log("\nATENÇÃO: existem mais de 10.000 resultados.");
                console.log("A paginação convencional não é suficiente.");
                console.log("Será necessário dividir a consulta por intervalos de IDs.");
                return;
            }
        }

        const observations = data.results || [];

        if (observations.length === 0) {
            break;
        }

        for (const observation of observations) {
            if (observation.user?.login !== USER_LOGIN) {
                throw new Error(
                    `Observação ${observation.id} não pertence à conta esperada.`
                );
            }

            totalObservations++;
            totalPhotos += observation.photos?.length || 0;

            if (observation.taxon?.name) {
                species.add(observation.taxon.name);
            }
        }

        console.log(
            `  Observações verificadas: ${totalObservations} / ${totalResults}`
        );

        if (totalObservations >= totalResults) {
            break;
        }

        page++;
        await sleep(DELAY_MS);
    }

    console.log("\n========================================");
    console.log("LEVANTAMENTO CONCLUÍDO");
    console.log("========================================");
    console.log(`Conta: ${USER_LOGIN}`);
    console.log(`Observações com fotografias: ${totalObservations}`);
    console.log(`Fotografias: ${totalPhotos}`);
    console.log(`Espécies identificadas: ${species.size}`);
    console.log(`Páginas consultadas: ${page}`);
    console.log("\nNenhuma fotografia foi baixada.");
}

main().catch((error) => {
    console.error("\nERRO:", error.message);
    process.exitCode = 1;
});
