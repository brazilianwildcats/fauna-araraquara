
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const USER_ID = 5649653;
const USER_LOGIN = "polones";

const PER_PAGE = 200;
const API_DELAY_MS = 1100;
const MAX_ATTEMPTS = 4;

const BASE_DIR =
    process.env.LOCALAPPDATA ||
    path.join(os.homedir(), "AppData", "Local");

const OUTPUT_DIR = path.join(
    BASE_DIR,
    "FaunaAraraquara",
    "inat-download"
);

const STATE_PATH = path.join(OUTPUT_DIR, "estado.json");
const REPORT_PATH = path.join(OUTPUT_DIR, "relatorio.json");
const ERRORS_PATH = path.join(OUTPUT_DIR, "erros.json");

const API_URL = "https://api.inaturalist.org/v1/observations";

const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, description) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(url);

            if (response.ok) {
                return response;
            }

            const retryable =
                response.status === 429 ||
                response.status >= 500;

            if (!retryable || attempt === MAX_ATTEMPTS) {
                throw new Error(`HTTP ${response.status}`);
            }

            const retryAfter = Number(
                response.headers.get("retry-after")
            );

            const waitTime = retryAfter > 0
                ? retryAfter * 1000
                : attempt * 2000;

            console.log(
                `${description}: HTTP ${response.status}. ` +
                `Nova tentativa em ${Math.ceil(waitTime / 1000)}s.`
            );

            await sleep(waitTime);
        } catch (error) {
            lastError = error;

            if (
                error.message.startsWith("HTTP ") ||
                attempt === MAX_ATTEMPTS
            ) {
                break;
            }

            const waitTime = attempt * 2000;

            console.log(
                `${description}: ${error.message}. ` +
                `Tentativa ${attempt + 1}/${MAX_ATTEMPTS}.`
            );

            await sleep(waitTime);
        }
    }

    throw lastError || new Error("Falha desconhecida.");
}

async function writeJsonAtomic(filePath, data) {
    const temporaryPath = `${filePath}.tmp`;

    await fs.writeFile(
        temporaryPath,
        JSON.stringify(data, null, 2),
        "utf8"
    );

    await fs.rename(temporaryPath, filePath);
}

async function backupFile(filePath) {
    const backupPath = `${filePath}.pre-metadata.bak`;

    try {
        await fs.copyFile(
            filePath,
            backupPath,
            fs.constants.COPYFILE_EXCL
        );

        console.log(`Backup criado: ${path.basename(backupPath)}`);
    } catch (error) {
        if (error.code !== "EEXIST") {
            throw error;
        }

        console.log(
            `Backup já existente: ${path.basename(backupPath)}`
        );
    }
}

async function loadState() {
    const content = await fs.readFile(STATE_PATH, "utf8");
    const state = JSON.parse(content);

    if (
        state.account !== USER_LOGIN ||
        state.user_id !== USER_ID ||
        !state.observations
    ) {
        throw new Error(
            "O arquivo de estado pertence a outra conta ou é inválido."
        );
    }

    return state;
}

async function getObservationPage(page) {
    const params = new URLSearchParams({
        user_id: String(USER_ID),
        order_by: "created_at",
        order: "desc",
        per_page: String(PER_PAGE),
        page: String(page),
        photos: "true",
    });

    const response = await fetchWithRetry(
        `${API_URL}?${params}`,
        `Página ${page}`
    );

    return response.json();
}

function updateObservation(existing, observation) {
    const photos = existing.photos || {};

    return {
        ...existing,

        id: observation.id,

        species:
            observation.taxon?.name ||
            existing.species ||
            null,

        common_name:
            observation.taxon?.preferred_common_name ||
            null,

        taxon_id:
            observation.taxon?.id ||
            null,

        taxon_rank:
            observation.taxon?.rank ||
            null,

        iconic_taxon_name:
            observation.taxon?.iconic_taxon_name ||
            null,

        observed_on:
            observation.observed_on ||
            null,

        created_at:
            observation.created_at ||
            null,

        place_guess:
            observation.place_guess ||
            null,

        description:
            observation.description ||
            null,

        quality_grade:
            observation.quality_grade ||
            null,

        threatened:
            observation.taxon?.threatened ?? null,

        native:
            observation.taxon?.native ?? null,

        introduced:
            observation.taxon?.introduced ?? null,

        observation_url:
            observation.uri ||
            `https://www.inaturalist.org/observations/${observation.id}`,

        photos,
    };
}

function buildReport(state) {
    const observations = Object.values(state.observations);

    const photos = observations.flatMap(
        (observation) =>
            Object.values(observation.photos || {})
    );

    const original = photos.filter(
        (photo) => photo.source === "original"
    ).length;

    const large = photos.filter(
        (photo) => photo.source === "large"
    ).length;

    const ignoredFormat = photos.filter(
        (photo) => photo.status === "ignored_format"
    ).length;

    const failed = photos.filter(
        (photo) => photo.status === "failed"
    ).length;

    return {
        generated_at: new Date().toISOString(),
        account: USER_LOGIN,
        user_id: USER_ID,

        summary: {
            observations: observations.length,
            photos: photos.length,
            original,
            large,
            available: original + large,
            ignored_format: ignoredFormat,
            failed,
        },

        observations,
    };
}

async function main() {
    console.log("========================================");
    console.log("ATUALIZADOR DE METADADOS INATURALIST");
    console.log("========================================");

    const state = await loadState();

    const existingIds = Object.keys(state.observations);

    console.log(`Observações cadastradas: ${existingIds.length}`);

    if (existingIds.length === 0) {
        throw new Error("Nenhuma observação encontrada.");
    }

    const updatedIds = new Set();

    let totalResults = null;
    let pages = 0;

    for (let page = 1; ; page++) {
        console.log("----------------------------------------");
        console.log(`Consultando página ${page}...`);

        const data = await getObservationPage(page);

        if (!Array.isArray(data.results)) {
            throw new Error("Resposta inesperada da API.");
        }

        if (totalResults === null) {
            totalResults = data.total_results;

            console.log(
                `Total informado pela API: ${totalResults}`
            );

            if (totalResults !== existingIds.length) {
                throw new Error(
                    "O total da API é diferente do acervo local. " +
                    "Atualização cancelada para evitar inconsistências."
                );
            }
        }

        for (const observation of data.results) {
            const id = String(observation.id);

            if (!Object.hasOwn(state.observations, id)) {
                throw new Error(
                    `Observação ${id} não existe no acervo local.`
                );
            }

            if (updatedIds.has(id)) {
                throw new Error(
                    `Observação duplicada na API: ${id}`
                );
            }

            const existing = state.observations[id];

            state.observations[id] = updateObservation(
                existing,
                observation
            );

            updatedIds.add(id);
        }

        pages++;

        console.log(
            `Observações atualizadas: ${updatedIds.size}/${existingIds.length}`
        );

        if (updatedIds.size === totalResults) {
            break;
        }

        if (data.results.length === 0) {
            throw new Error(
                "A API retornou uma página vazia antes de concluir."
            );
        }

        await sleep(API_DELAY_MS);
    }

    if (updatedIds.size !== existingIds.length) {
        throw new Error(
            "Nem todas as observações foram atualizadas."
        );
    }

    console.log("----------------------------------------");
    console.log("Verificando integridade das fotografias...");

    for (const id of existingIds) {
        const observation = state.observations[id];

        if (!observation.photos) {
            throw new Error(
                `Fotografias ausentes na observação ${id}.`
            );
        }
    }

    console.log("Integridade das fotografias confirmada.");

    const report = buildReport(state);

    const errors = report.observations.flatMap(
        (observation) =>
            Object.values(observation.photos || {})
                .filter((photo) => photo.status === "failed")
                .map((photo) => ({
                    observation_id: observation.id,
                    species: observation.species,
                    photo_id: photo.id,
                    error: photo.error,
                }))
    );

    console.log("----------------------------------------");
    console.log("Criando cópias de segurança...");

    await backupFile(STATE_PATH);
    await backupFile(REPORT_PATH);
    await backupFile(ERRORS_PATH);

    state.updated_at = new Date().toISOString();

    console.log("----------------------------------------");
    console.log("Gravando arquivos atualizados...");

    await writeJsonAtomic(STATE_PATH, state);
    await writeJsonAtomic(REPORT_PATH, report);

    await writeJsonAtomic(ERRORS_PATH, {
        generated_at: new Date().toISOString(),
        total_errors: errors.length,
        errors,
    });

    console.log("========================================");
    console.log("ATUALIZAÇÃO CONCLUÍDA");
    console.log("========================================");
    console.log(`Observações: ${updatedIds.size}`);
    console.log(`Páginas consultadas: ${pages}`);
    console.log(`Fotos preservadas: ${report.summary.photos}`);
    console.log(`Fotos disponíveis: ${report.summary.available}`);
    console.log(`GIFs ignorados: ${report.summary.ignored_format}`);
    console.log(`Falhas: ${report.summary.failed}`);
    console.log("Coordenadas geográficas: não armazenadas.");
}

main().catch((error) => {
    console.error("----------------------------------------");
    console.error("ERRO NA ATUALIZAÇÃO:");
    console.error(error.message);
    process.exitCode = 1;
});
